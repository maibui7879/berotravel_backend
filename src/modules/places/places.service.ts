import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { Place } from './entities/place.entity';
import { PlaceEditRequest, EditRequestStatus } from './entities/place-edit-request.entity';
import { Role, PlaceStatus, UserActionType } from 'src/common/constants';
import { SearchPlaceDto, SortBy, SortOrder } from './dto/search-place.dto';
import { CreatePlaceDto } from './dto/create-place.dto';

import { UserProfileService } from '../users/services/user-profile.service';
import { Journey } from '../journey/entities/journey.entity';
import { InjectRepository as InjectJourneyRepository } from '@nestjs/typeorm';
interface CurrentUser {
  sub: string;
  role: Role;
}

@Injectable()
export class PlacesService {
constructor(
  @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
  @InjectRepository(PlaceEditRequest) private readonly editRequestRepo: MongoRepository<PlaceEditRequest>,
  @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>, // Đảm bảo tên này
  private readonly userProfileService: UserProfileService, 
) {}

  async create(dto: CreatePlaceDto, user: CurrentUser) {
    const { location, ...rest } = dto;
    
    // Logic Status: Admin/Merchant tạo thì duyệt luôn, User tạo thì chờ duyệt
    const initialStatus = (user.role === Role.ADMIN || user.role === Role.MERCHANT) 
        ? PlaceStatus.APPROVED 
        : PlaceStatus.PENDING;

    const place = this.placeRepo.create({
      ...rest,
      location: { type: 'Point', coordinates: [location.lng, location.lat] },
      ownerId: user.sub,
      createdBy: user.sub,
      status: initialStatus,
    });

    return await this.placeRepo.save(place);
  }

