import api from "./api";

export type PostKind = "post" | "reel";
export type MediaType = "image" | "video";

export interface PostAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface PostItem {
  id: string;
  kind: PostKind;
  mediaUrl: string;
  mediaType: MediaType;
  thumbnailUrl: string | null;
  caption: string | null;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  createdAt: string;
  author: PostAuthor | null;
}

export interface CommentItem {
  id: string;
  text: string;
  createdAt: string;
  likesCount: number;
  likedByMe: boolean;
  author: PostAuthor | null;
  replies?: CommentItem[];
}

export const postsService = {
  async createPost(input: {
    kind: PostKind;
    mediaUrl: string;
    mediaType: MediaType;
    thumbnailUrl?: string;
    caption?: string;
  }): Promise<PostItem> {
    const { data } = await api.post("/posts", input);
    return data.data;
  },

  async getFeed(
    kind?: PostKind,
    page = 1,
    limit = 20,
  ): Promise<{ posts: PostItem[]; hasMore: boolean }> {
    const { data } = await api.get("/posts/feed", {
      params: { kind, page, limit },
    });
    return data.data;
  },

  async getUserPosts(
    userId: string,
    kind?: PostKind,
  ): Promise<{ posts: PostItem[] }> {
    const { data } = await api.get(`/posts/user/${userId}`, {
      params: { kind },
    });
    return data.data;
  },

  async deletePost(postId: string): Promise<void> {
    await api.delete(`/posts/${postId}`);
  },

  async likePost(postId: string): Promise<{ liked: true }> {
    const { data } = await api.post(`/posts/${postId}/like`);
    return data.data;
  },

  async unlikePost(postId: string): Promise<{ liked: false }> {
    const { data } = await api.delete(`/posts/${postId}/like`);
    return data.data;
  },

  async getComments(postId: string): Promise<CommentItem[]> {
    const { data } = await api.get(`/posts/${postId}/comments`);
    return data.data;
  },

  async addComment(
    postId: string,
    text: string,
    parentId?: string,
  ): Promise<CommentItem> {
    const { data } = await api.post(`/posts/${postId}/comments`, {
      text,
      parentId,
    });
    return data.data;
  },

  async deleteComment(commentId: string): Promise<void> {
    await api.delete(`/posts/comments/${commentId}`);
  },

  async likeComment(commentId: string): Promise<{ liked: true }> {
    const { data } = await api.post(`/posts/comments/${commentId}/like`);
    return data.data;
  },

  async unlikeComment(commentId: string): Promise<{ liked: false }> {
    const { data } = await api.delete(`/posts/comments/${commentId}/like`);
    return data.data;
  },

  // ---- Saved / bookmarks ----
  // Same null-safe contract as the rankings client: the UI can fire and
  // forget these on a tap and the worst case is a stale chip state on
  // the affected tile until the next refresh.

  async savePost(postId: string): Promise<{ saved: true } | null> {
    try {
      const { data } = await api.post(`/posts/${postId}/save`);
      return data.data;
    } catch {
      return null;
    }
  },

  async unsavePost(postId: string): Promise<{ saved: false } | null> {
    try {
      const { data } = await api.delete(`/posts/${postId}/save`);
      return data.data;
    } catch {
      return null;
    }
  },

  async getSavedPosts(): Promise<{ posts: PostItem[] }> {
    try {
      const { data } = await api.get("/posts/saved");
      return data.data;
    } catch {
      return { posts: [] };
    }
  },
};
