// src/modules/forum/services/forum.service.ts

import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ForumPost, ForumComment, PostStatus, PostSortBy, ForumTag } from '../entities/forum.entity';
import { ForumReport, ReportStatus } from '../entities/forum-report.entity';
import { CreatePostDto, CreateCommentDto, PostSearchFilterDto, UpdatePostDto } from '../dto/forum.dto';
import { UpdateForumDto } from '../dto/update-forum.dto';
import { ReportPostDto } from '../dto/forum-report.dto';
import { NotificationsService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/entities/notification.entity';
import { UserProfileService } from '../../users/services/user-profile.service';
import { UserActionType } from '../../../common/constants';
import { Journey, JourneyVisibility } from '../../journey/entities/journey.entity';
import { Place } from '../../places/entities/place.entity';

@Injectable()
export class ForumService {
  constructor(
    @InjectRepository(ForumPost) private readonly postRepo: MongoRepository<ForumPost>,
    @InjectRepository(ForumComment) private readonly commentRepo: MongoRepository<ForumComment>,
    @InjectRepository(ForumTag) private readonly tagRepo: MongoRepository<ForumTag>,
    @InjectRepository(ForumReport) private readonly reportRepo: MongoRepository<ForumReport>,
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
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
   * Lấy danh sách Tag có phân trang và tùy chọn thịnh hành (trending)
   */
  async getAllTags(page: number = 1, limit: number = 10, trending: boolean = false) {
    const skip = (page - 1) * limit;
    const sortOrder: any = trending ? { use_count: -1 } : { created_at: -1 };

    const [data, total] = await Promise.all([
      this.tagRepo.find({
        order: sortOrder,
        skip,
        take: limit,
      }),
      this.tagRepo.count(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        last_page: Math.ceil(total / limit),
      },
    };
  }

  async getTagById(id: string) {
    const tag = await this.tagRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!tag) throw new NotFoundException('Tag không tồn tại');
    return tag;
  }

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

  /**
   * Hàm helper dùng chung để validate Journey và Places
   */
  private async validateJourneyAndPlaces(journeyId?: string, placeIds?: string[]) {
    // 1. Validate Journey
    if (journeyId) {
      if (!ObjectId.isValid(journeyId)) {
        throw new BadRequestException('ID hành trình không hợp lệ');
      }
      const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
      
      if (!journey) {
        throw new NotFoundException('Hành trình không tồn tại');
      }
      
      if (journey.visibility !== JourneyVisibility.PUBLIC) {
        throw new BadRequestException('Hành trình phải ở trạng thái công khai (PUBLIC) để chia sẻ lên diễn đàn');
      }
    }

    // 2. Validate Places
    if (placeIds && placeIds.length > 0) {
      const validPlaceIds = placeIds.map(id => {
        if (!ObjectId.isValid(id)) {
          throw new BadRequestException(`ID địa điểm không hợp lệ: ${id}`);
        }
        return new ObjectId(id);
      });

      const existingPlacesCount = await this.placeRepo.count({
        _id: { $in: validPlaceIds }
      } as any);

      if (existingPlacesCount !== validPlaceIds.length) {
        throw new BadRequestException('Một hoặc nhiều địa điểm gắn kèm không tồn tại trong hệ thống');
      }
    }
  }

  async create(dto: CreatePostDto, userId: string) {
    // Gọi hàm validate trước khi xử lý logic tạo bài
    await this.validateJourneyAndPlaces(dto.journey_id, dto.place_ids);

    const hashtags = this.extractHashtags(dto.title, dto.content);

    const autoTagIds = await this.syncTags(hashtags);
    const post = this.postRepo.create({
      ...dto,
      author_id: userId,
      tag_ids: autoTagIds,
      status: dto.status || PostStatus.PUBLISHED,
      is_pinned: dto.is_pinned || false,
      liked_by: [],
      stats: { likes: 0, views: 0, comments: 0 }
    });
    const savedPost = await this.postRepo.save(post);

    await this.userProfileService.scoreAction(userId, savedPost._id.toString(), UserActionType.POST_CONTENT);
    return savedPost;
  }

  /**
   * Cập nhật bài viết với validation cho journey và places
   */
  async updatePost(postId: string, userId: string, dto: UpdatePostDto) {
    // 1. Tìm bài viết và kiểm tra quyền
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');
    
    if (post.author_id !== userId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa bài viết này');
    }

    // 2. Validate lại Journey và Places nếu payload có gửi lên
    if (dto.journey_id !== undefined || dto.place_ids !== undefined) {
      const checkJourneyId = dto.journey_id !== undefined ? dto.journey_id : post.journey_id;
      const checkPlaceIds = dto.place_ids !== undefined ? dto.place_ids : post.place_ids;
      await this.validateJourneyAndPlaces(checkJourneyId, checkPlaceIds);
    }

    // 3. Xử lý cập nhật lại Hashtags nếu Title hoặc Content bị thay đổi
    if (dto.title || dto.content) {
      const newTitle = dto.title || post.title;
      const newContent = dto.content || post.content;
      const hashtags = this.extractHashtags(newTitle, newContent);
      const autoTagIds = await this.syncTags(hashtags);
      post.tag_ids = autoTagIds;
    }

    // 4. Ghi đè các trường mới vào bài viết hiện tại
    Object.assign(post, dto);

    // Lưu lại vào DB (Trường updated_at sẽ tự động cập nhật nhờ @UpdateDateColumn trong Entity)
    return await this.postRepo.save(post);
  }

  async findAll(filter: PostSearchFilterDto) {
    const { search, category, place_id, author_id, tag, sortBy, page = 1, limit = 10 } = filter;
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
    
    if (tag) {
      const matchedTags = await this.tagRepo.find({
        where: { name: { $regex: tag, $options: 'i' } as any }
      });

      if (matchedTags.length > 0) {
        query.tag_ids = { $in: matchedTags.map(t => t._id.toString()) };
      } else {
        query.tag_ids = { $in: [] }; 
      }
    }

    let sortOrder: any = { is_pinned: -1 }; 

    switch (sortBy) {
      case PostSortBy.POPULAR:
        sortOrder = { ...sortOrder, 'stats.likes': -1, created_at: -1 };
        break;
      case PostSortBy.TRENDING:
        sortOrder = { ...sortOrder, 'stats.comments': -1, 'stats.views': -1 };
        break;
      default:
        sortOrder = { ...sortOrder, created_at: -1 };
        break;
    }

    const pipeline: any[] = [
      { $match: query },
      {
        $addFields: {
          author_id_obj: { $toObjectId: '$author_id' },
          tag_ids_obj: { $map: { input: { $ifNull: ['$tag_ids', []] }, as: 'id', in: { $toObjectId: '$$id' } } },
          place_ids_obj: { $map: { input: { $ifNull: ['$place_ids', []] }, as: 'id', in: { $toObjectId: '$$id' } } },
          journey_id_obj: { 
            $cond: [
              { $and: [{ $gt: ['$journey_id', null] }, { $ne: ['$journey_id', ''] }] },
              { $toObjectId: '$journey_id' },
              null
            ]
          }
        }
      },
      { $lookup: { from: 'users', localField: 'author_id_obj', foreignField: '_id', as: 'authorData' } },
      { $lookup: { from: 'forum_tags', localField: 'tag_ids_obj', foreignField: '_id', as: 'tagData' } },
      { $lookup: { from: 'places', localField: 'place_ids_obj', foreignField: '_id', as: 'placeData' } },
      { $lookup: { from: 'journeys', localField: 'journey_id_obj', foreignField: '_id', as: 'journeyData' } },
      { $unwind: { path: '$authorData', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$journeyData', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1, title: 1, content: 1, images: 1, category: 1, stats: 1, is_pinned: 1, reports_count: 1, status: 1, created_at: 1, updated_at: 1, location: 1, find_buddy_details: 1,
          author: { id: '$authorData._id', fullName: '$authorData.fullName', avatar: '$authorData.avatar' },
          tags: { $map: { input: '$tagData', as: 't', in: { id: '$$t._id', name: '$$t.name' } } },
          places: { 
            $map: { 
              input: '$placeData', 
              as: 'p', 
              in: { id: '$$p._id', name: '$$p.name', image: { $arrayElemAt: [{ $ifNull: ['$$p.images', []] }, 0] } } 
            } 
          },
          journey: { id: '$journeyData._id', name: '$journeyData.name' }
        }
      },
      { $sort: sortOrder },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ];

    const [data, countResult] = await Promise.all([
      this.postRepo.aggregate(pipeline).toArray(),
      this.postRepo.aggregate([{ $match: query }, { $count: 'total' }]).toArray()
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;

    return {
      data,
      meta: { total, page, limit, last_page: Math.ceil(total / limit) }
    };
  }

  async toggleLike(postId: string, userId: string) {
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');

    const index = post.liked_by.indexOf(userId);
    if (index === -1) {
      post.liked_by.push(userId);
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
  // 1. Kiểm tra bài viết tồn tại
  const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
  if (!post) throw new NotFoundException('Bài viết không tồn tại');

  // 2. Nếu có parent_id, kiểm tra bình luận cha có tồn tại không
  if (dto.parent_id) {
    if (!ObjectId.isValid(dto.parent_id)) {
      throw new BadRequestException('ID bình luận gốc không hợp lệ');
    }
    const parentComment = await this.commentRepo.findOne({ where: { _id: new ObjectId(dto.parent_id) } });
    if (!parentComment) throw new NotFoundException('Bình luận gốc không tồn tại');
  }

  // 3. Khởi tạo comment (Gán tường minh dto.parent_id để tránh lỗi TypeORM Mongo bỏ qua trường)
  const comment = this.commentRepo.create({ 
    content: dto.content,
    parent_id: dto.parent_id , 
    post_id: postId, 
    author_id: userId, 
    liked_by: [] 
  });
  
  const savedComment = await this.commentRepo.save(comment);

  // 4. Tăng số lượng comment của bài viết
  post.stats.comments += 1;
  await this.postRepo.save(post);

  // 5. Query lấy dữ liệu trả về kèm author
  const commentWithAuthor = await this.commentRepo.aggregate([
    { $match: { _id: new ObjectId(savedComment._id.toString()) } },
    { $addFields: { author_id_obj: { $toObjectId: '$author_id' } } },
    { $lookup: { from: 'users', localField: 'author_id_obj', foreignField: '_id', as: 'authorData' } },
    { $unwind: { path: '$authorData', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, post_id: 1, content: 1, parent_id: 1, liked_by: 1, created_at: 1,
        author: { id: '$authorData._id', fullName: '$authorData.fullName', avatar: '$authorData.avatar' }
      }
    }
  ]).toArray();

  return commentWithAuthor.length > 0 ? commentWithAuthor[0] : savedComment;
}

  /**
   * Cập nhật bình luận
   */
  async updateComment(commentId: string, userId: string, dto: CreateCommentDto) {
    const comment = await this.commentRepo.findOne({ where: { _id: new ObjectId(commentId) } });
    if (!comment) throw new NotFoundException('Bình luận không tồn tại');
    
    if (comment.author_id !== userId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa bình luận này');
    }

    comment.content = dto.content;
    return await this.commentRepo.save(comment);
  }

  /**
   * Xóa bình luận
   */
  async removeComment(commentId: string, userId: string, isAdmin: boolean) {
    const comment = await this.commentRepo.findOne({ where: { _id: new ObjectId(commentId) } });
    if (!comment) throw new NotFoundException('Bình luận không tồn tại');

    // Lấy thông tin post để kiểm tra xem user có phải là chủ bài viết không
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(comment.post_id) } });
    
    const isCommentAuthor = comment.author_id === userId;
    const isPostAuthor = post && post.author_id === userId;

    // Quyền xóa: Tác giả bình luận, Tác giả bài viết chứa bình luận đó, hoặc Admin
    if (!isCommentAuthor && !isPostAuthor && !isAdmin) {
      throw new ForbiddenException('Bạn không có quyền xóa bình luận này');
    }

    await this.commentRepo.delete(new ObjectId(commentId));

    // Cập nhật lại số lượng comment của bài viết
    if (post && post.stats.comments > 0) {
      post.stats.comments -= 1;
      await this.postRepo.save(post);
    }

    return { success: true, message: 'Đã xóa bình luận' };
  }

  /**
   * Like / Unlike bình luận
   */
  async toggleCommentLike(commentId: string, userId: string) {
    const comment = await this.commentRepo.findOne({ where: { _id: new ObjectId(commentId) } });
    if (!comment) throw new NotFoundException('Bình luận không tồn tại');

    const index = comment.liked_by.indexOf(userId);
    if (index === -1) {
      comment.liked_by.push(userId);
      // (Tùy chọn) Gửi thông báo cho chủ comment ở đây tương tự như bài đăng
      if (comment.author_id !== userId) {
        this.notificationsService.createAndSend({
          recipient_id: comment.author_id,
          sender_id: userId,
          type: NotificationType.SYSTEM,
          title: 'Tương tác mới',
          message: `Ai đó đã thích bình luận của bạn`,
          metadata: { comment_id: commentId, post_id: comment.post_id }
        });
      }
    } else {
      comment.liked_by.splice(index, 1);
    }

    return await this.commentRepo.save(comment);
  }

  async remove(postId: string, userId: string, isAdmin: boolean) {
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');
    
    if (post.author_id !== userId && !isAdmin) {
      throw new ForbiddenException('Bạn không có quyền xóa bài này');
    }
    
    return await this.postRepo.delete(new ObjectId(postId));
  }

  /**
   * Lấy chi tiết bài viết kèm theo thông tin tóm tắt hành trình và các bình luận
   */
  async getPostDetail(postId: string, userId?: string) {
    const pipeline: any[] = [
      { $match: { _id: new ObjectId(postId) } },
      {
        $addFields: {
          author_id_obj: { $toObjectId: '$author_id' },
          tag_ids_obj: { $map: { input: { $ifNull: ['$tag_ids', []] }, as: 'id', in: { $toObjectId: '$$id' } } },
          place_ids_obj: { $map: { input: { $ifNull: ['$place_ids', []] }, as: 'id', in: { $toObjectId: '$$id' } } },
          journey_id_obj: { 
            $cond: [
              { $and: [{ $gt: ['$journey_id', null] }, { $ne: ['$journey_id', ''] }] },
              { $toObjectId: '$journey_id' },
              null
            ]
          }
        }
      },
      { $lookup: { from: 'users', localField: 'author_id_obj', foreignField: '_id', as: 'authorData' } },
      { $lookup: { from: 'forum_tags', localField: 'tag_ids_obj', foreignField: '_id', as: 'tagData' } },
      { $lookup: { from: 'places', localField: 'place_ids_obj', foreignField: '_id', as: 'placeData' } },
      { $lookup: { from: 'journeys', localField: 'journey_id_obj', foreignField: '_id', as: 'journeyData' } },
      { $unwind: { path: '$authorData', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$journeyData', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1, title: 1, content: 1, images: 1, category: 1, stats: 1, status: 1, is_pinned: 1, reports_count: 1, created_at: 1, updated_at: 1, location: 1, find_buddy_details: 1, journey_id: 1,
          author: { id: '$authorData._id', fullName: '$authorData.fullName', avatar: '$authorData.avatar' },
          tags: { $map: { input: '$tagData', as: 't', in: { id: '$$t._id', name: '$$t.name' } } },
          places: { $map: { input: '$placeData', as: 'p', in: { id: '$$p._id', name: '$$p.name', image: { $arrayElemAt: [{ $ifNull: ['$$p.images', []] }, 0] } } } },
          journey: { id: '$journeyData._id', name: '$journeyData.name' }
        }
      }
      
    ];

    const postData = await this.postRepo.aggregate(pipeline).toArray();
    if (postData.length === 0) throw new NotFoundException('Bài viết không tồn tại');

    const post = postData[0];
    await this.postRepo.update(new ObjectId(postId), { stats: { ...post.stats, views: (post.stats?.views || 0) + 1 } } as any);

    // Giữ nguyên logic journey_summary từ code cũ
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
            main_destinations: journey.days?.flatMap(d => d.stops || [])?.slice(0, 3)?.map(s => ({ place_id: s.place_id })) || [],
            total_budget: journey.total_budget,
            members_count: journey.members?.length || 0
          };
        }
      } catch (e) {}
    }

