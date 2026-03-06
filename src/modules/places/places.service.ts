import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { Place } from './entities/place.entity';
import {
  PlaceEditRequest,
  EditRequestStatus,
} from './entities/place-edit-request.entity';
import {
  PlaceClaimRequest,
  ClaimRequestStatus,
} from './entities/place-claim-request.entity';
import { Role, PlaceStatus, UserActionType } from '../../common/constants';
import { SearchPlaceDto, SortBy, SortOrder } from './dto/search-place.dto';
import { CreatePlaceDto } from './dto/create-place.dto';

import { UserProfileService } from '../users/services/user-profile.service';
import { Journey } from '../journey/entities/journey.entity';

interface CurrentUser {
  sub: string;
  role: Role;
}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(
    @InjectRepository(Place)
    private readonly placeRepo: MongoRepository<Place>,
    @InjectRepository(PlaceEditRequest)
    private readonly editRequestRepo: MongoRepository<PlaceEditRequest>,
    @InjectRepository(PlaceClaimRequest)
    private readonly claimRequestRepo: MongoRepository<PlaceClaimRequest>,
    @InjectRepository(Journey)
    private readonly journeyRepo: MongoRepository<Journey>,
    private readonly userProfileService: UserProfileService,
  ) {}

  // ==========================================
  // 1. CREATE LOGIC (CẬP NHẬT TÁCH BIỆT LUỒNG)
  // ==========================================
  async create(dto: CreatePlaceDto, user: any) {
    const { location, is_owner, ...rest } = dto;

    let isPartner = false;
    let ownerId = null;

    // QUY TẮC RẼ NHÁNH:
    // - Nếu là Merchant và claim chủ sở hữu (is_owner: true) -> is_partner: true
    // - Nếu là User hoặc Merchant không claim -> is_partner: false
    if (user.role === Role.MERCHANT && is_owner === true) {
      isPartner = true;
      ownerId = user.sub;
    } else {
      isPartner = false;
      ownerId = null;
      // Cảnh báo nếu User cố tình claim owner
      if (user.role === Role.USER && is_owner === true) {
        this.logger.warn(`User ${user.sub} attempted to claim ownership without MERCHANT role.`);
      }
    }

    try {
      const place = this.placeRepo.create({
        ...rest,
        location: {
          type: 'Point',
          coordinates: [Number(location.lng), Number(location.lat)],
        },
        images: dto.images || [],
        tags: dto.tags || [],
        amenities: dto.amenities || [],
        openingHours: dto.openingHours || null,
        is_partner: isPartner,
        ownerId: ownerId,
        createdBy: user.sub,
        estimated_cost_vnd: dto.estimated_cost_vnd || 0,
        status: PlaceStatus.PENDING, // Mọi địa điểm mới đều chờ Admin duyệt
      });

      const savedPlace = await this.placeRepo.save(place);

      return {
        message: isPartner
          ? 'Yêu cầu đăng ký kinh doanh đã gửi, đang chờ Admin duyệt thông tin chủ sở hữu.'
          : 'Địa điểm đóng góp đã được gửi và đang chờ phê duyệt nội dung.',
        data: savedPlace,
      };
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Lỗi server khi lưu địa điểm');
    }
  }

  // ==========================================
  // 2. READ LOGIC (SEARCH ENGINE)
  // ==========================================
