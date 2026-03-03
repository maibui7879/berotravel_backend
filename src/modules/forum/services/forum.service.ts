// src/modules/forum/forum.service.ts

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ForumPost, ForumComment, PostStatus, PostSortBy, ForumTag } from '../entities/forum.entity';
import { CreatePostDto, CreateCommentDto, PostSearchFilterDto } from '../dto/forum.dto';
import { NotificationsService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/entities/notification.entity';
import { UserProfileService } from '../../users/services/user-profile.service';
import { UserActionType } from 'src/common/constants';

@Injectable()
export class ForumService {
  constructor(
    @InjectRepository(ForumPost) private readonly postRepo: MongoRepository<ForumPost>,
    @InjectRepository(ForumComment) private readonly commentRepo: MongoRepository<ForumComment>,
    @InjectRepository(ForumTag) private readonly tagRepo: MongoRepository<ForumTag>,
    private readonly notificationsService: NotificationsService,
    private readonly userProfileService: UserProfileService,
    
  ) {}

  private extractHashtags(title: string, content: string): string[] {
    const combinedText = `${title} ${content}`;
    const regex = /#(\w+)/g;
    const matches = combinedText.match(regex);
    if (!matches) return [];
    
    // Chuyển về chữ thường, bỏ dấu # và xóa trùng lặp
    return [...new Set(matches.map(tag => tag.slice(1).toLowerCase()))];
  }

  /**
   * Tìm hoặc tạo mới Tag, trả về mảng IDs
   */
  private async syncTags(tagNames: string[]): Promise<string[]> {
    const tagIds: string[] = [];

    for (const name of tagNames) {
      let tag = await this.tagRepo.findOne({ where: { name } });
      
      if (!tag) {
        tag = this.tagRepo.create({ name, use_count: 1 });
        await this.tagRepo.save(tag);
      } else {
        tag.use_count += 1;
        await this.tagRepo.save(tag);
      }
      
      tagIds.push(tag._id.toString());
    }
    return tagIds;
  }

  async create(dto: CreatePostDto, userId: string) {
    const hashtags = this.extractHashtags(dto.title, dto.content);

    const autoTagIds = await this.syncTags(hashtags);
    const post = this.postRepo.create({
      ...dto,
      author_id: userId,
      tag_ids: autoTagIds,
      liked_by: [],
      stats: { likes: 0, views: 0, comments: 0 }
    });
    const savedPost = await this.postRepo.save(post);

    await this.userProfileService.scoreAction(userId, savedPost._id.toString(), UserActionType.POST_CONTENT);
    return savedPost;
  }

  async findAll(filter: PostSearchFilterDto) {
    const { search, category, place_id, author_id, tag_id, sortBy, page = 1, limit = 10 } = filter;

    const query: any = { status: PostStatus.PUBLISHED };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) query.category = category;
    if (author_id) query.author_id = author_id;
    if (place_id) query.place_ids = { $in: [place_id] };
    if (tag_id) query.tag_ids = { $in: [tag_id] };

    let sortOrder: any = { is_pinned: -1 }; 

    switch (sortBy) {
      case PostSortBy.POPULAR:
        sortOrder = { ...sortOrder, 'stats.likes': -1, created_at: -1 };
        break;
      case PostSortBy.TRENDING:
        sortOrder = { ...sortOrder, 'stats.comments': -1, 'stats.views': -1 };
        break;
      case PostSortBy.LATEST:
      default:
        sortOrder = { ...sortOrder, created_at: -1 };
        break;
    }

    // 3. Thực thi Query với phân trang
    const [data, total] = await this.postRepo.findAndCount({
      where: query,
      order: sortOrder,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        last_page: Math.ceil(total / limit),
      }
    };
  }

  async toggleLike(postId: string, userId: string) {
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');

    const index = post.liked_by.indexOf(userId);
    if (index === -1) {
      post.liked_by.push(userId);
      // Gửi thông báo cho tác giả
      if (post.author_id !== userId) {
        this.notificationsService.createAndSend({
          recipient_id: post.author_id,
          sender_id: userId,
          type: NotificationType.SYSTEM,
          title: 'Tương tác mới',
          message: `Ai đó đã thích bài viết "${post.title}" của bạn`,
          metadata: { post_id: postId }
        });
      }
    } else {
      post.liked_by.splice(index, 1);
    }

    post.stats.likes = post.liked_by.length;
    return await this.postRepo.save(post);
  }

  async addComment(postId: string, dto: CreateCommentDto, userId: string) {
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');

    const comment = this.commentRepo.create({
      ...dto,
      post_id: postId,
      author_id: userId,
      liked_by: []
    });
    
    const savedComment = await this.commentRepo.save(comment);

    post.stats.comments += 1;
    await this.postRepo.save(post);

    return savedComment;
  }

  async remove(postId: string, userId: string, isAdmin: boolean) {
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
    if (!post) throw new NotFoundException();
    
    if (post.author_id !== userId && !isAdmin) {
      throw new ForbiddenException('Bạn không có quyền xóa bài này');
    }
    
    return await this.postRepo.delete(new ObjectId(postId));
  }
}