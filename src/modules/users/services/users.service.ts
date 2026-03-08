import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { User } from '../entities/user.entity';
import { ObjectId } from 'mongodb';
import { UpdateUserDto } from '../dto/update-user.dto';
import { Role } from '../../../common/constants';
import { NotificationType } from '../../notification/entities/notification.entity'; // Sửa lại đường dẫn relative cho chuẩn
import { NotificationsService } from '../../notification/notification.service';
import { MerchantRequest, RequestStatus } from '../entities/merchant-request.entity'; // 1. Import RequestStatus
import { CreateMerchantRequestDto } from '../dto/create-merchant-request.dto'; // 2. Import DTO

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: MongoRepository<User>, // Tên biến là userRepository
    private readonly notificationsService: NotificationsService,
    @InjectRepository(MerchantRequest)
    private readonly merchantRequestRepo: MongoRepository<MerchantRequest>,
  ) {}

  // Lấy thông tin cá nhân
  async findById(id: string): Promise<User> {
    const user = (await this.userRepository.findOne({
      where: { _id: new ObjectId(id) },
    })) as User;
    
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return user;
  }

  // Cập nhật Profile (Dành cho User tự sửa)
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const objectId = new ObjectId(id);
    
    // Nếu có ngày sinh, đảm bảo lưu dưới dạng Date Object
    const updateData = { ...dto };
    if (dto.birthday) {
      updateData.birthday = new Date(dto.birthday) as any;
    }

    await this.userRepository.update(objectId, updateData);
    return this.findById(id);
  }

  // Admin: Lấy tất cả người dùng
  async findAll(): Promise<User[]> {
    return await this.userRepository.find();
  }

  async updateRole(userId: string, role: Role) {
    if (!ObjectId.isValid(userId)) throw new BadRequestException('ID không hợp lệ');
    
    const user = await this.userRepository.findOne({ where: { _id: new ObjectId(userId) } });
    if (!user) throw new NotFoundException('User không tồn tại');

    user.role = role;
    await this.userRepository.save(user);

    return { success: true, message: `Đã nâng cấp user lên ${role}` };
  }

  async requestMerchantRole(userId: string, dto: CreateMerchantRequestDto) {
  // 1. Kiểm tra nếu đã là Merchant hoặc đã có yêu cầu đang chờ
  const user = await this.userRepository.findOne({ where: { _id: new ObjectId(userId) } });
  if (user?.role === Role.MERCHANT) throw new BadRequestException('Bạn đã là Merchant');

  const existingRequest = await this.merchantRequestRepo.findOne({ 
    where: { user_id: userId, status: RequestStatus.PENDING } 
  });
  if (existingRequest) throw new BadRequestException('Yêu cầu của bạn đang được xử lý');

  // 2. Tạo yêu cầu mới
  const request = this.merchantRequestRepo.create({
    ...dto,
    user_id: userId,
  });
  await this.merchantRequestRepo.save(request);

  // 3. Thông báo cho Admin (Sử dụng NotificationsService)
  this.notificationsService.createAndSend({
    recipient_id: 'ADMIN_ID', // Hoặc lấy danh sách admin
    sender_id: userId,
    type: NotificationType.SYSTEM,
    title: 'Yêu cầu Merchant mới',
    message: `Người dùng ${user?.fullName} đã gửi thông tin kinh doanh cho thương hiệu ${dto.business_name}.`,
    metadata: { request_id: request._id.toString() }
  });

  return { success: true, message: 'Thông tin kinh doanh đã được gửi để phê duyệt' };
}

  async findOne(id: string): Promise<User> {
    if (!ObjectId.isValid(id)) throw new BadRequestException('ID không hợp lệ');
    const user = await this.userRepository.findOne({ where: { _id: new ObjectId(id) } });
    if (!user) throw new NotFoundException('User không tồn tại');
    return user;
  }

  /**
   * Lấy hồ sơ công khai của người dùng (ẩn thông tin nhạy cảm)
   */
  async getPublicProfile(id: string) {
    if (!ObjectId.isValid(id)) throw new BadRequestException('ID không hợp lệ');
    const user = await this.userRepository.findOne({ where: { _id: new ObjectId(id) } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    // Chỉ trả về các trường công khai
    return {
      id: user._id.toString(),
      fullName: user.fullName,
      avatar: user.avatar,
      coverImage: user.coverImage,
      bio: user.bio,
      travelStyle: user.travelStyle,
      role: user.role,
      createdAt: user.createdAt
    };
  }
  
  // Admin: Xóa người dùng
  async remove(id: string) {
    const result = await this.userRepository.delete(new ObjectId(id));
    if (result.affected === 0) throw new NotFoundException('Không tìm thấy người dùng');
    return { message: 'Xóa thành công' };
  }
}