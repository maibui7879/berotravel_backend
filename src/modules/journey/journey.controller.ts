import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

import { JourneysService } from './services/journey.service';
import { CostEstimationService } from './services/cost-estimation.service';
import { JourneyTrackingService } from './services/journey-tracking.service';

import { Role } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { AtGuard } from '../../common/guards/at.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import { JourneyTag, JourneyVisibility } from './entities/journey.entity';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { UpdateJourneyDto } from './dto/update-journey.dto';
import { AddStopDto } from './dto/add-stop.dto';
import { CheckInStopDto, ResumeJourneyDto } from './dto/tracking.dto';
import { CreateJoinRequestDto, ReplyJoinRequestDto } from './dto/social-journey.dto';
import { JoinJourneyDto, ManageMemberDto } from './dto/member-management.dto';
import { MoveStopDto } from './dto/move-stop.dto';
import { UpdateStopDto } from './dto/update-stop.dto';
import { TransferHostDto, ChangeMemberRoleDto } from './dto/permission-management.dto';

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
    private readonly trackingService: JourneyTrackingService,
  ) {}


@Get('public')
@Public()
@ApiOperation({ summary: 'Lấy danh sách các chuyến đi Công khai với bộ lọc nâng cao' })
@ApiQuery({ name: 'search', required: false, description: 'Tìm theo tên' })
@ApiQuery({ name: 'tag', enum: JourneyTag, required: false, description: 'Lọc theo thể loại' })
@ApiQuery({ name: 'minPrice', type: Number, required: false, description: 'Giá tối thiểu' })
@ApiQuery({ name: 'maxPrice', type: Number, required: false, description: 'Giá tối đa' })
@ApiQuery({ name: 'startDate', type: String, required: false, description: 'Từ ngày (YYYY-MM-DD)' })
@ApiQuery({ name: 'endDate', type: String, required: false, description: 'Đến ngày (YYYY-MM-DD)' })
getPublicFeed(
  @Query('search') search?: string,
  @Query('tag') tag?: JourneyTag,
  @Query('minPrice') minPrice?: string,
  @Query('maxPrice') maxPrice?: string,
  @Query('startDate') startDate?: string,
  @Query('endDate') endDate?: string,
) {
  return this.journeysService.getPublicJourneys(
    search, 
    tag, 
    minPrice ? parseInt(minPrice) : undefined,
    maxPrice ? parseInt(maxPrice) : undefined,
    startDate,
    endDate
  );
}

  @Get('my-journeys')
  @ApiBearerAuth()
  @ApiOperation({ summary: '2. Lấy danh sách hành trình của tôi (Owner & Member)' })
  findMy(@GetCurrentUser('sub') userId: string) {
    return this.journeysService.findMyJourneys(userId);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '1. Tạo hành trình mới' })
  create(@Body() dto: CreateJourneyDto, @GetCurrentUser('sub') userId: string) {
    return this.journeysService.create(dto, userId);
  }

  @Get(':id')
  @Public() 
  @ApiOperation({ summary: '3. Xem chi tiết hành trình (Hỗ trợ View-only cho bạn bè)' })
  findOne(
    @Param('id') id: string,
    @GetCurrentUser('sub') userId?: string // userId có thể undefined nếu là khách
  ) {
    // Truyền userId vào service để kiểm tra quyền View-only
    return this.journeysService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '5. Cập nhật thông tin (Bao gồm Toggle Public/Private)' })
  update(@Param('id') id: string, @Body() dto: UpdateJourneyDto, @GetCurrentUser('sub') userId: string) {
    return this.journeysService.update(id, dto, userId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '6. Xóa hành trình (Admin/Owner)' })
  remove(@Param('id') id: string, @GetCurrentUser() user: CurrentUser) {
    return this.journeysService.remove(id, user);
  }

  @Patch(':id/add-stop')
  @ApiBearerAuth()
  @ApiOperation({ summary: '4. Thêm địa điểm vào lịch trình' })
  addStop(@Param('id') id: string, @Body() dto: AddStopDto, @GetCurrentUser('sub') userId: string) {
    return this.journeysService.addStop(id, dto, userId);
  }

  @Patch(':id/days/:dayId/stops/:stopId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin chi tiết của một địa điểm (Stop)' })
  updateStop(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Param('stopId') stopId: string,
    @Body() dto: UpdateStopDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.updateStop(id, dayId, stopId, dto, userId);
  }
  
  @Delete(':id/days/:dayNumber/stops/:stopId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa một địa điểm khỏi lịch trình' })
  removeStop(
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Param('stopId') stopId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.removeStop(id, parseInt(dayNumber), stopId, userId);
  }

  @Patch(':id/move-stop')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kéo thả, thay đổi thứ tự địa điểm' })
  moveStop(@Param('id') id: string, @Body() dto: MoveStopDto, @GetCurrentUser('sub') userId: string) {
    dto.journey_id = id; 
    return this.journeysService.moveStop(userId, dto);
  }
  
  @Get(':id/budget-breakdown')
  @ApiBearerAuth() 
  @ApiOperation({ summary: 'Lấy phân tích chi tiết ngân sách (Ăn uống, Khách sạn, Di chuyển)' })
  async getBudgetBreakdown(
    @Param('id') journeyId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    await this.journeysService.findOne(journeyId, userId); 

    return this.costEstimationService.estimateJourneyBudget(journeyId);
  }

  @Get(':id/budget')
  @Public()
  @ApiOperation({ summary: '7. Ước tính chi phí chi tiết' })
  async getBudgetEstimate(
    @Param('id') journeyId: string,
    @Query('members') memberCount?: string,
    @Query('includeAccommodation') includeAccommodation?: string,
  ) {
    const members = memberCount ? parseInt(memberCount, 10) : undefined;
    const withAccommodation = includeAccommodation !== 'false';
    return this.costEstimationService.estimateJourneyBudget(journeyId, withAccommodation, members);
  }

  @Patch(':id/start')
  @ApiBearerAuth()
  @ApiOperation({ summary: '8. [TRACKING] Bắt đầu chuyến đi' })
  startJourney(@Param('id') id: string, @GetCurrentUser('sub') userId: string) {
    return this.trackingService.startJourney(id, userId);
  }

  @Patch(':id/pause')
  @ApiBearerAuth()
  @ApiOperation({ summary: '9. [TRACKING] Tạm dừng chuyến đi' })
  pauseJourney(@Param('id') id: string, @GetCurrentUser('sub') userId: string) {
    return this.trackingService.pauseJourney(id, userId);
  }

  @Patch(':id/resume')
  @ApiBearerAuth()
  @ApiOperation({ summary: '10. [TRACKING] Tiếp tục (Dời lịch thông minh)' })
  resumeJourney(
    @Param('id') id: string, 
    @Body() dto: ResumeJourneyDto, 
    @GetCurrentUser('sub') userId: string
  ) {
    return this.trackingService.resumeJourney(id, userId, dto);
  }

  @Patch(':id/cancel')
  @ApiBearerAuth()
  @ApiOperation({ summary: '13. [TRACKING] Hủy chuyến đi (Hoàn trả Booking)' })
  cancelJourney(@Param('id') id: string, @GetCurrentUser('sub') userId: string) {
    return this.trackingService.cancelJourney(id, userId);
  }

  @Patch(':id/days/:dayId/stops/:stopId/check-in')
  @ApiBearerAuth()
  @ApiOperation({ summary: '11. [CHECKLIST] Check-in tại địa điểm' })
  checkInStop(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Param('stopId') stopId: string,
    @Body() dto: CheckInStopDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.trackingService.checkInStop(id, dayId, stopId, userId, dto);
  }

  @Get(':id/days/:dayId/stops/:stopId/check-in-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách điểm danh và tiến độ check-in của một Stop' })
  getCheckInStatus(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Param('stopId') stopId: string
  ) {
    return this.trackingService.getCheckInStatus(id, dayId, stopId);
  }
  
  @Patch(':id/days/:dayId/stops/:stopId/skip')
  @ApiBearerAuth()
  @ApiOperation({ summary: '12. [CHECKLIST] Bỏ qua địa điểm' })
  skipStop(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Param('stopId') stopId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.trackingService.skipStop(id, dayId, stopId, userId);
  }

  @Post(':id/join-request')
  @ApiBearerAuth()
  @ApiOperation({ summary: '14. [SOCIAL] Xin tham gia hành trình (Vào hàng chờ Group)' })
  sendJoinRequest(
    @Param('id') id: string,
    @Body() dto: CreateJoinRequestDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.sendJoinRequest(id, userId, dto);
  }

  @Get(':id/join-requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: '15. [SOCIAL] Xem danh sách chờ duyệt (Chỉ Owner)' })
  getPendingRequests(
    @Param('id') id: string,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.getPendingRequests(id, userId);
  }

  @Patch(':id/join-requests/:userId/reply')
  @ApiBearerAuth()
  @ApiOperation({ summary: '16. [SOCIAL] Duyệt/Từ chối thành viên' })
  @ApiParam({ name: 'userId', description: 'ID của user đang xin vào' })
  replyJoinRequest(
    @Param('id') journeyId: string,
    @Param('userId') requestUserId: string,
    @Body() dto: ReplyJoinRequestDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.replyJoinRequest(journeyId, requestUserId, userId, dto);
  }


  @Post('join')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tham gia hành trình bằng mã mời' })
  joinJourney(@Body() dto: JoinJourneyDto, @GetCurrentUser('sub') userId: string) {
    return this.journeysService.joinJourney(dto.invite_code, userId);
  }

  @Post(':id/request-join')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gửi yêu cầu tham gia hành trình (Chờ duyệt)' })
  @ApiParam({ name: 'id', description: 'Journey ID' })
  requestJoinJourney(@Param('id') journeyId: string, @GetCurrentUser('sub') userId: string) {
    return this.journeysService.requestJoinJourney(journeyId, userId);
  }

  @Get(':id/members/pending-requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem danh sách yêu cầu tham gia chờ duyệt' })
  @ApiParam({ name: 'id', description: 'Journey ID' })
  getPendingJoinRequests(
    @Param('id') journeyId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.getPendingJoinRequests(journeyId, userId);
  }

  @Patch(':id/members/:memberId/approve')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Duyệt yêu cầu tham gia' })
  @ApiParam({ name: 'id', description: 'Journey ID' })
  @ApiParam({ name: 'memberId', description: 'ID của user xin tham gia' })
  approveMember(
    @Param('id') journeyId: string,
    @Param('memberId') memberId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.approveMember(journeyId, memberId, userId);
  }

  @Patch(':id/members/:memberId/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Từ chối yêu cầu tham gia' })
  @ApiParam({ name: 'id', description: 'Journey ID' })
  @ApiParam({ name: 'memberId', description: 'ID của user xin tham gia' })
  rejectMember(
    @Param('id') journeyId: string,
    @Param('memberId') memberId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.rejectMember(journeyId, memberId, userId);
  }

  @Delete(':id/members/:memberId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đuổi thành viên khỏi hành trình' })
  @ApiParam({ name: 'id', description: 'Journey ID' })
  @ApiParam({ name: 'memberId', description: 'ID của thành viên cần đuổi' })
  removeMember(
    @Param('id') journeyId: string,
    @Param('memberId') memberId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.removeMember(journeyId, memberId, userId);
  }

  @Get(':id/album')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy toàn bộ ảnh check-in và ảnh chat của hành trình' })
  async getAlbum(
    @Param('id') id: string,
    @GetCurrentUser('sub') userId: string
  ) {
    // Kiểm tra quyền truy cập hành trình trước khi cho phép lấy album
    await this.journeysService.findOne(id, userId); 
    return this.journeysService.getJourneyAlbum(id);
  }
  @Post(':id/leave')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rời khỏi hành trình' })
  @ApiParam({ name: 'id', description: 'Journey ID' })
  leaveJourney(@Param('id') journeyId: string, @GetCurrentUser('sub') userId: string) {
    return this.journeysService.leaveJourney(journeyId, userId);
  }

  // ==========================================
  // HOST TRANSFER & PERMISSION MANAGEMENT
  // ==========================================

  @Get(':id/members/host-candidates')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'HOST: Lấy danh sách các member có thể nhận quyền HOST' })
  @ApiParam({ name: 'id', description: 'Journey ID' })
  getHostCandidates(
    @Param('id') journeyId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.getHostCandidates(journeyId, userId);
  }

  @Post(':id/transfer-host/:memberId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'HOST: Chuyển quyền HOST cho một MEMBER khác trước khi rời chuyến' })
  @ApiParam({ name: 'id', description: 'Journey ID' })
  @ApiParam({ name: 'memberId', description: 'ID của member sẽ nhận quyền HOST' })
  transferHostTo(
    @Param('id') journeyId: string,
    @Param('memberId') newHostId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.transferHostTo(journeyId, newHostId, userId);
  }

  @Patch(':id/members/:memberId/role')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'HOST: Thay đổi role của thành viên (HOST/MEMBER/VIEWER)' })
  @ApiParam({ name: 'id', description: 'Journey ID' })
  @ApiParam({ name: 'memberId', description: 'ID của thành viên' })
  changeMemberRole(
    @Param('id') journeyId: string,
    @Param('memberId') memberId: string,
    @Body() dto: any, // { role: 'HOST' | 'MEMBER' | 'VIEWER' }
    @GetCurrentUser('sub') userId: string
  ) {
    return this.journeysService.changeMemberRole(journeyId, memberId, dto.role, userId);
  }
}