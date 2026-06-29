import { apiFetch } from '../../lib/api/client';
import type {
  FileAccessUrl,
  Project,
  Teammate,
  ProjectMessage,
  ProjectCommand,
  ProjectMessageAttachment,
  ProjectSendMessageResult,
  ProjectFile,
  ApiEnvelope,
  ApiProject,
  ApiProjectCommand,
  ApiProjectMember,
  ApiProjectMessage,
  ApiSlashCommandResult,
  ApiProjectFile,
  ApiMemberInvitation,
  StructuredPlan,
  PlanVersion,
  ApiProjectPlan,
  ApiPlanVersion,
  PhaseAssignedMember,
  Task,
  RiskItem,
} from './types';

export interface ProjectRepository {
  fetchProjects(sessionId: string): Promise<Project[]>;
  fetchProjectMessages(projectId: string, sessionId: string): Promise<ProjectMessage[]>;
  fetchProjectCommands(projectId: string, sessionId: string): Promise<ProjectCommand[]>;
  createProjectMessage(
    projectId: string,
    payload: { content: string; attachments?: ProjectMessageAttachment[] },
    sessionId: string
  ): Promise<ProjectSendMessageResult>;
  fetchProjectFiles(projectId: string, sessionId: string): Promise<ProjectFile[]>;
  uploadProjectFile(
    projectId: string,
    file: File,
    sessionId: string,
    purpose?: 'chat' | 'source'
  ): Promise<ProjectFile>;
  promoteProjectFileToSource(projectId: string, fileId: string, sessionId: string): Promise<ProjectFile>;
  fetchProjectFileAccessUrl(projectId: string, fileId: string, sessionId: string): Promise<FileAccessUrl>;
  deleteProjectFile(projectId: string, fileId: string, sessionId: string): Promise<void>;
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
    planPatch: Partial<Pick<StructuredPlan, 'title' | 'description' | 'objectives'>>,
    sessionId: string
  ): Promise<StructuredPlan>;
  revertProjectPlan(projectId: string, sessionId: string): Promise<void>;
  createProjectPhase(projectId: string, title: string, goal: string, description: string, timeframe: string, assignedMembers: PhaseAssignedMember[], sessionId: string): Promise<void>;
  updateProjectPhase(projectId: string, phaseId: string, title: string, goal: string, description: string, timeframe: string, assignedMembers: PhaseAssignedMember[], sessionId: string): Promise<void>;
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

  async fetchProjectCommands(projectId: string, sessionId: string): Promise<ProjectCommand[]> {
    const response = await apiFetch<ApiEnvelope<ApiProjectCommand[]>>(
      `/api/projects/${projectId}/commands`,
      sessionId
    );
    return response.data.map((command) => ({
      name: command.name,
      description: command.description,
      usage: command.usage,
    }));
  }

  async createProjectMessage(
    projectId: string,
    payload: { content: string; attachments?: ProjectMessageAttachment[] },
    sessionId: string
  ): Promise<ProjectSendMessageResult> {
    const response = await apiFetch<ApiEnvelope<ApiProjectMessage | ApiSlashCommandResult>>(
      `/api/projects/${projectId}/messages`,
      sessionId,
      {
        method: 'POST',
        body: JSON.stringify({
          content: payload.content,
          attachments: (payload.attachments || []).map((attachment) => ({
            uploaded_file_id: attachment.uploadedFileId,
            filename: attachment.filename,
            mime_type: attachment.mimeType,
            storage_path: attachment.storagePath,
            size_bytes: attachment.sizeBytes,
          })),
        }),
      }
    );
    if ('ephemeral' in response.data && response.data.ephemeral) {
      return {
        kind: 'ephemeral',
        message: mapApiSlashCommandResult(projectId, sessionId, response.data),
      };
    }

    return {
      kind: 'message',
      message: mapApiProjectMessage(response.data),
    };
  }

  async fetchProjectFiles(projectId: string, sessionId: string): Promise<ProjectFile[]> {
    const response = await apiFetch<ApiEnvelope<ApiProjectFile[]>>(
      `/api/projects/${projectId}/files`,
      sessionId
    );
    return response.data.map(mapApiProjectFile);
  }

  async uploadProjectFile(
    projectId: string,
    file: File,
    sessionId: string,
    purpose: 'chat' | 'source' = 'source'
  ): Promise<ProjectFile> {
    const body = new FormData();
    body.set('file', file);
    body.set('purpose', purpose);

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

  async promoteProjectFileToSource(projectId: string, fileId: string, sessionId: string): Promise<ProjectFile> {
    const response = await apiFetch<ApiEnvelope<ApiProjectFile>>(
      `/api/projects/${projectId}/files/${fileId}/add-to-sources`,
      sessionId,
      {
        method: 'POST',
      }
    );
    return mapApiProjectFile(response.data);
  }

  async fetchProjectFileAccessUrl(projectId: string, fileId: string, sessionId: string): Promise<FileAccessUrl> {
    const response = await apiFetch<ApiEnvelope<{ signed_url: string }>>(
      `/api/projects/${projectId}/files/${fileId}/access-url`,
      sessionId
    );
    return {
      signedUrl: response.data.signed_url,
    };
  }

  async deleteProjectFile(projectId: string, fileId: string, sessionId: string): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/files/${fileId}`, sessionId, {
      method: 'DELETE',
    });
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
          can_edit: role === 'APPROVER',
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
          can_edit: role === 'APPROVER',
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
    planPatch: Partial<Pick<StructuredPlan, 'title' | 'description' | 'objectives'>>,
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
    assignedMembers: PhaseAssignedMember[],
    sessionId: string
  ): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/phases`, sessionId, {
      method: 'POST',
      body: JSON.stringify({
        title,
        goal,
        description,
        timeframe,
        assigned_members: assignedMembers.map((member) => ({
          session_id: member.sessionId,
          name: member.name,
          initials: member.initials,
          role: member.role,
        })),
      }),
    });
  }

  async updateProjectPhase(
    projectId: string,
    phaseId: string,
    title: string,
    goal: string,
    description: string,
    timeframe: string,
    assignedMembers: PhaseAssignedMember[],
    sessionId: string
  ): Promise<void> {
    await apiFetch<null>(`/api/projects/${projectId}/plan/phases/${phaseId}`, sessionId, {
      method: 'PATCH',
      body: JSON.stringify({
        title,
        goal,
        description,
        timeframe,
        assigned_members: assignedMembers.map((member) => ({
          session_id: member.sessionId,
          name: member.name,
          initials: member.initials,
          role: member.role,
        })),
      }),
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
const DISPLAY_TIME_ZONE = 'Asia/Manila';

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

  return new Date(isoTimestamp).toLocaleDateString(undefined, { timeZone: DISPLAY_TIME_ZONE });
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
    attachments: (message.attachments || []).map((attachment) => ({
      uploadedFileId: attachment.uploaded_file_id,
      filename: attachment.filename,
      mimeType: attachment.mime_type,
      storagePath: attachment.storage_path,
      sizeBytes: attachment.size_bytes,
    })),
    createdAt: message.created_at,
  };
}

export function mapApiSlashCommandResult(
  projectId: string,
  sessionId: string,
  result: ApiSlashCommandResult
): ProjectMessage {
  return {
    id: `ephemeral:${result.command}:${Math.random().toString(36).slice(2, 9)}`,
    projectId,
    sessionId,
    content: result.message,
    attachments: [],
    createdAt: new Date().toISOString(),
    isEphemeral: true,
    ephemeralLabel: 'Only visible to you',
    commandName: result.command,
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
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  });
}

