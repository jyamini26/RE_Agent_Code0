import type { ActivityStatus, Intent } from '@reap/shared';

/** Display labels and tones for intents, kept out of the components. */
export const INTENT_LABEL: Record<Intent, string> = {
  inquiry: 'Inquiry',
  new_lead: 'New lead',
  showing_request: 'Showing request',
  offer: 'Offer',
  issue: 'Issue',
  follow_up: 'Follow-up',
  unknown: 'Unclassified',
};

export const INTENT_TONE: Record<
  Intent,
  'neutral' | 'accent' | 'positive' | 'caution' | 'critical'
> = {
  inquiry: 'accent',
  new_lead: 'positive',
  showing_request: 'positive',
  offer: 'accent',
  issue: 'critical',
  follow_up: 'caution',
  unknown: 'neutral',
};

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: 'Awaiting review',
  approved: 'Approved',
  dismissed: 'Dismissed',
  failed: 'Failed',
  held: 'Held',
};

export const STATUS_TONE: Record<
  ActivityStatus,
  'neutral' | 'accent' | 'positive' | 'caution' | 'critical'
> = {
  pending: 'accent',
  approved: 'positive',
  dismissed: 'neutral',
  failed: 'critical',
  held: 'critical',
};
