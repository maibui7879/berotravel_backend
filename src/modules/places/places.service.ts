import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { Place } from './entities/place.entity';
import { Role, PlaceStatus } from 'src/common/constants';
import { SearchPlaceDto, SortBy, SortOrder } from './dto/search-place.dto';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { ObjectId } from 'mongodb';

interface CurrentUser {
  sub: string;
  role: Role;
}

@Injectable()
export class PlacesService {
  constructor(@InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>) {}

  async create(dto: CreatePlaceDto, userId: string) {
    const { location, ...rest } = dto;
    const place = this.placeRepo.create({
      ...rest,
      location: { type: 'Point', coordinates: [location.lng, location.lat] },
      ownerId: userId,
      createdBy: userId,
      status: PlaceStatus.PENDING,
    });
    return await this.placeRepo.save(place);
  }

async findAll(query: SearchPlaceDto) {
    const { name, category, page = 1, limit = 10, lat, lng, radius, sortBy, sortOrder } = query;
    
    // Ép kiểu số để tránh lỗi tính toán nếu query gửi lên dạng string
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    
    // Giải quyết lỗi TS2464: Ép kiểu hoặc gán giá trị mặc định chắc chắn
    const sortField = sortBy || SortBy.CREATED_AT; 
    const order = sortOrder === SortOrder.DESC ? -1 : 1;

    const pipeline: any[] = [];

    // 1. LUÔN LUÔN xử lý GeoNear đầu tiên nếu có Lat/Lng
    if (lat !== undefined && lng !== undefined) {
      pipeline.push({
        $geoNear: {
          near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          distanceField: 'distance', // Thêm trường khoảng cách (mét)
          maxDistance: Number(radius) || 10000,
          query: { status: 'APPROVED' }, 
          spherical: true,
        },
      });
    } else {
      pipeline.push({ $match: { status: 'APPROVED' } });
      if (sortField === SortBy.DISTANCE) {
        throw new BadRequestException('Phải có lat/lng để sắp xếp theo khoảng cách');
      }
    }

    // 2. Filter theo tên và Category
    if (name) {
      pipeline.push({ $match: { name: { $regex: name, $options: 'i' } } });
    }
    if (category) {
      pipeline.push({ $match: { category } });
    }

    // 3. Sorting (Đã sửa lỗi Computed Property)
    if (sortField === SortBy.DISTANCE && lat !== undefined) {
      // $geoNear mặc định đã sort ASC theo distance
      if (sortOrder === SortOrder.DESC) {
        pipeline.push({ $sort: { distance: -1 } });
      }
    } else {
      pipeline.push({ $sort: { [sortField]: order } });
    }

    // 4. Phân trang & Tính tổng (Facet)
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
      meta: {
        total,
        limit: limit,
        page: Number(page),
        last_page: Math.ceil(total / take),
      },
    };
  }

  async findOne(id: string) {
    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(id) } }) as Place;
    if (!place) throw new NotFoundException('Không tìm thấy địa điểm');
    return place;
  }

  async update(id: string, dto: any, user: any) {
    const place = await this.findOne(id);
    if (user.role !== Role.ADMIN && place.ownerId !== user.sub) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa địa điểm này');
    }

    const updateData = { ...dto };
    if (dto.location) {
      updateData.location = { type: 'Point', coordinates: [dto.location.lng, dto.location.lat] };
    }
    await this.placeRepo.update(new ObjectId(id), updateData);
    return this.findOne(id);
  }

  async remove(id: string, user: any) {
    const place = await this.findOne(id);
    if (user.role !== Role.ADMIN && place.ownerId !== user.sub) {
      throw new ForbiddenException('Bạn không có quyền xóa địa điểm này');
    }
    await this.placeRepo.delete(new ObjectId(id));
    return { success: true };
  }
}