const flatComments = await this.commentRepo.aggregate([
      { $match: { post_id: postId } },
      { $addFields: { author_id_obj: { $toObjectId: '$author_id' } } },
      { $lookup: { from: 'users', localField: 'author_id_obj', foreignField: '_id', as: 'authorData' } },
      { $unwind: { path: '$authorData', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1, post_id: 1, content: 1, parent_id: 1, liked_by: 1, created_at: 1,
          author: { id: '$authorData._id', fullName: '$authorData.fullName', avatar: '$authorData.avatar' }
        }
      },
      { $sort: { created_at: -1 } } // Bình luận mới nhất lên đầu
    ]).toArray();

    // 2. Thuật toán Build Tree (Chuyển Flat Array thành Nested Array)
    const commentMap = new Map();
    const rootComments: any[] = [];

    // Khởi tạo map và thêm field `replies` rỗng cho mọi comment
    flatComments.forEach(comment => {
      comment.replies = [];
      commentMap.set(comment._id.toString(), comment);
    });

    // Lắp ráp các reply vào đúng parent của nó
    flatComments.forEach(comment => {
      // Nếu có parent_id và parent đó tồn tại trong map
      if (comment.parent_id && commentMap.has(comment.parent_id)) {
        const parent = commentMap.get(comment.parent_id);
        parent.replies.push(comment);
      } else {
        // Nếu không có parent_id (là comment gốc), hoặc parent đã bị xóa
        rootComments.push(comment);
      }
    });

    // Tùy chọn UI: Sắp xếp lại thứ tự của các Replies
    // - Comment gốc: Đã sort mới nhất lên đầu (từ Query Mongo)
    // - Replies: Nên sort cũ nhất xếp trước (từ trên xuống dưới) giống Facebook/Tiktok
    rootComments.forEach(root => {
      if (root.replies.length > 0) {
        root.replies.sort((a: any, b: any) => a.created_at.getTime() - b.created_at.getTime());
      }
    });

    return { ...post, comments: rootComments, journey_summary };
  }

  async reportPost(postId: string, reporterId: string, dto: ReportPostDto) {
    const post = await this.postRepo.findOne({ where: { _id: new ObjectId(postId) } });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');

    const existingReport = await this.reportRepo.findOne({
      where: { post_id: postId, reporter_id: reporterId }
    });

    if (existingReport && existingReport.status === ReportStatus.PENDING) {
      throw new BadRequestException('Bạn đã báo cáo bài viết này rồi, vui lòng chờ xử lý');
    }

    const report = this.reportRepo.create({
      post_id: postId, reporter_id: reporterId, author_id: post.author_id,
      reason: dto.reason, description: dto.description, status: ReportStatus.PENDING
    });

    const savedReport = await this.reportRepo.save(report);
    post.reports_count = (post.reports_count || 0) + 1;
    await this.postRepo.save(post);

    await this.notificationsService.createAndSend({
      recipient_id: 'admin',
      sender_id: reporterId,
      type: NotificationType.SYSTEM,
      title: 'Báo cáo bài viết',
      message: `Bài viết "${post.title}" đã bị báo cáo vì: ${dto.reason}`,
      metadata: { post_id: postId, report_id: savedReport._id.toString() }
    });

    return { success: true, message: 'Báo cáo đã được gửi. Cảm ơn bạn!', report_id: savedReport._id.toString() };
  }
}