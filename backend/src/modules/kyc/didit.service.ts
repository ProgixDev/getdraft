import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DIDIT_API_BASE = 'https://verification.didit.me/v2';

export type DiditSessionStatus =
  | 'Not Started'
  | 'In Progress'
  | 'In Review'
  | 'Approved'
  | 'Declined'
  | 'Abandoned'
  | 'Expired';

export interface DiditCreateSessionResponse {
  session_id: string;
  session_token?: string;
  url: string;
  vendor_data?: string | null;
  status: DiditSessionStatus;
  workflow_id?: string;
  expires_at?: string;
}

export interface DiditDecisionResponse {
  session_id: string;
  status: DiditSessionStatus;
  vendor_data?: string | null;
  workflow_id?: string;
  // The decision object's shape varies by workflow features (OCR, liveness,
  // face match, AML…). We pass it through as opaque JSONB to kyc_sessions.
  [key: string]: unknown;
}

@Injectable()
export class DiditService implements OnModuleInit {
  private readonly logger = new Logger(DiditService.name);
  private apiKey: string | null = null;
  private workflowId: string | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.configService.get<string>('DIDIT_API_KEY') ?? null;
    this.workflowId = this.configService.get<string>('DIDIT_WORKFLOW_ID') ?? null;
    if (!this.apiKey) {
      this.logger.warn(
        'DIDIT_API_KEY not set — KYC routes will return 503. Add it to .env.',
      );
    }
    if (!this.workflowId) {
      this.logger.warn(
        'DIDIT_WORKFLOW_ID not set — KYC routes will return 503. Set it to your default workflow id.',
      );
    }
    if (this.apiKey && this.workflowId) {
      this.logger.log(`Didit KYC ready (workflow ${this.workflowId})`);
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.workflowId;
  }

  getDefaultWorkflowId(): string {
    if (!this.workflowId) {
      throw new InternalServerErrorException('DIDIT_WORKFLOW_ID is not configured.');
    }
    return this.workflowId;
  }

  /**
   * Create a verification session. `vendor_data` is our user id — it
   * comes back on webhooks so we can map decisions back to the user.
   */
  async createSession(
    vendorData: string,
    callbackUrl: string,
  ): Promise<DiditCreateSessionResponse> {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException('Didit not configured on the backend.');
    }
    const body = {
      workflow_id: this.workflowId,
      vendor_data: vendorData,
      callback: callbackUrl,
    };
    const res = await fetch(`${DIDIT_API_BASE}/session/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Didit createSession ${res.status}: ${text.slice(0, 300)}`);
      throw new BadRequestException(`Didit refused the session: ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text) as DiditCreateSessionResponse;
    } catch {
      throw new InternalServerErrorException('Didit returned a non-JSON response.');
    }
  }

  /**
   * Fetch the latest decision payload for a session. Used both by
   * polling from the frontend and as a safety net if a webhook is
   * missed.
   */
  async getSessionDecision(sessionId: string): Promise<DiditDecisionResponse> {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException('Didit not configured on the backend.');
    }
    const res = await fetch(
      `${DIDIT_API_BASE}/session/${encodeURIComponent(sessionId)}/decision/`,
      {
        method: 'GET',
        headers: { 'x-api-key': this.apiKey! },
      },
    );
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Didit getDecision ${res.status}: ${text.slice(0, 300)}`);
      throw new BadRequestException(`Could not fetch decision: ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text) as DiditDecisionResponse;
    } catch {
      throw new InternalServerErrorException('Didit returned a non-JSON response.');
    }
  }
}

/** Map Didit's status strings → our compact internal enum. */
export function normalizeDiditStatus(
  status: DiditSessionStatus | undefined,
): 'pending' | 'in_review' | 'approved' | 'declined' | 'expired' {
  switch (status) {
    case 'Approved':
      return 'approved';
    case 'Declined':
      return 'declined';
    case 'In Review':
      return 'in_review';
    case 'Expired':
    case 'Abandoned':
      return 'expired';
    default:
      return 'pending';
  }
}
