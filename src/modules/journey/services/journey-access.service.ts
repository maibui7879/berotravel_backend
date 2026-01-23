import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Journey } from '../entities/journey.entity';

@Injectable()
export class JourneyAccessService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
  ) {}

  async getJourneyWithAccess(journeyId: string, userId: string, mode: 'VIEW' | 'EDIT' = 'VIEW'): Promise<Journey> {
    if (!ObjectId.isValid(journeyId)) throw new BadRequestException('ID hành trình không hợp lệ');
    
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    const isOwner = journey.owner_id === userId;
    const isMember = journey.members.includes(userId);

    if (mode === 'EDIT' && !isOwner && !isMember) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa hành trình này');
    }

    return journey;
  }
}