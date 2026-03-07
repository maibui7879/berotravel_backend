// src/modules/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiProposal } from './entities/ai-proposal.entity';
import { Journey } from '../journey/entities/journey.entity';

@Module({
  imports: [
    HttpModule.register({ timeout: 60000 }), // AI có thể mất thời gian xử lý
    TypeOrmModule.forFeature([AiProposal, Journey]),
  ],
  providers: [AiService],
  controllers: [AiController],
})
export class AiModule {}