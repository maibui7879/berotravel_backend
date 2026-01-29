import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { User } from '../entities/user.entity';
import { ObjectId } from 'mongodb';
import { UpdateUserDto } from '../dto/update-user.dto';
import { BadRequestException } from '@nestjs/common/exceptions';
import { Role } from 'src/common/constants';
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: MongoRepository<User>,
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

  async findOne(id: string): Promise<User> {
    if (!ObjectId.isValid(id)) throw new BadRequestException('ID không hợp lệ');
    const user = await this.userRepository.findOne({ where: { _id: new ObjectId(id) } });
    if (!user) throw new NotFoundException('User không tồn tại');
    return user;
  }
  
  // Admin: Xóa người dùng
  async remove(id: string) {
    const result = await this.userRepository.delete(new ObjectId(id));
    if (result.affected === 0) throw new NotFoundException('Không tìm thấy người dùng');
    return { message: 'Xóa thành công' };
  }
}