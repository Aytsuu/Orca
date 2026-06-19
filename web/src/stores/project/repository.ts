import { apiFetch } from '../../lib/api/client';
import type {
  Project,
  Teammate,
  ProjectMessage,
  ProjectFile,
  ApiEnvelope,
  ApiProject,
  ApiProjectMember,
  ApiProjectMessage,
  ApiProjectFile,
  ApiMemberInvitation,
  StructuredPlan,
  PlanVersion,
  ApiProjectPlan,
  ApiPlanVersion,
  Task,
  RiskItem,
} from './types';

export interface ProjectRepository {
  fetchProjects(sessionId: string): Promise<Project[]>;
  fetchProjectMessages(projectId: string, sessionId: string): Promise<ProjectMessage[]>;
  createProjectMessage(projectId: string, content: string, sessionId: string): Promise<ProjectMessage>;
  fetchProjectFiles(projectId: string, sessionId: string): Promise<ProjectFile[]>;
  uploadProjectFile(projectId: string, file: File, sessionId: string): Promise<ProjectFile>;
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

  // Plan methods
  fetchProjectPlan(projectId: string, sessionId: string): Promise<StructuredPlan>;
  fetchProjectPlanVersions(projectId: string, sessionId: string): Promise<PlanVersion[]>;
  updateProjectPlan(
    projectId: string,
    planPatch: Partial<Pick<StructuredPlan, 'title' | 'description' | 'objectives' | 'stakeholders'>>,
    sessionId: string
  ): Promise<StructuredPlan>;
  revertProjectPlan(projectId: string, sessionId: string): Promise<void>;
  createProjectPhase(
    projectId: string,
    title: string,
    goal: string,
    description: string,
    timeframe: string,
    sessionId: string
  ): Promise<void>;
  updateProjectPhase(
    projectId: string,
    phaseId: string,
    title: string,
    goal: string,
    description: string,
    timeframe: string,
    sessionId: string
  ): Promise<void>;
  deleteProjectPhase(projectId: string, phaseId: string, sessionId: string): Promise<void>;
  createProjectTask(
    projectId: string,
    phaseId: string,
    title: string,
    owner: string,
    due: string,
    priority: string,
    sessionId: string
  ): Promise<void>;
  updateProjectTask(
    projectId: string,
    phaseId: string,
    taskId: string,
    updates: Partial<Pick<Task, 'title' | 'description' | 'owner' | 'due' | 'priority' | 'acceptanceCriteria'>>,
    sessionId: string
  ): Promise<void>;
  deleteProjectTask(projectId: string, phaseId: string, taskId: string, sessionId: string): Promise<void>;
  createProjectRisk(
    projectId: string,
    description: string,
    severity: string,
    mitigation: string,
    sessionId: string
  ): Promise<void>;
  updateProjectRisk(
    projectId: string,
    riskId: string,
    updates: Partial<Pick<RiskItem, 'description' | 'severity' | 'mitigation'>>,
    sessionId: string
  ): Promise<void>;
  deleteProjectRisk(projectId: string, riskId: string, sessionId: string): Promise<void>;
  dismissProjectGap(projectId: string, phaseId: string, gapId: string, sessionId: string): Promise<void>;
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

  async fetchProjectFiles(projectId: string, sessionId: string): Promise<ProjectFile[]> {
    const response = await apiFetch<ApiEnvelope<ApiProjectFile[]>>(
      `/api/projects/${projectId}/files`,
      sessionId
    );
    return response.data.map(mapApiProjectFile);
  }

