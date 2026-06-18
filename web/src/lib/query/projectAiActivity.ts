import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../api/client';
import { sessionId } from '../../stores/project/session';

type AgentName = 'monitor' | 'analyzer' | 'planner' | 'updater';
type AgentState = 'idle' | 'queued' | 'running' | 'completed' | 'failed';
type ActivityKind = 'proposal_change' | 'gap' | 'risk' | 'insight';

interface ApiEnvelope<T> {
  data: T;
}

interface ApiAgentStatus {
  id: string;
  project_id: string;
  agent: AgentName;
  status: AgentState;
  updated_at: string;
}

interface ApiActivityItem {
  id: string;
  artifact_id: string;
  agent: AgentName;
  kind: ActivityKind;
  title: string;
  detail: string;
  actionable: boolean;
  proposal_change?: Record<string, unknown> | null;
  created_at: string;
}

interface ApiActivityPromoteResult {
  proposal_id: string;
  change_ids: string[];
}

export type ActivityStatus = 'active' | 'idle' | 'complete' | 'error';

export interface ActivitySuggestion {
  id: string;
  type: 'SUGGESTION' | 'GAP' | 'TASK' | 'INSIGHT';
  content: string;
  actionable: boolean;
  actionLabel?: string;
}

export interface ActivityItem {
  id: string;
  agent: AgentName;
  kind: ActivityKind;
  title: string;
  detail: string;
  actionable: boolean;
  createdAt: string;
}

export interface ProjectAiActivity {
  agentStatus: Record<string, ActivityStatus>;
  recentActivity: string | null;
  items: ActivityItem[];
  suggestions: ActivitySuggestion[];
}

const projectAiActivityQueryKey = (projectId: string) => ['project-ai-activity', projectId] as const;

async function fetchProjectAiActivity(projectId: string): Promise<ProjectAiActivity> {
  const currentSessionId = sessionId.get();
  const [statusesResponse, activityResponse] = await Promise.all([
    apiFetch<ApiEnvelope<ApiAgentStatus[]>>(`/api/projects/${projectId}/agents/status`, currentSessionId),
    apiFetch<ApiEnvelope<ApiActivityItem[]>>(`/api/projects/${projectId}/agents/activity`, currentSessionId),
  ]);

  return {
    agentStatus: mapAgentStatuses(statusesResponse.data),
    recentActivity: summarizeRecentActivity(statusesResponse.data),
    items: activityResponse.data.map(mapActivityItem),
    suggestions: activityResponse.data.map(mapActivitySuggestion),
  };
}

export function useProjectAiActivity(projectId: string) {
  return useQuery({
    queryKey: projectAiActivityQueryKey(projectId),
    queryFn: () => fetchProjectAiActivity(projectId),
    enabled: Boolean(projectId),
    refetchInterval: 3000,
  });
}

export function usePromoteAiActivityItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiFetch<ApiEnvelope<ApiActivityPromoteResult>>(
        `/api/projects/${projectId}/agents/activity/${itemId}/promote`,
        sessionId.get(),
        { method: 'POST' }
      );
      return response.data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectAiActivityQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project-plan-proposal', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-plan', projectId] });
    },
  });
}

export function usePromoteAllAiActivity(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiFetch<ApiEnvelope<ApiActivityPromoteResult>>(
        `/api/projects/${projectId}/agents/activity/promote-all`,
        sessionId.get(),
        { method: 'POST' }
      );
      return response.data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectAiActivityQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project-plan-proposal', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-plan', projectId] });
    },
  });
}

function mapActivityItem(item: ApiActivityItem): ActivityItem {
  return {
    id: item.id,
    agent: item.agent,
    kind: item.kind,
    title: item.title,
    detail: item.detail,
    actionable: item.actionable,
    createdAt: item.created_at,
  };
}

function mapActivitySuggestion(item: ApiActivityItem): ActivitySuggestion {
  let type: ActivitySuggestion['type'] = 'SUGGESTION';
  let actionLabel: string | undefined;

  if (item.kind === 'gap') {
    type = 'GAP';
  } else if (item.kind === 'risk') {
    type = 'GAP';
  } else if (item.kind === 'proposal_change') {
    type = 'TASK';
    actionLabel = 'Send to review';
  } else if (item.kind === 'insight') {
    type = 'INSIGHT';
  }

  return {
    id: item.id,
    type,
    content: item.detail || item.title,
    actionable: item.actionable,
    actionLabel,
  };
}

export function mapAgentStatuses(statuses: ApiAgentStatus[]): Record<string, ActivityStatus> {
  const base: Record<string, ActivityStatus> = {
    MONITOR: 'idle',
    ANALYZER: 'idle',
    PLANNER: 'idle',
    UPDATER: 'idle',
  };

  for (const item of statuses) {
    const key = item.agent.toUpperCase();
    if (item.status === 'running' || item.status === 'queued') {
      base[key] = 'active';
    } else if (item.status === 'failed') {
      base[key] = 'error';
    } else {
      base[key] = 'idle';
    }
  }

  return base;
}

export function summarizeRecentActivity(statuses: ApiAgentStatus[]): string | null {
  const completedStatuses = statuses
    .filter((item) => item.status === 'completed' && item.updated_at)
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());

  if (completedStatuses.length === 0) {
    return null;
  }

  const recentWindowMs = 10 * 60 * 1000;
  const now = Date.now();
  const recentCompleted = completedStatuses.filter((item) => {
    const updatedAt = new Date(item.updated_at).getTime();
    return !Number.isNaN(updatedAt) && now - updatedAt <= recentWindowMs;
  });

  if (recentCompleted.length === 0) {
    return null;
  }

  const completedAgents = new Set(recentCompleted.map((item) => item.agent));
  if (completedAgents.size === 4) {
    return 'All orcas completed a recent run.';
  }

  const latest = recentCompleted[0];
  const agentLabel = latest.agent.charAt(0).toUpperCase() + latest.agent.slice(1);
  return `${agentLabel} orca completed a recent run.`;
}
