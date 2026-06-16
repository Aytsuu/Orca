import { apiFetch } from '../../lib/api/client';
import type {
  Project,
  Teammate,
  ProjectMessage,
  ApiEnvelope,
  ApiProject,
  ApiProjectMember,
  ApiProjectMessage,
  ApiMemberInvitation,
} from './types';

export interface ProjectRepository {
  fetchProjects(sessionId: string): Promise<Project[]>;
  fetchProjectMessages(projectId: string, sessionId: string): Promise<ProjectMessage[]>;
  createProjectMessage(projectId: string, content: string, sessionId: string): Promise<ProjectMessage>;
  fetchProjectMembers(projectId: string, sessionId: string): Promise<Teammate[]>;
  fetchProjectInvitationLink(projectId: string, sessionId: string): Promise<string>;
  createProjectInvitation(
    projectId: string,
    inviteeName: string,
    inviteeEmail: string,
    role: Teammate['role'],
    sessionId: string
  ): Promise<ApiMemberInvitation>;
  updateProjectMemberRole(
    projectId: string,
    memberSessionId: string,
    role: Teammate['role'],
    sessionId: string
  ): Promise<Teammate>;
  createProject(name: string, description: string, sessionId: string): Promise<Project>;
  renameProject(projectId: string, newName: string, sessionId: string): Promise<Project>;
  deleteProject(projectId: string, sessionId: string): Promise<void>;
  acceptInvitation(token: string, sessionId: string): Promise<string>;
}

export class ApiProjectRepository implements ProjectRepository {
  async fetchProjects(sessionId: string): Promise<Project[]> {
    const response = await apiFetch<ApiEnvelope<ApiProject[]>>('/api/projects', sessionId);
    return response.data.map(mapApiProject);
  }

  async fetchProjectMessages(projectId: string, sessionId: string): Promise<ProjectMessage[]> {
    const response = await apiFetch<ApiEnvelope<ApiProjectMessage[]>>(
      `/api/projects/${projectId}/messages`,
      sessionId
    );
    return response.data.map(mapApiProjectMessage);
  }

  async createProjectMessage(
    projectId: string,
    content: string,
    sessionId: string
  ): Promise<ProjectMessage> {
    const response = await apiFetch<ApiEnvelope<ApiProjectMessage>>(
      `/api/projects/${projectId}/messages`,
      sessionId,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      }
    );
    return mapApiProjectMessage(response.data);
  }

  async fetchProjectMembers(projectId: string, sessionId: string): Promise<Teammate[]> {
    const response = await apiFetch<ApiEnvelope<ApiProjectMember[]>>(
      `/api/projects/${projectId}/members`,
      sessionId
    );
    return response.data.map((member) => mapApiProjectMember(member, sessionId));
  }

  async fetchProjectInvitationLink(projectId: string, sessionId: string): Promise<string> {
    const response = await apiFetch<ApiEnvelope<{ token: string }>>(
      `/api/projects/${projectId}/member-invitations/default`,
      sessionId
    );
    return `${window.location.origin}/invite/${response.data.token}`;
  }

  async createProjectInvitation(
    projectId: string,
    inviteeName: string,
    inviteeEmail: string,
    role: Teammate['role'],
    sessionId: string
  ): Promise<ApiMemberInvitation> {
    const response = await apiFetch<ApiEnvelope<ApiMemberInvitation>>(
      `/api/projects/${projectId}/member-invitations`,
      sessionId,
      {
        method: 'POST',
        body: JSON.stringify({
          invitee_name: inviteeName,
          invitee_email: inviteeEmail,
          role: role === 'APPROVER' ? 'approver' : 'member',
          can_approve: role === 'APPROVER',
          can_edit: role !== 'VIEWER',
        }),
      }
    );
    return response.data;
  }

  async updateProjectMemberRole(
    projectId: string,
    memberSessionId: string,
    role: Teammate['role'],
    sessionId: string
  ): Promise<Teammate> {
    const response = await apiFetch<ApiEnvelope<ApiProjectMember>>(
      `/api/projects/${projectId}/members/${memberSessionId}/permissions`,
      sessionId,
      {
        method: 'PATCH',
        body: JSON.stringify({
          can_approve: role === 'APPROVER',
          can_edit: role !== 'VIEWER',
        }),
      }
    );
    return mapApiProjectMember(response.data, sessionId);
  }

  async createProject(name: string, description: string, sessionId: string): Promise<Project> {
    const response = await apiFetch<ApiEnvelope<ApiProject>>('/api/projects', sessionId, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    return mapApiProject(response.data);
  }

  async renameProject(projectId: string, newName: string, sessionId: string): Promise<Project> {
    const response = await apiFetch<ApiEnvelope<ApiProject>>(`/api/projects/${projectId}`, sessionId, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName }),
    });
    return mapApiProject(response.data);
  }

  async deleteProject(projectId: string, sessionId: string): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}`, sessionId, {
      method: 'DELETE',
    });
  }

  async acceptInvitation(token: string, sessionId: string): Promise<string> {
    const response = await apiFetch<ApiEnvelope<{ project_id: string }>>(
      `/api/member-invitations/${token}/accept`,
      sessionId,
      {
        method: 'POST',
      }
    );
    return response.data.project_id;
  }
}

// Default instance
export const defaultProjectRepository: ProjectRepository = new ApiProjectRepository();

// Helper Mapping Functions
export function formatRelativeTime(isoTimestamp: string): string {
  const timestamp = new Date(isoTimestamp).getTime();
  if (Number.isNaN(timestamp)) return 'Recently';

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(isoTimestamp).toLocaleDateString();
}

export function toInitials(value: string): string {
  return (
    value
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'TM'
  );
}

export function mapApiProject(project: ApiProject): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.created_at,
    membersCount: project.member_count,
    updatedText: formatRelativeTime(project.created_at),
    status: 'active',
  };
}

export function mapApiProjectMessage(message: ApiProjectMessage): ProjectMessage {
  return {
    id: message.id,
    projectId: message.project_id,
    sessionId: message.session_id,
    content: message.content,
    createdAt: message.created_at,
  };
}

export function mapApiProjectMember(member: ApiProjectMember, currentSessionId: string): Teammate {
  const displayName = member.session_id === currentSessionId ? 'You' : member.session_id;
  let role: Teammate['role'] = 'VIEWER';
  if (member.role === 'creator' || member.can_approve) {
    role = 'APPROVER';
  } else if (member.can_edit) {
    role = 'EDITOR';
  }

  return {
    id: member.id,
    sessionId: member.session_id,
    name: member.role === 'creator' && member.session_id === currentSessionId ? 'You (Creator)' : displayName,
    initials: toInitials(displayName),
    role,
    isCreator: member.role === 'creator',
  };
}