  async findAll(query: SearchPlaceDto, userId?: string) {
    const { name, category, page = 1, limit = 10, lat, lng, radius, sortBy, sortOrder } = query;

    if (userId && name) {
        this.userProfileService.trackUserSearch(userId, name);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const sortField = sortBy || SortBy.CREATED_AT; 
    const order = sortOrder === SortOrder.DESC ? -1 : 1;
    const pipeline: any[] = [];

    if (lat !== undefined && lng !== undefined) {
      pipeline.push({
        $geoNear: {
          near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          distanceField: 'distance',
          maxDistance: Number(radius) || 10000,
          query: { status: PlaceStatus.APPROVED }, // Chỉ lấy đã duyệt
          spherical: true,
        },
      });
    } else {
      pipeline.push({ $match: { status: PlaceStatus.APPROVED } }); 
      if (sortField === SortBy.DISTANCE) {
        throw new BadRequestException('Phải có lat/lng để sắp xếp theo khoảng cách');
      }
    }

    if (name) pipeline.push({ $match: { name: { $regex: name, $options: 'i' } } });
    if (category) pipeline.push({ $match: { category } });

    if (sortField === SortBy.DISTANCE && lat !== undefined) {
      if (sortOrder === SortOrder.DESC) pipeline.push({ $sort: { distance: -1 } });
    } else {
      pipeline.push({ $sort: { [sortField]: order } });
    }

    pipeline.push({
      $facet: {
        data: [{ $skip: skip }, { $limit: take }],
        totalCount: [{ $count: 'count' }],
      },
    });

    const result = await this.placeRepo.aggregate(pipeline).toArray();
    const data = result[0]?.data || [];
    const total = result[0]?.totalCount[0]?.count || 0;

    return {
      data,
      meta: { total, limit, page: Number(page), last_page: Math.ceil(total / take) },
    };
  }

  async findOne(id: string, userId?: string) {
    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(id) } }) as Place;
    if (!place) throw new NotFoundException('Không tìm thấy địa điểm');

    if (userId) {
        this.userProfileService.scoreAction(userId, id, UserActionType.VIEW_DETAILS);
    }
    return place;
  }

  async update(id: string, dto: any, user: CurrentUser) {
    const place = await this.findOne(id);
    
    const isOwner = place.ownerId === user.sub;
    const isAdmin = user.role === Role.ADMIN;

    if (isOwner || isAdmin) {
        const updateData = { ...dto };
        if (dto.location) {
            updateData.location = { type: 'Point', coordinates: [dto.location.lng, dto.location.lat] };
        }
        delete updateData.status; 
        await this.placeRepo.update(new ObjectId(id), updateData);
        return await this.findOne(id);
    }

    delete dto.status; 
    const request = this.editRequestRepo.create({
        place_id: id,
        user_id: user.sub,
        update_data: dto, 
        status: EditRequestStatus.PENDING
    });

    await this.editRequestRepo.save(request);
    return { 
        message: 'Đề xuất chỉnh sửa của bạn đã được gửi và đang chờ Admin duyệt.',
        request_id: request._id 
    };
  }

  // ==========================================
  // 4. ADMIN APPROVAL LOGIC (FULL)
  // ==========================================

  // [NEW] A. DUYỆT ĐỊA ĐIỂM MỚI TẠO (PENDING PLACES)
  
  // 1. Lấy danh sách địa điểm mới đang chờ duyệt
  async getPendingPlaces() {
      return await this.placeRepo.find({
          where: { status: PlaceStatus.PENDING },
          order: { created_at: -1 } as any
      });
  }

  // 2. Duyệt hoặc Từ chối địa điểm mới
  async verifyPlace(placeId: string, status: PlaceStatus.APPROVED | PlaceStatus.REJECTED, adminUser: CurrentUser) {
      if (adminUser.role !== Role.ADMIN) throw new ForbiddenException('Chỉ Admin mới được duyệt');
      
      const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
      if (!place) throw new NotFoundException('Địa điểm không tồn tại');

      if (status === PlaceStatus.REJECTED) {
          // Nếu từ chối thì xóa luôn hoặc set Rejected tùy chính sách
          // Ở đây mình chọn set status REJECTED để lưu lịch sử
          place.status = PlaceStatus.REJECTED;
      } else {
          place.status = PlaceStatus.APPROVED;
      }
      
      return await this.placeRepo.save(place);
  }

  // [NEW] B. DUYỆT YÊU CẦU CHỈNH SỬA (EDIT REQUESTS)

  // 1. Lấy danh sách yêu cầu chỉnh sửa đang Pending
  async getPendingEditRequests() {
      return await this.editRequestRepo.find({ 
          where: { status: EditRequestStatus.PENDING },
          order: { created_at: -1 } as any
      });
  }

  // 2. Admin duyệt yêu cầu chỉnh sửa
  async approveEditRequest(requestId: string, adminUser: CurrentUser) {
      if (adminUser.role !== Role.ADMIN) throw new ForbiddenException('Chỉ Admin mới được duyệt');

      const request = await this.editRequestRepo.findOne({ where: { _id: new ObjectId(requestId) } });
      if (!request) throw new NotFoundException('Yêu cầu không tồn tại');
      if (request.status !== EditRequestStatus.PENDING) throw new BadRequestException('Yêu cầu này đã được xử lý');

      // Merge Data vào Place gốc
      const dto = request.update_data;
      const updateData = { ...dto };
      
      if (dto.location) {
          updateData.location = { type: 'Point', coordinates: [dto.location.lng, dto.location.lat] };
      }

      await this.placeRepo.update(new ObjectId(request.place_id), updateData);

      // Cập nhật Status Request
      request.status = EditRequestStatus.APPROVED;
      await this.editRequestRepo.save(request);

      return { success: true, message: 'Đã cập nhật địa điểm theo đề xuất' };
  }

  // 3. Admin từ chối yêu cầu chỉnh sửa
  async rejectEditRequest(requestId: string, reason: string, adminUser: CurrentUser) {
      if (adminUser.role !== Role.ADMIN) throw new ForbiddenException('Chỉ Admin mới được duyệt');

      const request = await this.editRequestRepo.findOne({ where: { _id: new ObjectId(requestId) } });
      if (!request) throw new NotFoundException('Yêu cầu không tồn tại');

      request.status = EditRequestStatus.REJECTED;
      request.admin_note = reason;
      await this.editRequestRepo.save(request);

      return { success: true, message: 'Đã từ chối đề xuất' };
  }

async remove(id: string, user: CurrentUser) {
    const place = await this.findOne(id);

    // 1. Validate Quyền (Admin hoặc Chủ sở hữu)
    const isAdmin = user.role === Role.ADMIN;
    const isOwner = place.ownerId === user.sub;
    
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Bạn không có quyền xóa địa điểm này');
    }

    // 2. [IMPORTANT] Validate Integrity
    // Kiểm tra xem địa điểm có đang được sử dụng trong hành trình nào không
    const isUsedInJourney = await this.journeyRepo.findOne({
      where: { 'days.stops.place_id': id } as any
    });

    if (isUsedInJourney) {
      throw new BadRequestException(
        'Không thể xóa địa điểm này vì nó đang nằm trong lịch trình của người dùng. Hãy ẩn địa điểm thay vì xóa.'
      );
    }

    // 3. Tiến hành xóa
    const session = this.placeRepo.manager.connection.createQueryRunner();
    // (Nếu dùng MongoDB Atlas có hỗ trợ Transaction thì nên dùng ở đây)
    
    try {
      // Xóa địa điểm
      await this.placeRepo.delete(new ObjectId(id));

      // Xóa các yêu cầu chỉnh sửa liên quan (Dọn rác)
      await this.editRequestRepo.deleteMany({ place_id: id });

      return { success: true, message: 'Đã xóa địa điểm và các dữ liệu liên quan' };
    } catch (error) {
      throw new BadRequestException('Có lỗi xảy ra khi xóa địa điểm');
    }
  }
}