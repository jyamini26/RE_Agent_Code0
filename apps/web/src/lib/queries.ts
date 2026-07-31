import type { ActivityStatus, Comparable } from '@reap/shared';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from './api.js';

/**
 * Query keys, centralised.
 *
 * Everything a mutation must invalidate is derivable from one place, which is
 * what stops an approval from leaving a stale pipeline board on screen.
 */
export const keys = {
  health: ['health'] as const,
  agent: ['agent'] as const,
  inbox: ['inbox'] as const,
  activities: (status?: ActivityStatus) => ['activities', status ?? 'all'] as const,
  allActivities: ['activities'] as const,
  leads: ['leads'] as const,
  pipeline: ['pipeline'] as const,
  properties: ['properties'] as const,
  documents: ['documents'] as const,
  audit: ['audit'] as const,
};

/**
 * Approving an activity can send an email, advance a lead, and append to the
 * audit trail, so three unrelated views go stale at once. Doing the
 * invalidation in one helper keeps that coupling explicit.
 */
function invalidateAfterDecision(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: keys.allActivities });
  void client.invalidateQueries({ queryKey: keys.leads });
  void client.invalidateQueries({ queryKey: keys.pipeline });
  void client.invalidateQueries({ queryKey: keys.audit });
  void client.invalidateQueries({ queryKey: keys.inbox });
}

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: api.health,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useAgent() {
  return useQuery({
    queryKey: keys.agent,
    queryFn: api.agent,
    staleTime: Infinity,
  });
}

export function useInboxStatus() {
  return useQuery({
    queryKey: keys.inbox,
    queryFn: api.inboxStatus,
    refetchInterval: 30_000,
  });
}

export function useActivities(status?: ActivityStatus) {
  return useQuery({
    queryKey: keys.activities(status),
    queryFn: () => api.activities({ status, limit: 100 }),
  });
}

export function useLeads() {
  return useQuery({ queryKey: keys.leads, queryFn: () => api.leads({ limit: 200 }) });
}

export function usePipelineSummary() {
  return useQuery({ queryKey: keys.pipeline, queryFn: api.pipelineSummary });
}

export function useProperties() {
  return useQuery({
    queryKey: keys.properties,
    queryFn: () => api.properties({ limit: 100 }),
  });
}

export function useDocuments() {
  return useQuery({
    queryKey: keys.documents,
    queryFn: () => api.documents({ limit: 100 }),
  });
}

export function useAudit(subjectId?: string) {
  return useQuery({
    queryKey: [...keys.audit, subjectId ?? 'all'],
    queryFn: () => api.audit({ subjectId, limit: 100 }),
  });
}

export function useApproveActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.approveActivity(id),
    onSuccess: () => invalidateAfterDecision(client),
  });
}

export function useDismissActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.dismissActivity(id, reason),
    onSuccess: () => invalidateAfterDecision(client),
  });
}

export function useModifyActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      draft,
    }: {
      id: string;
      draft: { subject?: string; body?: string };
    }) => api.modifyActivity(id, draft),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.allActivities });
      void client.invalidateQueries({ queryKey: keys.audit });
    },
  });
}

export function usePollInbox() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.pollInbox,
    onSuccess: () => invalidateAfterDecision(client),
  });
}

export function useUpdateLead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      stage,
    }: {
      id: string;
      stage: Parameters<typeof api.updateLead>[1]['stage'];
    }) => api.updateLead(id, { stage }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.leads });
      void client.invalidateQueries({ queryKey: keys.pipeline });
      void client.invalidateQueries({ queryKey: keys.audit });
    },
  });
}

export function useGenerateDocument() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (
      input:
        | { kind: 'cma'; propertyId: string; comparables: Comparable[] }
        | { kind: 'brochure'; propertyId: string },
    ) =>
      input.kind === 'cma'
        ? api.generateCma(input.propertyId, input.comparables)
        : api.generateBrochure(input.propertyId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.documents });
      void client.invalidateQueries({ queryKey: keys.audit });
    },
  });
}
