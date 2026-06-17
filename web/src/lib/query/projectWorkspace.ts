import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '../api/client';
import { sessionId } from '../../stores/projectStore';

interface ApiEnvelope<T> {
  data: T;
}

interface ApiProjectMembership {
  role: 'creator' | 'approver' | 'member';
  can_approve: boolean;
  can_edit: boolean;
}

interface ApiProject {
  id: string;
  name: string;
  description: string;
  created_at: string;
  member_count: number;
  membership: ApiProjectMembership;
}

interface ApiProjectMember {
  id: string;
  session_id: string;
  role: 'creator' | 'approver' | 'member';
  can_approve: boolean;
  can_edit: boolean;
}

export interface WorkspaceTeammate {
  id: string;
  sessionId: string;
  name: string;
  initials: string;
  role: 'APPROVER' | 'EDITOR' | 'VIEWER';
  isCreator: boolean;
  email?: string;
}

export interface ProjectWorkspace {
  project: ApiProject;
  teammates: WorkspaceTeammate[];
}

function toInitials(value: string): string {
  return (
    value
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'TM'
  );
}

function mapMember(member: ApiProjectMember, currentSessionId: string): WorkspaceTeammate {
  const isCurrentUser = member.session_id === currentSessionId;
  const displayName = isCurrentUser ? 'You' : member.session_id;

  let role: WorkspaceTeammate['role'] = 'VIEWER';
  if (member.role === 'creator' || member.can_approve) {
    role = 'APPROVER';
  } else if (member.can_edit) {
    role = 'EDITOR';
  }

  return {
    id: member.id,
    sessionId: member.session_id,
    name: member.role === 'creator' && isCurrentUser ? 'You (Creator)' : displayName,
    initials: toInitials(displayName),
    role,
    isCreator: member.role === 'creator',
  };
}

async function fetchProjectWorkspace(projectId: string): Promise<ProjectWorkspace> {
  const currentSessionId = sessionId.get();
  const [projectResponse, membersResponse] = await Promise.all([
    apiFetch<ApiEnvelope<ApiProject>>(`/api/projects/${projectId}`, currentSessionId),
    apiFetch<ApiEnvelope<ApiProjectMember[]>>(`/api/projects/${projectId}/members`, currentSessionId),
  ]);

  return {
    project: projectResponse.data,
    teammates: membersResponse.data.map((member) => mapMember(member, currentSessionId)),
  };
}

export function useProjectWorkspace(projectId: string) {
  return useQuery({
    queryKey: ['project-workspace', projectId],
    queryFn: () => fetchProjectWorkspace(projectId),
    enabled: Boolean(projectId),
  });
}
