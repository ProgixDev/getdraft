import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import {
  CreateOutreachDto,
  UpdateOutreachStatusDto,
  SendOutreachMessageDto,
} from './dto/create-outreach.dto';
import { CurrentUserPayload, UserRole } from '../../common/types';

@Injectable()
export class OutreachService {
  constructor(private supabaseService: SupabaseService) {}

  async createOutreach(user: CurrentUserPayload, dto: CreateOutreachDto) {
    if (user.role !== UserRole.RECRUITER && user.role !== UserRole.COACH) {
      throw new ForbiddenException('Only recruiters/coaches can send outreach');
    }

    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
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
        throw new BadRequestException('Outreach already sent to this parent');
      }
      throw new BadRequestException(error.message);
    }

    // Create initial message in outreach_messages
    await supabase.from('outreach_messages').insert({
      outreach_id: data.id,
      sender_id: user.id,
      text: dto.message,
    });

    return data;
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
          .single();

        const { data: rp } = await supabase
          .from('recruiter_profiles')
          .select('role_type, organization, verified')
          .eq('user_id', o.recruiter_id)
          .single();

        const { data: child } = await supabase
          .from('users')
          .select('name')
          .eq('id', o.child_athlete_id)
          .single();

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
      .single();

    if (!data) throw new NotFoundException('Outreach not found');
    if (data.parent_id !== userId && data.recruiter_id !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return data;
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
      .single();

    if (!outreach) throw new NotFoundException('Outreach not found');
    if (outreach.parent_id !== userId) {
      throw new ForbiddenException('Only the parent can update status');
    }

    const { data } = await supabase
      .from('outreach')
      .update({ status: dto.status, updated_at: new Date().toISOString() })
      .eq('id', outreachId)
      .select()
      .single();

    return data;
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
      .single();

    if (!outreach) throw new NotFoundException('Outreach not found');
    if (outreach.parent_id !== userId && outreach.recruiter_id !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const { data } = await supabase
      .from('outreach_messages')
      .insert({
        outreach_id: outreachId,
        sender_id: userId,
        text: dto.text,
      })
      .select()
      .single();

    return data;
  }

  async getMessages(outreachId: string, userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: outreach } = await supabase
      .from('outreach')
      .select('parent_id, recruiter_id')
      .eq('id', outreachId)
      .single();

    if (!outreach) throw new NotFoundException('Outreach not found');
    if (outreach.parent_id !== userId && outreach.recruiter_id !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const { data } = await supabase
      .from('outreach_messages')
      .select('*')
      .eq('outreach_id', outreachId)
      .order('created_at', { ascending: true });

    // Mark as read
    await supabase
      .from('outreach_messages')
      .update({ is_read: true })
      .eq('outreach_id', outreachId)
      .neq('sender_id', userId);

    return data || [];
  }
}
