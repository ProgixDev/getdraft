import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import {
  CreateOutreachDto,
  UpdateOutreachStatusDto,
  SendOutreachMessageDto,
} from './dto/create-outreach.dto';
import { CurrentUserPayload, UserRole } from '../../common/types';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name);

  constructor(
    private supabaseService: SupabaseService,
    private notificationsService: NotificationsService,
  ) {}

  async createOutreach(user: CurrentUserPayload, dto: CreateOutreachDto) {
    if (user.role !== UserRole.RECRUITER && user.role !== UserRole.COACH) {
      throw new ForbiddenException('Only recruiters/coaches can send outreach');
    }

    const supabase = this.supabaseService.getAdminClient();

    const { data: parent } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', dto.parentId)
      .maybeSingle();
    if (!parent || parent.role !== UserRole.PARENT) {
      throw new BadRequestException('Target user is not a parent');
    }

    const { data: child } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', dto.childAthleteId)
      .maybeSingle();
    if (!child || child.role !== UserRole.ATHLETE) {
      throw new BadRequestException('Target child is not an athlete');
    }

    const { data: outreach, error } = await supabase
      .from('outreach')
      .insert({
        recruiter_id: user.id,
        parent_id: dto.parentId,
        child_athlete_id: dto.childAthleteId,
        message: dto.message,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('Outreach already sent to this parent');
      }
      throw new BadRequestException(error.message);
    }

    const { error: msgError } = await supabase
      .from('outreach_messages')
      .insert({
        outreach_id: outreach.id,
        sender_id: user.id,
        text: dto.message,
      });

    if (msgError) {
      // Compensating action: roll the outreach back so we don't leave an
      // empty thread visible to the parent.
      await supabase.from('outreach').delete().eq('id', outreach.id);
      this.logger.error(
        `Failed to seed outreach_messages for ${outreach.id}: ${msgError.message}`,
      );
      throw new BadRequestException(msgError.message);
    }

    // Push to the parent (best-effort; the method swallows its own errors)
    const { data: senderRow } = await supabase
      .from('users')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();
    const senderName = senderRow?.name ?? 'A recruiter';
    await this.notificationsService.sendPushToUser(
      dto.parentId,
      `${senderName} is interested in your athlete`,
      dto.message.length > 120 ? dto.message.slice(0, 117) + '…' : dto.message,
      { type: 'outreach', outreachId: outreach.id },
      'recruiterActivity',
    );

    return outreach;
  }

  async getOutreachList(userId: string, role: UserRole) {
    const supabase = this.supabaseService.getAdminClient();

    const column = role === UserRole.PARENT ? 'parent_id' : 'recruiter_id';
    const { data: outreachList } = await supabase
      .from('outreach')
      .select('*')
      .eq(column, userId)
      .order('created_at', { ascending: false });

    if (!outreachList || outreachList.length === 0) return [];

    const results = await Promise.all(
      outreachList.map(async (o) => {
        const { data: recruiter } = await supabase
          .from('users')
          .select('name')
          .eq('id', o.recruiter_id)
          .maybeSingle();

        const { data: rp } = await supabase
          .from('recruiter_profiles')
          .select('role_type, organization, verified')
          .eq('user_id', o.recruiter_id)
          .maybeSingle();

        const { data: child } = await supabase
          .from('users')
          .select('name')
          .eq('id', o.child_athlete_id)
          .maybeSingle();

        const { count: unreadCount } = await supabase
          .from('outreach_messages')
          .select('*', { count: 'exact', head: true })
          .eq('outreach_id', o.id)
          .eq('is_read', false)
          .neq('sender_id', userId);

        return {
          id: o.id,
          recruiterName: recruiter?.name || '',
          recruiterRole: rp?.role_type === 'coach' ? 'Coach' : 'Agent',
          organization: rp?.organization || '',
          childName: child?.name || '',
          message: o.message,
          sentAt: o.created_at,
          verified: rp?.verified || false,
          status: o.status,
          unreadCount: unreadCount || 0,
        };
      }),
    );

    return results;
  }

  async getOutreach(outreachId: string, userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data } = await supabase
      .from('outreach')
      .select('*')
      .eq('id', outreachId)
      .maybeSingle();

    if (!data) throw new NotFoundException('Outreach not found');
    if (data.parent_id !== userId && data.recruiter_id !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const { data: recruiter } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .eq('id', data.recruiter_id)
      .maybeSingle();

    const { data: rp } = await supabase
      .from('recruiter_profiles')
      .select('role_type, organization, verified, sport, bio')
      .eq('user_id', data.recruiter_id)
      .maybeSingle();

    const { data: parent } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .eq('id', data.parent_id)
      .maybeSingle();

    const { data: child } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .eq('id', data.child_athlete_id)
      .maybeSingle();

    return { ...data, recruiter, recruiter_profile: rp, parent, child };
  }

  async updateOutreachStatus(
    outreachId: string,
    userId: string,
    dto: UpdateOutreachStatusDto,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: outreach } = await supabase
      .from('outreach')
      .select('parent_id')
      .eq('id', outreachId)
      .maybeSingle();

    if (!outreach) throw new NotFoundException('Outreach not found');
    if (outreach.parent_id !== userId) {
      throw new ForbiddenException('Only the parent can update status');
    }

    const { data, error } = await supabase
      .from('outreach')
      .update({ status: dto.status })
      .eq('id', outreachId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    return data;
  }

  async deleteOutreach(outreachId: string, userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: outreach } = await supabase
      .from('outreach')
      .select('parent_id, recruiter_id')
      .eq('id', outreachId)
      .maybeSingle();

    if (!outreach) throw new NotFoundException('Outreach not found');
    if (outreach.parent_id !== userId && outreach.recruiter_id !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const { error } = await supabase
      .from('outreach')
      .delete()
      .eq('id', outreachId);

    if (error) throw new BadRequestException(error.message);
  }

  async sendMessage(
    outreachId: string,
    userId: string,
    dto: SendOutreachMessageDto,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: outreach } = await supabase
      .from('outreach')
      .select('parent_id, recruiter_id')
      .eq('id', outreachId)
      .maybeSingle();

    if (!outreach) throw new NotFoundException('Outreach not found');
    if (outreach.parent_id !== userId && outreach.recruiter_id !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const { data, error } = await supabase
      .from('outreach_messages')
      .insert({
        outreach_id: outreachId,
        sender_id: userId,
        text: dto.text,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    return data;
  }

  async getMessages(outreachId: string, userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: outreach } = await supabase
      .from('outreach')
      .select('parent_id, recruiter_id')
      .eq('id', outreachId)
      .maybeSingle();

    if (!outreach) throw new NotFoundException('Outreach not found');
    if (outreach.parent_id !== userId && outreach.recruiter_id !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const { data } = await supabase
      .from('outreach_messages')
      .select('*')
      .eq('outreach_id', outreachId)
      .order('created_at', { ascending: true });

    await supabase
      .from('outreach_messages')
      .update({ is_read: true })
      .eq('outreach_id', outreachId)
      .neq('sender_id', userId);

    return data || [];
  }
}
