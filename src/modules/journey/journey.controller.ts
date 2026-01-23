import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JourneysService } from './services/journey.service';
import { CostEstimationService } from './services/cost-estimation.service';
import { Role } from 'src/common/constants';
import { Public } from 'src/common/decorators/public.decorator';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AtGuard } from 'src/common/guards/at.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { UpdateJourneyDto } from './dto/update-journey.dto';
import { AddStopDto } from './dto/add-stop.dto';

interface CurrentUser {
  sub: string;
  role: Role;
}

@ApiTags('Journeys & Itineraries (Hành trình)')
@Controller('journeys')
@UseGuards(AtGuard, RolesGuard)
export class JourneysController {
  constructor(
    private readonly journeysService: JourneysService,
    private readonly costEstimationService: CostEstimationService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '1. Tạo hành trình mới (Tự động khởi tạo số ngày)' })
  create(
    @Body() dto: CreateJourneyDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.create(dto, userId);
  }

  @Get('my-journeys')
  @ApiBearerAuth()
  @ApiOperation({ summary: '2. Lấy danh sách hành trình của tôi (Chủ sở hữu hoặc Thành viên)' })
  findMy(@GetCurrentUser('sub') userId: string) {
    return this.journeysService.findMyJourneys(userId);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '3. Xem chi tiết hành trình (Timeline đầy đủ ngày & stops)' })
  @ApiParam({ name: 'id', description: 'ID của Journey' })
  findOne(@Param('id') id: string) {
    return this.journeysService.findOne(id);
  }

  @Patch(':id/add-stop')
  @ApiBearerAuth()
  @ApiOperation({ summary: '4. Thêm địa điểm vào lịch trình (Tự động tính Transit & Start Time)' })
  addStop(
    @Param('id') id: string,
    @Body() dto: AddStopDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.addStop(id, dto, userId);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '5. Cập nhật thông tin chung hành trình (Tên, trạng thái)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateJourneyDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.update(id, dto, userId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '6. Xóa hành trình (Chỉ Owner hoặc Admin)' })
  remove(
    @Param('id') id: string,
    @GetCurrentUser() user: CurrentUser
  ) {
    return this.journeysService.remove(id, user);
  }

  @Get(':id/budget')
  @Public()
  @ApiOperation({ summary: '7. Ước tính chi phí hành trình (Tự động chia đều cho thành viên nhóm)' })
  @ApiParam({ name: 'id', description: 'ID của Journey' })
  @ApiQuery({ name: 'members', required: false, type: Number, description: 'Số thành viên (tùy chọn - mặc định từ journey.members)' })
  @ApiQuery({ name: 'includeAccommodation', required: false, type: Boolean, description: 'Tính toán lưu trú (default: true)' })
  async getBudgetEstimate(
    @Param('id') journeyId: string,
    @Query('members') memberCount?: string,
    @Query('includeAccommodation') includeAccommodation?: string,
  ) {
    const members = memberCount ? parseInt(memberCount, 10) : undefined;
    const withAccommodation = includeAccommodation !== 'false';
    return this.costEstimationService.estimateJourneyBudget(
      journeyId,
      withAccommodation,
      members,
    );
  }
}