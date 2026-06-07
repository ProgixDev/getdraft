import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

interface AuthorRow {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

@Injectable()
export class PostsService {
  constructor(private supabaseService: SupabaseService) {}

  // ---- Posts ----

  async create(userId: string, dto: CreatePostDto) {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        kind: dto.kind,
        media_url: dto.mediaUrl,
        media_type: dto.mediaType,
        thumbnail_url: dto.thumbnailUrl ?? null,
        caption: dto.caption ?? null,
      })
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);

    const { data: author } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .eq('id', userId)
      .single();

    return this.shapePost(data, author as AuthorRow | null, false);
  }

  async getFeed(
    viewerId: string,
    kind: 'post' | 'reel' | undefined,
    page: number,
    limit: number,
  ) {
    const supabase = this.supabaseService.getAdminClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let q = supabase
      .from('posts')
      .select(
        '*, author:users!posts_user_id_fkey(id, name, avatar_url)',
      )
      .order('created_at', { ascending: false })
      .range(from, to + 1); // fetch one extra to detect hasMore

    if (kind) q = q.eq('kind', kind);

    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const likedSet = await this.fetchLikedByMe(
      viewerId,
      pageRows.map((r: any) => r.id as string),
    );

    const posts = pageRows.map((row: any) =>
      this.shapePost(row, row.author as AuthorRow | null, likedSet.has(row.id)),
    );

    return { posts, hasMore };
  }

  async getUserPosts(
    viewerId: string,
    targetUserId: string,
    kind?: 'post' | 'reel',
  ) {
    const supabase = this.supabaseService.getAdminClient();
    let q = supabase
      .from('posts')
      .select(
        '*, author:users!posts_user_id_fkey(id, name, avatar_url)',
      )
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (kind) q = q.eq('kind', kind);

    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    const rows = data ?? [];

    const likedSet = await this.fetchLikedByMe(
      viewerId,
      rows.map((r: any) => r.id as string),
    );
    return {
      posts: rows.map((row: any) =>
        this.shapePost(row, row.author as AuthorRow | null, likedSet.has(row.id)),
      ),
    };
  }

  async deletePost(userId: string, postId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data: row, error: fetchErr } = await supabase
      .from('posts')
      .select('id, user_id')
      .eq('id', postId)
      .maybeSingle();
    if (fetchErr) throw new BadRequestException(fetchErr.message);
    if (!row) throw new NotFoundException('Post not found');
    if (row.user_id !== userId) throw new ForbiddenException('Not your post');

    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) throw new BadRequestException(error.message);
  }

  // ---- Likes ----

  async like(userId: string, postId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: userId });
    if (error) {
      // 23505 = unique violation — already liked; treat as idempotent success
      if ((error as any).code === '23505') return { liked: true };
      throw new BadRequestException(error.message);
    }
    return { liked: true };
  }

  async unlike(userId: string, postId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    return { liked: false };
  }

  // ---- Comments ----

  async getComments(viewerId: string, postId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('post_comments')
      .select(
        'id, text, parent_id, likes_count, created_at, author:users!post_comments_user_id_fkey(id, name, avatar_url)',
      )
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);

    const rows = data ?? [];
    const likedSet = await this.fetchLikedCommentsByMe(
      viewerId,
      rows.map((r: any) => r.id as string),
    );

    const tops: any[] = [];
    const repliesByParent = new Map<string, any[]>();
    for (const r of rows) {
      const shaped = this.shapeComment(r, likedSet.has(r.id as string));
      if (r.parent_id) {
        const arr = repliesByParent.get(r.parent_id as string) ?? [];
        arr.push(shaped);
        repliesByParent.set(r.parent_id as string, arr);
      } else {
        tops.push(shaped);
      }
    }
    return tops.map((t) => ({ ...t, replies: repliesByParent.get(t.id) ?? [] }));
  }

  async addComment(userId: string, postId: string, dto: CreateCommentDto) {
    const supabase = this.supabaseService.getAdminClient();

    if (dto.parentId) {
      const { data: parent, error: parentErr } = await supabase
        .from('post_comments')
        .select('id, parent_id, post_id')
        .eq('id', dto.parentId)
        .maybeSingle();
      if (parentErr) throw new BadRequestException(parentErr.message);
      if (!parent) throw new NotFoundException('Parent comment not found');
      if (parent.post_id !== postId)
        throw new BadRequestException('Parent comment is on a different post');
      if (parent.parent_id)
        throw new BadRequestException('Only one level of replies is allowed');
    }

    const { data, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        user_id: userId,
        parent_id: dto.parentId ?? null,
        text: dto.text,
      })
      .select(
        'id, text, parent_id, likes_count, created_at, author:users!post_comments_user_id_fkey(id, name, avatar_url)',
      )
      .single();
    if (error) throw new BadRequestException(error.message);
    return this.shapeComment(data, false);
  }

  async likeComment(userId: string, commentId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { error } = await supabase
      .from('post_comment_likes')
      .insert({ comment_id: commentId, user_id: userId });
    if (error) {
      if ((error as any).code === '23505') return { liked: true };
      throw new BadRequestException(error.message);
    }
    return { liked: true };
  }

  async unlikeComment(userId: string, commentId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { error } = await supabase
      .from('post_comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    return { liked: false };
  }

  async deleteComment(userId: string, commentId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data: row, error: fetchErr } = await supabase
      .from('post_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .maybeSingle();
    if (fetchErr) throw new BadRequestException(fetchErr.message);
    if (!row) throw new NotFoundException('Comment not found');
    if (row.user_id !== userId)
      throw new ForbiddenException('Not your comment');

    const { error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId);
    if (error) throw new BadRequestException(error.message);
  }

  // ---- helpers ----

  private async fetchLikedByMe(viewerId: string, postIds: string[]) {
    if (postIds.length === 0) return new Set<string>();
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', viewerId)
      .in('post_id', postIds);
    if (error) return new Set<string>();
    return new Set<string>((data ?? []).map((r: any) => r.post_id as string));
  }

  private async fetchLikedCommentsByMe(viewerId: string, commentIds: string[]) {
    if (commentIds.length === 0) return new Set<string>();
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('post_comment_likes')
      .select('comment_id')
      .eq('user_id', viewerId)
      .in('comment_id', commentIds);
    if (error) return new Set<string>();
    return new Set<string>((data ?? []).map((r: any) => r.comment_id as string));
  }

  private shapePost(row: any, author: AuthorRow | null, likedByMe: boolean) {
    return {
      id: row.id as string,
      kind: row.kind as 'post' | 'reel',
      mediaUrl: row.media_url as string,
      mediaType: row.media_type as 'image' | 'video',
      thumbnailUrl: row.thumbnail_url as string | null,
      caption: row.caption as string | null,
      likesCount: Number(row.likes_count ?? 0),
      commentsCount: Number(row.comments_count ?? 0),
      likedByMe,
      createdAt: row.created_at as string,
      author: author
        ? {
            id: author.id,
            name: author.name ?? '',
            avatarUrl: author.avatar_url ?? null,
          }
        : null,
    };
  }

  private shapeComment(row: any, likedByMe: boolean) {
    const author = row.author as AuthorRow | null;
    return {
      id: row.id as string,
      text: row.text as string,
      createdAt: row.created_at as string,
      likesCount: Number(row.likes_count ?? 0),
      likedByMe,
      author: author
        ? {
            id: author.id,
            name: author.name ?? '',
            avatarUrl: author.avatar_url ?? null,
          }
        : null,
    };
  }
}
