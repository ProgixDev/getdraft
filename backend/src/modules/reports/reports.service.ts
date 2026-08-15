import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { CreateReportDto, ReportTargetType } from './dto/create-report.dto';

/**
 * User reports of users, posts, comments and messages.
 *
 * Google Play's UGC policy requires "an in-app system for reporting and
 * blocking UGC and users". The app had blocking since migration 002 but no
 * reporting, which is half the requirement -- and the half a reviewer is more
 * likely to look for on an app whose audience includes minors.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private supabaseService: SupabaseService) {}

  async create(reporterId: string, dto: CreateReportDto) {
    if (dto.reportedUserId === reporterId) {
      throw new BadRequestException('You cannot report yourself.');
    }

    // A report against a user who does not exist is either a stale client or
    // someone probing ids; either way it should not land in the queue.
    const supabase = this.supabaseService.getAdminClient();
    const { data: target } = await supabase
      .from('users')
      .select('id')
      .eq('id', dto.reportedUserId)
      .maybeSingle();
    if (!target) throw new NotFoundException('User not found');

    // A user-level report has no target_id. Anything else must name the item,
    // otherwise moderation gets "this person posted something bad" with no way
    // to find which post.
    if (dto.targetType !== ReportTargetType.USER && !dto.targetId) {
      throw new BadRequestException(
        `targetId is required when reporting a ${dto.targetType}.`,
      );
    }

    const { data, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: reporterId,
        reported_user_id: dto.reportedUserId,
        target_type: dto.targetType,
        target_id: dto.targetId ?? null,
        reason: dto.reason,
        details: dto.details ?? null,
      })
      .select('id, created_at')
      .single();

    if (error) {
      // 23505 = the unique index in migration 041. Reporting the same thing
      // twice is not an error worth showing the user: from their side the
      // report is filed either way, and saying "already reported" tells them
      // nothing useful and invites them to try again.
      if ((error as { code?: string }).code === '23505') {
        return { reported: true, duplicate: true };
      }
      this.logger.error(
        `report insert failed for reporter=${reporterId}: ${error.message}`,
      );
      throw new BadRequestException('Could not submit the report.');
    }

    this.logger.warn(
      `report filed: ${dto.targetType} ${dto.targetId ?? dto.reportedUserId} ` +
        `reason=${dto.reason} by=${reporterId}`,
    );

    return { reported: true, duplicate: false, id: data.id };
  }
}
