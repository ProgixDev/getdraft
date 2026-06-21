import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users (admin)' })
  getUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('role') role?: string,
    @Query('flag') flag?: 'kyc_pending' | 'kyc_declined' | 'banned',
  ) {
    return this.adminService.getUsers(page || 1, limit || 20, role, flag);
  }

  @Put('users/:id/verify')
  @ApiOperation({ summary: 'Verify a recruiter/coach' })
  verifyRecruiter(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.verifyRecruiter(id);
  }

  @Put('users/:id/ban')
  @ApiOperation({ summary: 'Ban a user' })
  banUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.banUser(id);
  }

  @Put('users/:id/unban')
  @ApiOperation({ summary: 'Unban a user' })
  unbanUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.unbanUser(id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get admin dashboard stats' })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('queue-counts')
  @ApiOperation({ summary: 'Get queue counts for the admin dashboard' })
  getQueueCounts() {
    return this.adminService.getQueueCounts();
  }
}
