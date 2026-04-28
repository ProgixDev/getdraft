import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { UpsertAthleteProfileDto } from './dto/athlete-profile.dto';
import { UpsertRecruiterProfileDto } from './dto/recruiter-profile.dto';
import { UpsertParentProfileDto } from './dto/parent-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(private profilesService: ProfilesService) {}

  @Get('athlete')
  @ApiOperation({ summary: 'Get my athlete profile' })
  getAthleteProfile(@CurrentUser('id') userId: string) {
    return this.profilesService.getAthleteProfile(userId);
  }

  @Put('athlete')
  @ApiOperation({ summary: 'Create/update my athlete profile' })
  upsertAthleteProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertAthleteProfileDto,
  ) {
    return this.profilesService.upsertAthleteProfile(userId, dto);
  }

  @Get('recruiter')
  @ApiOperation({ summary: 'Get my recruiter/coach profile' })
  getRecruiterProfile(@CurrentUser('id') userId: string) {
    return this.profilesService.getRecruiterProfile(userId);
  }

  @Put('recruiter')
  @ApiOperation({ summary: 'Create/update my recruiter/coach profile' })
  upsertRecruiterProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertRecruiterProfileDto,
  ) {
    return this.profilesService.upsertRecruiterProfile(userId, dto);
  }

  @Get('parent')
  @ApiOperation({ summary: 'Get my parent profile' })
  getParentProfile(@CurrentUser('id') userId: string) {
    return this.profilesService.getParentProfile(userId);
  }

  @Put('parent')
  @ApiOperation({ summary: 'Create/update my parent profile' })
  upsertParentProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertParentProfileDto,
  ) {
    return this.profilesService.upsertParentProfile(userId, dto);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get public profile by user ID' })
  getPublicProfile(@Param('userId') userId: string) {
    return this.profilesService.getPublicProfile(userId);
  }
}
