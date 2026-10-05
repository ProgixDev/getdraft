import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { UpsertAthleteProfileDto } from './dto/athlete-profile.dto';
import { UpsertRecruiterProfileDto } from './dto/recruiter-profile.dto';
import { UpsertParentProfileDto } from './dto/parent-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../../common/types';

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

  // The three PUTs pass the caller's role: each profile type can only be
  // written by the account type it belongs to (403 otherwise), and the
  // recruiter profile's role_type is derived from it. See the service.
  @Put('athlete')
  @ApiOperation({ summary: 'Create/update my athlete profile (athletes only)' })
  upsertAthleteProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertAthleteProfileDto,
  ) {
    return this.profilesService.upsertAthleteProfile(user.id, user.role, dto);
  }

  @Get('recruiter')
  @ApiOperation({ summary: 'Get my coach / agent / team profile' })
  getRecruiterProfile(@CurrentUser('id') userId: string) {
    return this.profilesService.getRecruiterProfile(userId);
  }

  @Put('recruiter')
  @ApiOperation({
    summary: 'Create/update my coach / agent / team profile (those roles only)',
  })
  upsertRecruiterProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertRecruiterProfileDto,
  ) {
    return this.profilesService.upsertRecruiterProfile(user.id, user.role, dto);
  }

  @Get('parent')
  @ApiOperation({ summary: 'Get my parent profile' })
  getParentProfile(@CurrentUser('id') userId: string) {
    return this.profilesService.getParentProfile(userId);
  }

  @Put('parent')
  @ApiOperation({ summary: 'Create/update my parent profile (parents only)' })
  upsertParentProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertParentProfileDto,
  ) {
    return this.profilesService.upsertParentProfile(user.id, user.role, dto);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get public profile by user ID' })
  getPublicProfile(
    @CurrentUser() viewer: CurrentUserPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    // The viewer's role decides what is shared (see the service): coaches,
    // agents and teams get the guardian id outreach needs, nobody else does.
    return this.profilesService.getPublicProfile(
      userId,
      viewer?.id,
      viewer?.role,
    );
  }
}