export function formatDisplayTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  });
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
    technologyStack: [],
    phases: [],
    globalRisks: [],
  };
}

function recoverObjectiveText(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const recovered = extractObjectiveFromStringifiedMapping(trimmed);
      if (recovered) {
        return recovered;
      }
    }
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    const entry = value as Record<string, unknown>;
    for (const key of ['goal', 'title', 'description', 'detail', 'name', 'value'] as const) {
      const candidate = entry[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
  }

  return String(value ?? '');
}

function extractObjectiveFromStringifiedMapping(value: string): string | null {
  for (const key of ['goal', 'title', 'description', 'detail', 'name', 'value'] as const) {
    const pattern = new RegExp(`['"]${key}['"]\\s*:\\s*(['"])(.*?)\\1`);
    const match = value.match(pattern);
    if (match?.[2]?.trim()) {
      return match[2].trim();
    }
  }

  return null;
}

export function mapPlanStatus(plan: ApiProjectPlan): StructuredPlan['status'] {
  return 'draft';
}

export function mapPlan(plan: ApiProjectPlan, fallbackProjectId: string): StructuredPlan {
  const content = plan.content || {};
  const title = content.title || plan.title || '';
  const description = content.description || plan.description || '';
  const objectives = content.objectives || plan.objectives || [];
  const technologyStack = content.technology_stack || plan.technology_stack || [];
  const phases = content.phases || plan.phases || [];
  const globalRisks = content.global_risks || plan.global_risks || [];

  return {
    id: plan.id,
    projectId: plan.project_id || fallbackProjectId,
    title,
    description,
    status: mapPlanStatus(plan),
    version: plan.version || 1,
    createdAt: plan.created_at || '',
    updatedAt: plan.finalized_at || plan.created_at || '',
    objectives: objectives.map((objective) => recoverObjectiveText(objective)).filter(Boolean),
    technologyStack: technologyStack.map((item) => ({
      title: item.title || '',
      value: item.value || '',
    })),
    phases: phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      goal: phase.goal || '',
      description: phase.description || phase.value || '',
      timeframe: phase.timeframe || '',
      assignedMembers: (phase.assigned_members || []).map((member) => ({
        sessionId: member.session_id,
        name: member.name,
        initials: member.initials,
        role: member.role,
      })),
      tasks: (phase.tasks || []).map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description || task.value || '',
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
    globalRisks: globalRisks.map((risk) => ({
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
