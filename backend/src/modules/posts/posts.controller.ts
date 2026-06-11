import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { FeedQueryDto } from './dto/feed-query.dto';

@ApiTags('Posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(private posts: PostsService) {}

  // Posting (photo Posts + video Reels) is an athlete-only affordance.
  // The Feed center "+" is already hidden from non-athletes by
  // app/(tabs)/_layout.tsx, and /post-create redirects them out, but
  // both are client-side: a recruiter/parent could still replay their
  // JWT to POST /posts and land a post in the global feed. The
  // @Roles guard runs server-side via the global APP_GUARD, closing
  // that hole. Feed reads, likes, and comments stay open to all roles.
  @Post()
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Create a post or reel (athletes only)' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.posts.create(userId, dto);
  }

  @Get('feed')
  @ApiOperation({ summary: 'Global feed (newest first)' })
  feed(@CurrentUser('id') userId: string, @Query() q: FeedQueryDto) {
    return this.posts.getFeed(userId, q.kind, q.page ?? 1, q.limit ?? 20);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: "List a user's posts" })
  userPosts(
    @CurrentUser('id') viewerId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Query('kind') kind?: 'post' | 'reel',
  ) {
    return this.posts.getUserPosts(viewerId, targetUserId, kind);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete own post' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.posts.deletePost(userId, id);
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Like a post (idempotent)' })
  like(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.posts.like(userId, id);
  }

  @Delete(':id/like')
  @ApiOperation({ summary: 'Unlike a post' })
  unlike(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.posts.unlike(userId, id);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Top-level comments with their one-level replies' })
  getComments(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.posts.getComments(userId, id);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment or one-level reply' })
  addComment(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.posts.addComment(userId, id, dto);
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete own comment' })
  async deleteComment(
    @CurrentUser('id') userId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    await this.posts.deleteComment(userId, commentId);
  }

  @Post('comments/:commentId/like')
  @ApiOperation({ summary: 'Like a comment (idempotent)' })
  likeComment(
    @CurrentUser('id') userId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.posts.likeComment(userId, commentId);
  }

  @Delete('comments/:commentId/like')
  @ApiOperation({ summary: 'Unlike a comment' })
  unlikeComment(
    @CurrentUser('id') userId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.posts.unlikeComment(userId, commentId);
  }
}
