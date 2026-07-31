import type {
  Activity,
  DraftEmail,
  LeadStage,
  ModifyActivityInput,
} from '@reap/shared';
import type { ActivityRepository } from '../repositories/activities.js';
import type { AuditRepository } from '../repositories/audit.js';
import type { LeadRepository } from '../repositories/leads.js';
import type { Mailer } from './mailer.js';

export class ActivityNotFoundError extends Error {
  constructor(id: string) {
    super(`Activity ${id} not found`);
    this.name = 'ActivityNotFoundError';
  }
}

export class ActivityAlreadyResolvedError extends Error {
  constructor(id: string, status: string) {
    super(`Activity ${id} is already ${status} and cannot be changed`);
    this.name = 'ActivityAlreadyResolvedError';
  }
}

export class NothingToSendError extends Error {
  constructor(id: string) {
    super(`Activity ${id} has no draft to send`);
    this.name = 'NothingToSendError';
  }
}

/**
 * Which pipeline stage an approved reply implies.
 *
 * Only forward-moving intents appear here. A follow-up or a complaint says
 * nothing reliable about deal progression, so those leave the stage untouched
 * rather than shuffling the board on every email.
 */
const STAGE_ADVANCEMENT: Partial<
  Record<Activity['classification']['intent'], LeadStage>
> = {
  new_lead: 'new',
  inquiry: 'qualified',
  showing_request: 'showing',
  offer: 'offer',
};

export interface ActivityServiceOptions {
  activities: ActivityRepository;
  leads: LeadRepository;
  audit: AuditRepository;
  mailer: Mailer;
}

/**
 * The human-in-the-loop boundary.
 *
 * Approve, modify, and dismiss are the only three ways an activity leaves the
 * pending state, and each writes an audit entry before returning. Sending is
 * the last step so that a mailer failure marks the activity failed rather than
 * leaving the record claiming a message went out that did not.
 */
export class ActivityService {
  constructor(private readonly options: ActivityServiceOptions) {}

  private requirePending(id: string): Activity {
    const activity = this.options.activities.findById(id);
    if (!activity) throw new ActivityNotFoundError(id);
    if (activity.status !== 'pending') {
      throw new ActivityAlreadyResolvedError(id, activity.status);
    }
    return activity;
  }

  /**
   * Edits the draft in place, keeping the activity pending.
   *
   * The before/after pair goes into the audit detail so a reviewer can see
   * exactly what the human changed about the machine's proposal.
   */
  modify(id: string, patch: ModifyActivityInput): Activity {
    const activity = this.requirePending(id);

    if (!activity.draft) throw new NothingToSendError(id);

    const updated: DraftEmail = {
      ...activity.draft,
      ...Object.fromEntries(
        Object.entries(patch.draft).filter(([, value]) => value !== undefined),
      ),
    };

    const result = this.options.activities.updateDraft(id, updated);
    if (!result) throw new ActivityNotFoundError(id);

    this.options.audit.record({
      actor: 'user',
      action: 'activity.modified',
      subjectType: 'activity',
      subjectId: id,
      summary: `Draft edited before approval on "${activity.message.subject}"`,
      detail: { before: activity.draft, after: updated },
    });

    return result;
  }

  /** Sends the draft, advances the lead, and records the decision. */
  async approve(id: string): Promise<Activity> {
    const activity = this.requirePending(id);

    if (!activity.draft) throw new NothingToSendError(id);

    try {
      await this.options.mailer.send(activity.draft);
    } catch (error) {
      const message = (error as Error).message;

      const failed = this.options.activities.setStatus(id, 'failed', {
        error: message,
      });

      this.options.audit.record({
        actor: 'system',
        action: 'activity.failed',
        subjectType: 'activity',
        subjectId: id,
        summary: `Delivery failed for "${activity.draft.subject}"`,
        detail: { error: message },
      });

      // Surface the original failure; the caller maps it to a 502.
      throw Object.assign(error as Error, { activity: failed });
    }

    const approved = this.options.activities.setStatus(id, 'approved');
    if (!approved) throw new ActivityNotFoundError(id);

    this.applyLeadSideEffects(activity);

    this.options.audit.record({
      actor: 'user',
      action: 'activity.approved',
      subjectType: 'activity',
      subjectId: id,
      summary: `Approved and sent "${activity.draft.subject}" to ${activity.draft.to}`,
      detail: {
        intent: activity.classification.intent,
        confidence: activity.classification.confidence,
        sent: activity.draft,
      },
    });

    return approved;
  }

  dismiss(id: string, reason?: string): Activity {
    const activity = this.requirePending(id);

    const dismissed = this.options.activities.setStatus(id, 'dismissed');
    if (!dismissed) throw new ActivityNotFoundError(id);

    this.options.audit.record({
      actor: 'user',
      action: 'activity.dismissed',
      subjectType: 'activity',
      subjectId: id,
      summary: `Dismissed "${activity.message.subject}" without sending`,
      detail: reason ? { reason } : null,
    });

    return dismissed;
  }

  /**
   * Updates the lead record to reflect the approved reply.
   *
   * Stages only ever move forward. A buyer who asks a question after touring
   * should not be dragged from "showing" back to "qualified".
   */
  private applyLeadSideEffects(activity: Activity): void {
    if (!activity.leadId) return;

    const lead = this.options.leads.findById(activity.leadId);
    if (!lead) return;

    this.options.leads.touchContact(lead.id);

    const target = STAGE_ADVANCEMENT[activity.classification.intent];
    if (!target) return;

    if (rank(target) > rank(lead.stage)) {
      this.options.leads.update(lead.id, { stage: target });

      this.options.audit.record({
        actor: 'system',
        action: 'lead.updated',
        subjectType: 'lead',
        subjectId: lead.id,
        summary: `Stage advanced from "${lead.stage}" to "${target}"`,
        detail: { activityId: activity.id, intent: activity.classification.intent },
      });
    }
  }
}

/** Progression order. `lost` is terminal and never a target of advancement. */
const STAGE_RANK: Record<LeadStage, number> = {
  new: 0,
  qualified: 1,
  showing: 2,
  offer: 3,
  closing: 4,
  lost: -1,
};

function rank(stage: LeadStage): number {
  return STAGE_RANK[stage];
}