  async uploadProjectFile(projectId: string, file: File, sessionId: string): Promise<ProjectFile> {
    const body = new FormData();
    body.set('file', file);

    const response = await fetch(`/api/projects/${projectId}/files/upload`, {
      method: 'POST',
      headers: {
        'X-Session-Id': sessionId,
      },
      body,
    });

    if (!response.ok) {
      const fallbackMessage = `Request failed with status ${response.status}`;
      const errorBody = (await response.json().catch(() => null)) as
        | { error?: { message?: string }; errorMessage?: string }
        | null;
      throw new Error(errorBody?.error?.message || errorBody?.errorMessage || fallbackMessage);
    }

    const payload = (await response.json()) as ApiEnvelope<ApiProjectFile>;
    return mapApiProjectFile(payload.data);
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

  async fetchProjectPlan(projectId: string, sessionId: string): Promise<StructuredPlan> {
    const response = await apiFetch<ApiEnvelope<ApiProjectPlan | null>>(
      `/api/projects/${projectId}/plan`,
      sessionId
    );
    return response.data ? mapPlan(response.data, projectId) : createEmptyPlan(projectId);
  }

  async fetchProjectPlanVersions(projectId: string, sessionId: string): Promise<PlanVersion[]> {
    const response = await apiFetch<ApiEnvelope<ApiPlanVersion[]>>(
      `/api/projects/${projectId}/plan/versions`,
      sessionId
    );
    return response.data.map(mapApiPlanVersion);
  }

  async updateProjectPlan(
    projectId: string,
    planPatch: Partial<Pick<StructuredPlan, 'title' | 'description' | 'objectives' | 'stakeholders'>>,
    sessionId: string
  ): Promise<StructuredPlan> {
    const response = await apiFetch<ApiEnvelope<ApiProjectPlan>>(
      `/api/projects/${projectId}/plan`,
      sessionId,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: planPatch.title,
          description: planPatch.description,
          objectives: planPatch.objectives,
          stakeholders: planPatch.stakeholders?.map((stakeholder) => ({
            user_id: stakeholder.userId,
            name: stakeholder.name,
            role: stakeholder.role,
            initials: stakeholder.initials,
          })),
        }),
      }
    );
    return mapPlan(response.data, projectId);
  }

  async revertProjectPlan(projectId: string, sessionId: string): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/revert`, sessionId, {
      method: 'POST',
    });
  }

  async createProjectPhase(
    projectId: string,
    title: string,
    goal: string,
    description: string,
    timeframe: string,
    sessionId: string
  ): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/phases`, sessionId, {
      method: 'POST',
      body: JSON.stringify({ title, goal, description, timeframe }),
    });
  }

  async updateProjectPhase(
    projectId: string,
    phaseId: string,
    title: string,
    goal: string,
    description: string,
    timeframe: string,
    sessionId: string
  ): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/phases/${phaseId}`, sessionId, {
      method: 'PATCH',
      body: JSON.stringify({ title, goal, description, timeframe }),
    });
  }

  async deleteProjectPhase(projectId: string, phaseId: string, sessionId: string): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/phases/${phaseId}?force=true`, sessionId, {
      method: 'DELETE',
    });
  }

  async createProjectTask(
    projectId: string,
    phaseId: string,
    title: string,
    owner: string,
    due: string,
    priority: string,
    sessionId: string
  ): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/phases/${phaseId}/tasks`, sessionId, {
      method: 'POST',
      body: JSON.stringify({
        title,
        owner,
        due,
        priority,
        description: '',
        acceptance_criteria: [],
      }),
    });
  }

  async updateProjectTask(
    projectId: string,
    phaseId: string,
    taskId: string,
    updates: Partial<Pick<Task, 'title' | 'description' | 'owner' | 'due' | 'priority' | 'acceptanceCriteria'>>,
    sessionId: string
  ): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/phases/${phaseId}/tasks/${taskId}`, sessionId, {
      method: 'PATCH',
      body: JSON.stringify({
        title: updates.title,
        owner: updates.owner,
        due: updates.due,
        priority: updates.priority,
        description: updates.description,
        acceptance_criteria: updates.acceptanceCriteria,
      }),
    });
  }

  async deleteProjectTask(projectId: string, phaseId: string, taskId: string, sessionId: string): Promise<void> {
    await apiFetch<null>(
      `/api/projects/${projectId}/plan/phases/${phaseId}/tasks/${taskId}`,
      sessionId,
      {
        method: 'DELETE',
      }
    );
  }

  async createProjectRisk(
    projectId: string,
    description: string,
    severity: string,
    mitigation: string,
    sessionId: string
  ): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/risks`, sessionId, {
      method: 'POST',
      body: JSON.stringify({ description, severity, mitigation }),
    });
  }

  async updateProjectRisk(
    projectId: string,
    riskId: string,
    updates: Partial<Pick<RiskItem, 'description' | 'severity' | 'mitigation'>>,
    sessionId: string
  ): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/risks/${riskId}`, sessionId, {
      method: 'PATCH',
      body: JSON.stringify({
        description: updates.description,
        severity: updates.severity,
        mitigation: updates.mitigation,
      }),
    });
  }

  async deleteProjectRisk(projectId: string, riskId: string, sessionId: string): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/risks/${riskId}`, sessionId, {
      method: 'DELETE',
    });
  }

  async dismissProjectGap(projectId: string, phaseId: string, gapId: string, sessionId: string): Promise<void> {
    await apiFetch<null>(
      `/api/projects/${projectId}/plan/phases/${phaseId}/gaps/${gapId}`,
      sessionId,
      {
        method: 'DELETE',
      }
    );
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

export function mapApiProjectFile(file: ApiProjectFile): ProjectFile {
  return {
    id: file.id,
    projectId: file.project_id,
    sessionId: file.session_id,
    filename: file.filename,
    mimeType: file.mime_type,
    storagePath: file.storage_path,
    sizeBytes: file.size_bytes,
    createdAt: file.created_at,
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

export function mapApiPlanVersion(version: ApiPlanVersion): PlanVersion {
  return {
    id: version.id,
    version: version.version,
    createdAt: version.created_at,
    status: version.status,
  };
}

export function formatDisplayDate(value?: string): string {
  if (!value) return 'Today';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function createEmptyPlan(projectId: string): StructuredPlan {
  return {
    id: `empty-${projectId}`,
    projectId,
    title: '',
    description: '',
    status: 'draft',
    version: 1,
    createdAt: '',
    updatedAt: '',
    objectives: [],
    stakeholders: [],
    phases: [],
    globalRisks: [],
  };
}

export function mapPlanStatus(plan: ApiProjectPlan): StructuredPlan['status'] {
  return 'draft';
}

export function mapPlan(plan: ApiProjectPlan, fallbackProjectId: string): StructuredPlan {
  return {
    id: plan.id,
    projectId: plan.project_id || fallbackProjectId,
    title: plan.title || '',
    description: plan.description || '',
    status: mapPlanStatus(plan),
    version: plan.version || 1,
    createdAt: plan.created_at || '',
    updatedAt: plan.finalized_at || plan.created_at || '',
    objectives: [...(plan.objectives || [])],
    stakeholders: (plan.stakeholders || []).map((stakeholder) => ({
      userId: stakeholder.user_id,
      name: stakeholder.name,
      role: stakeholder.role,
      initials: stakeholder.initials,
    })),
    phases: (plan.phases || []).map((phase) => ({
      id: phase.id,
      title: phase.title,
      goal: phase.goal || '',
      description: phase.description || '',
      timeframe: phase.timeframe || '',
      tasks: (phase.tasks || []).map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description || '',
        acceptanceCriteria: [...(task.acceptance_criteria || [])],
        owner: task.owner || undefined,
        due: task.due || undefined,
        priority: task.priority || 'medium',
        status: task.status === 'gap' ? 'gap' : 'accepted',
        attachments: (task.attachments || []).map((attachment) => ({
          id: attachment.id,
          name: attachment.filename,
          type: attachment.mime_type.startsWith('image/')
            ? 'image'
            : attachment.mime_type.startsWith('video/')
              ? 'video'
              : attachment.mime_type.startsWith('audio/')
                ? 'audio'
                : attachment.mime_type.includes('pdf') || attachment.mime_type.startsWith('text/')
                  ? 'document'
                  : 'other',
          sizeBytes: attachment.size_bytes,
          url: attachment.storage_path,
          uploadedBy: attachment.uploaded_by_session_id,
          uploadedAt: formatDisplayDate(attachment.uploaded_at),
        })),
        sourceMessageIds: [...(task.source_message_ids || [])],
        sourceExcerpt: task.source_excerpt || undefined,
        confidence: task.confidence || 'high',
      })),
      gaps: (phase.gaps || []).map((gap) => ({
        id: gap.id,
        description: gap.description,
        severity: gap.severity || 'minor',
        sourceMessageIds: [...(gap.source_message_ids || [])],
        sourceExcerpt: gap.source_excerpt || undefined,
      })),
    })),
    globalRisks: (plan.global_risks || []).map((risk) => ({
      id: risk.id,
      description: risk.description,
      severity: risk.severity || 'minor',
      mitigation: risk.mitigation || undefined,
      sourceMessageIds: [...(risk.source_message_ids || [])],
      sourceExcerpt: risk.source_excerpt || undefined,
    })),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