async findAll(query: SearchPlaceDto, userId?: string) {
    const {
      name,
      category,
      tags,
      page = 1,
      limit = 10,
      lat,
      lng,
      radius,
      sortBy,
      sortOrder,
      maxCrowd,   // Bổ sung maxCrowd từ SearchPlaceDto
    } = query;

    if (userId && name) {
      this.userProfileService.trackUserSearch(userId, name);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const sortField = sortBy || SortBy.CREATED_AT;
    const order = sortOrder === SortOrder.DESC ? -1 : 1;
    const pipeline: any[] = [];

    // 1. GeoNear (Phải đứng đầu pipeline nếu có tọa độ)
    if (lat !== undefined && lng !== undefined) {
      pipeline.push({
        $geoNear: {
          near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          distanceField: 'distance',
          key: 'location',
          maxDistance: Number(radius) || 10000,
          query: { status: PlaceStatus.APPROVED },
          spherical: true,
        },
      });
    } else {
      pipeline.push({ $match: { status: PlaceStatus.APPROVED } });
      if (sortField === SortBy.DISTANCE) {
        throw new BadRequestException('Phải có lat/lng để sắp xếp theo khoảng cách');
      }
    }

    // 2. Filter Logic (Name & Tags)
    if (name) {
      const keywordRegex = new RegExp(name, 'i');
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: keywordRegex } },
            { tags: { $in: [keywordRegex] } },
          ],
        },
      });
    }

    if (tags) {
      const tagList = tags.split(',').map((tag) => new RegExp(tag.trim(), 'i'));
      pipeline.push({
        $match: { tags: { $in: tagList } },
      });
    }

    if (category) {
      pipeline.push({ $match: { category } });
    }

    // --- MỚI: Logic lọc theo Crowd Level ---
    // Tìm các địa điểm có độ đông đúc nhỏ hơn hoặc bằng mức yêu cầu
    if (maxCrowd !== undefined) {
      pipeline.push({
        $match: { 
          crowdLevel: { $lte: Number(maxCrowd) } 
        }
      });
    }

    // 3. Sorting
    // Logic này tự động xử lý được sortBy: 'crowdLevel' nếu SortBy enum đã có field này
    if (sortField === SortBy.DISTANCE && lat !== undefined) {
      pipeline.push({ $sort: { distance: order } });
    } else {
      pipeline.push({ $sort: { [sortField]: order } });
    }

    // 4. Pagination
    pipeline.push({
      $facet: {
        data: [{ $skip: skip }, { $limit: take }],
        totalCount: [{ $count: 'count' }],
      },
    });

    try {
      const result = await this.placeRepo.aggregate(pipeline).toArray();
      const data = result[0]?.data || [];
      const total = result[0]?.totalCount?.[0]?.count || 0;

      return {
        data,
        meta: {
          total,
          limit: Number(limit),
          page: Number(page),
          last_page: Math.ceil(total / take),
        },
      };
    } catch (error) {
      // Log lỗi chi tiết để debug dễ hơn
      console.error('Aggregate Error:', error);
      throw new InternalServerErrorException('Lỗi database khi tìm kiếm địa điểm');
    }
  }

  async getPendingEditRequests() {
    return await this.editRequestRepo.find({
      where: { status: EditRequestStatus.PENDING },
      order: { created_at: -1 } as any,
    });
  }

  // 2. Từ chối yêu cầu chỉnh sửa
  async rejectEditRequest(requestId: string, reason: string, adminUser: CurrentUser) {
    if (adminUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ Admin mới được thực hiện thao tác này');
    }

    const request = await this.editRequestRepo.findOne({ where: { _id: new ObjectId(requestId) } });
    if (!request) throw new NotFoundException('Yêu cầu không tồn tại');

    request.status = EditRequestStatus.REJECTED;
    request.admin_note = reason;
    await this.editRequestRepo.save(request);

    return { success: true, message: 'Đã từ chối đề xuất chỉnh sửa' };
  }
  
  async findOne(id: string, userId?: string) {
    const place = (await this.placeRepo.findOne({
      where: { _id: new ObjectId(id) },
    })) as Place;
    if (!place) throw new NotFoundException('Không tìm thấy địa điểm');

    if (userId) {
      this.userProfileService.scoreAction(
        userId,
        id,
        UserActionType.VIEW_DETAILS,
      );
    }
    return place;
  }

  // ==========================================
  // 3. UPDATE LOGIC
  // ==========================================
  async update(id: string, dto: any, user: CurrentUser) {
    const place = await this.findOne(id);

    const isOwner = place.ownerId === user.sub;
    const isAdmin = user.role === Role.ADMIN;

    // Chỉ chủ sở hữu hoặc Admin mới được cập nhật trực tiếp
    if (isOwner || isAdmin) {
      const updateData = { ...dto };
      if (dto.location) {
        updateData.location = {
          type: 'Point',
          coordinates: [dto.location.lng, dto.location.lat],
        };
      }
      delete updateData.status;
      await this.placeRepo.update(new ObjectId(id), updateData);
      return await this.findOne(id);
    }

    // User khác cập nhật -> Tạo yêu cầu chỉnh sửa
    delete dto.status;
    const request = this.editRequestRepo.create({
      place_id: id,
      user_id: user.sub,
      update_data: dto,
      status: EditRequestStatus.PENDING,
    });

    await this.editRequestRepo.save(request);
    return {
      message: 'Đề xuất chỉnh sửa của bạn đã được gửi và đang chờ Admin duyệt.',
      request_id: request._id,
    };
  }

  // ==========================================
  // 4. ADMIN APPROVAL LOGIC
  // ==========================================

  async getPendingPlaces() {
    return await this.placeRepo.find({
      where: { status: PlaceStatus.PENDING },
      order: { createdAt: -1 } as any,
    });
  }

  async verifyPlace(
    placeId: string,
    status: PlaceStatus.APPROVED | PlaceStatus.REJECTED,
    adminUser: CurrentUser,
  ) {
    if (adminUser.role !== Role.ADMIN)
      throw new ForbiddenException('Chỉ Admin mới được duyệt');

    const place = await this.placeRepo.findOne({
      where: { _id: new ObjectId(placeId) },
    });
    if (!place) throw new NotFoundException('Địa điểm không tồn tại');

    place.status = status;
    return await this.placeRepo.save(place);
  }

  async approveEditRequest(requestId: string, adminUser: CurrentUser) {
    if (adminUser.role !== Role.ADMIN)
      throw new ForbiddenException('Chỉ Admin mới được duyệt');

    const request = await this.editRequestRepo.findOne({
      where: { _id: new ObjectId(requestId) },
    });
    if (!request) throw new NotFoundException('Yêu cầu không tồn tại');
    if (request.status !== EditRequestStatus.PENDING)
      throw new BadRequestException('Yêu cầu này đã được xử lý');

    const dto = request.update_data;
    const updateData = { ...dto };

    if (dto.location) {
      updateData.location = {
        type: 'Point',
        coordinates: [dto.location.lng, dto.location.lat],
      };
    }

    await this.placeRepo.update(new ObjectId(request.place_id), updateData);

    request.status = EditRequestStatus.APPROVED;
    await this.editRequestRepo.save(request);

    return { success: true, message: 'Đã cập nhật địa điểm theo đề xuất' };
  }

  async remove(id: string, user: CurrentUser) {
    const place = await this.findOne(id);

    if (user.role !== Role.ADMIN && place.ownerId !== user.sub) {
      throw new ForbiddenException('Bạn không có quyền xóa địa điểm này');
    }

    const isUsedInJourney = await this.journeyRepo.findOne({
      where: { 'days.stops.place_id': id } as any,
    });

    if (isUsedInJourney) {
      throw new BadRequestException(
        'Không thể xóa địa điểm này vì nó đang nằm trong lịch trình. Hãy sử dụng tính năng ẩn địa điểm.',
      );
    }

    try {
      await this.placeRepo.delete(new ObjectId(id));
      await this.editRequestRepo.deleteMany({ place_id: id });
      return { success: true, message: 'Đã xóa địa điểm thành công' };
    } catch (error) {
      throw new BadRequestException('Có lỗi xảy ra khi xóa');
    }
  }

  // Helper để cập nhật hàng loạt is_partner cho dữ liệu cũ (Migration)
  async migratePartnerFlag() {
    const result = await this.placeRepo.updateMany(
      { is_partner: { $exists: false } } as any,
      { $set: { is_partner: false } } as any,
    );
    return { updatedCount: result.modifiedCount };
  }

  // ==========================================
  // 5. CLAIM PLACE OWNERSHIP LOGIC
  // ==========================================

  // 1. Merchant gửi yêu cầu claim
  async requestClaim(placeId: string, proofImages: string[], user: any) {
    if (user.role !== Role.MERCHANT) {
      throw new ForbiddenException('Chỉ tài khoản Merchant mới có thể xác nhận quyền sở hữu');
    }

    const place = await this.findOne(placeId);
    if (place.ownerId) {
      throw new BadRequestException('Địa điểm này đã có chủ sở hữu');
    }

    // Kiểm tra xem đã có yêu cầu nào đang chờ duyệt chưa
    const existingRequest = await this.claimRequestRepo.findOne({
      where: {
        place_id: placeId,
        status: ClaimRequestStatus.PENDING,
      },
    });
    if (existingRequest) {
      throw new BadRequestException('Đã có yêu cầu xác nhận cho địa điểm này đang được xử lý');
    }

    const claim = this.claimRequestRepo.create({
      place_id: placeId,
      user_id: user.sub,
      business_proof: proofImages,
      status: ClaimRequestStatus.PENDING,
    });

    return await this.claimRequestRepo.save(claim);
  }

  // 2. Admin duyệt yêu cầu claim
  async approveClaim(claimId: string, adminUser: CurrentUser) {
    if (adminUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ Admin mới có quyền duyệt');
    }

    const claim = await this.claimRequestRepo.findOne({
      where: { _id: new ObjectId(claimId) },
    });
    if (!claim || claim.status !== ClaimRequestStatus.PENDING) {
      throw new NotFoundException('Yêu cầu không hợp lệ hoặc đã được xử lý');
    }

    // Cập nhật thông tin chủ sở hữu cho địa điểm
    await this.placeRepo.update(new ObjectId(claim.place_id), {
      ownerId: claim.user_id,
      is_partner: true,
    } as any);

    claim.status = ClaimRequestStatus.APPROVED;
    return await this.claimRequestRepo.save(claim);
  }

  // 3. Admin từ chối yêu cầu claim
  async rejectClaim(claimId: string, reason: string, adminUser: CurrentUser) {
    if (adminUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ Admin mới có quyền thực hiện');
    }

    const claim = await this.claimRequestRepo.findOne({
      where: { _id: new ObjectId(claimId) },
    });
    if (!claim) {
      throw new NotFoundException('Yêu cầu không tồn tại');
    }

    claim.status = ClaimRequestStatus.REJECTED;
    claim.admin_note = reason;
    return await this.claimRequestRepo.save(claim);
  }

  // 4. Lấy danh sách yêu cầu claim chờ duyệt
  async getPendingClaimRequests() {
    return await this.claimRequestRepo.find({
      where: { status: ClaimRequestStatus.PENDING },
      order: { created_at: -1 } as any,
    });
  }
}