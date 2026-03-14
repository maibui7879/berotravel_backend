// src/modules/forum/forum.service.ts

import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ForumPost, ForumComment, PostStatus, PostSortBy, ForumTag } from '../entities/forum.entity';
import { ForumReport, ReportStatus } from '../entities/forum-report.entity';
import { CreatePostDto, CreateCommentDto, PostSearchFilterDto } from '../dto/forum.dto';
import { ReportPostDto } from '../dto/forum-report.dto';
import { NotificationsService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/entities/notification.entity';
import { UserProfileService } from '../../users/services/user-profile.service';
import { UserActionType } from '../../../common/constants';
import { Journey } from '../../journey/entities/journey.entity';

@Injectable()
export class ForumService {
  constructor(
    @InjectRepository(ForumPost) private readonly postRepo: MongoRepository<ForumPost>,
    @InjectRepository(ForumComment) private readonly commentRepo: MongoRepository<ForumComment>,
    @InjectRepository(ForumTag) private readonly tagRepo: MongoRepository<ForumTag>,
    @InjectRepository(ForumReport) private readonly reportRepo: MongoRepository<ForumReport>,
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
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

    // Use aggregation pipeline with $lookup to fetch author data
    const pipeline: any[] = [
      { $match: query },
      {
        $addFields: {
          author_id_obj: { $toObjectId: '$author_id' }
        }
      },
      {
        $lookup: {
          from: 'users', // Fixed collection name
          localField: 'author_id_obj',
          foreignField: '_id',
          as: 'authorDetails'
        }
      },
      {
        $unwind: {
          path: '$authorDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          content: 1,
          images: 1,
          category: 1,
          tag_ids: 1,
          place_ids: 1,
          journey_id: 1,
          stats: 1,
          is_pinned: 1,
          reports_count: 1,
          status: 1,
          created_at: 1,
          updated_at: 1,
          author: {
            id: '$authorDetails._id',
            fullName: '$authorDetails.fullName',
            avatar: '$authorDetails.avatar'
          }
        }
      },
      { $sort: sortOrder },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ];

    // Fetch total count
    const countPipeline = [
      { $match: query },
      { $count: 'total' }
    ];

    const [data, countResult] = await Promise.all([
      this.postRepo.aggregate(pipeline).toArray(),
      this.postRepo.aggregate(countPipeline).toArray()
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;

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

    // Fetch comment with author info using aggregation
    const commentWithAuthor = await this.commentRepo.aggregate([
      { $match: { _id: new ObjectId(savedComment._id.toString()) } },
      {
        $addFields: {
          author_id_obj: { $toObjectId: '$author_id' }
        }
      },
      {
        $lookup: {
          from: 'users', // Fixed collection name
          localField: 'author_id_obj',
          foreignField: '_id',
          as: 'authorDetails'
        }
      },
      {
        $unwind: {
          path: '$authorDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          post_id: 1,
          content: 1,
          parent_id: 1,
          liked_by: 1,
          created_at: 1,
          author: {
            id: '$authorDetails._id',
            fullName: '$authorDetails.fullName',
            avatar: '$authorDetails.avatar'
          }
        }
      }
    ]).toArray();

    return commentWithAuthor.length > 0 ? commentWithAuthor[0] : savedComment;
  }

  async remove(postId: string, userId: string, isAdmin: boolean) {
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
    if (!post) throw new NotFoundException();
    
    if (post.author_id !== userId && !isAdmin) {
      throw new ForbiddenException('Bạn không có quyền xóa bài này');
    }
    
    return await this.postRepo.delete(new ObjectId(postId));
  }

  /**
   * Lấy chi tiết bài viết kèm theo thông tin tóm tắt hành trình (nếu có) và các bình luận
   */
  async getPostDetail(postId: string, userId?: string) {
    // Fetch post with author info using aggregation
    const postData = await this.postRepo.aggregate([
      { $match: { _id: new ObjectId(postId) } },
      {
        $addFields: {
          author_id_obj: { $toObjectId: '$author_id' }
        }
      },
      {
        $lookup: {
          from: 'users', // Fixed collection name
          localField: 'author_id_obj',
          foreignField: '_id',
          as: 'authorDetails'
        }
      },
      {
        $unwind: {
          path: '$authorDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          content: 1,
          images: 1,
          category: 1,
          tag_ids: 1,
          place_ids: 1,
          journey_id: 1,
          stats: 1,
          status: 1,
          is_pinned: 1,
          reports_count: 1,
          created_at: 1,
          updated_at: 1,
          author: {
            id: '$authorDetails._id',
            fullName: '$authorDetails.fullName',
            avatar: '$authorDetails.avatar'
          }
        }
      }
    ]).toArray();

    if (postData.length === 0) {
      throw new NotFoundException('Bài viết không tồn tại');
    }

    const post = postData[0];

    // Tăng lượt xem
    await this.postRepo.update(new ObjectId(postId), { stats: { ...post.stats, views: post.stats.views + 1 } } as any);

    // Lấy thông tin tóm tắt hành trình nếu có journey_id
    let journey_summary: any = null;
    if (post.journey_id) {
      try {
        const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(post.journey_id) } });
        if (journey) {
          journey_summary = {
            journey_id: journey._id.toString(),
            name: journey.name,
            total_days: journey.days?.length || 0,
            start_date: journey.start_date,
            end_date: journey.end_date,
            main_destinations: journey.days
              ?.flatMap(d => d.stops || [])
              ?.slice(0, 3)
              ?.map(s => ({ place_id: s.place_id })) || [],
            total_budget: journey.total_budget,
            members_count: journey.members?.length || 0
          };
        }
      } catch (e) {
        // Ignore if journey not found
      }
    }

    // Fetch comments with author info
    const comments = await this.commentRepo.aggregate([
      { $match: { post_id: postId } },
      {
        $addFields: {
          author_id_obj: { $toObjectId: '$author_id' }
        }
      },
      {
        $lookup: {
          from: 'users', // Fixed collection name
          localField: 'author_id_obj',
          foreignField: '_id',
          as: 'authorDetails'
        }
      },
      {
        $unwind: {
          path: '$authorDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          post_id: 1,
          content: 1,
          parent_id: 1,
          liked_by: 1,
          created_at: 1,
          author: {
            id: '$authorDetails._id',
            fullName: '$authorDetails.fullName',
            avatar: '$authorDetails.avatar'
          }
        }
      },
      { $sort: { created_at: -1 } }
    ]).toArray();

    return {
      ...post,
      comments,
      journey_summary
    };
  }

  /**
   * Báo cáo bài viết vi phạm
   */
  async reportPost(postId: string, reporterId: string, dto: ReportPostDto) {
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');

    // Kiểm tra xem người này đã báo cáo bài này trước đó chưa
    const existingReport = await this.reportRepo.findOne({
      where: {
        post_id: postId,
        reporter_id: reporterId
      }
    });

    if (existingReport && existingReport.status === ReportStatus.PENDING) {
      throw new BadRequestException('Bạn đã báo cáo bài viết này rồi, vui lòng chờ xử lý');
    }

    const report = this.reportRepo.create({
      post_id: postId,
      reporter_id: reporterId,
      author_id: post.author_id,
      reason: dto.reason,
      description: dto.description,
      status: ReportStatus.PENDING
    });

    const savedReport = await this.reportRepo.save(report);

    // Tăng số báo cáo
    post.reports_count = (post.reports_count || 0) + 1;
    await this.postRepo.save(post);

    // Gửi thông báo cho Admin
    await this.notificationsService.createAndSend({
      recipient_id: 'admin', // Hoặc gửi cho tất cả admins
      sender_id: reporterId,
      type: NotificationType.SYSTEM,
      title: 'Báo cáo bài viết',
      message: `Bài viết "${post.title}" đã bị báo cáo vì: ${dto.reason}`,
      metadata: { post_id: postId, report_id: savedReport._id.toString() }
    });

    return {
      success: true,
      message: 'Báo cáo đã được gửi. Cảm ơn bạn đã giúp chúng tôi xây dựng cộng đồng lành mạnh!',
      report_id: savedReport._id.toString()
    };
  }
}