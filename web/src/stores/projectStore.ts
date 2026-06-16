import { atom } from 'nanostores';

import { apiFetch } from '../lib/api/client';

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  membersCount: number;
  updatedText: string;
  status: 'active' | 'draft';
}

export interface Teammate {
  id: string;
  name: string;
  initials: string;
  role: 'APPROVER' | 'EDITOR' | 'VIEWER';
  isCreator?: boolean;
  email?: string;
}

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

const STORAGE_KEY_PROJECTS = 'orca_projects_list';
const STORAGE_KEY_PROJECT_MEMBERS = 'orca_project_members_';
const STORAGE_KEY_SESSION = 'orca_session_id';

let projectsLoadPromise: Promise<void> | null = null;
const projectMembersLoadPromises = new Map<string, Promise<void>>();

function loadProjectsFromStorage(): Project[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY_PROJECTS);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as Project[];
  } catch {
    return [];
  }
}

function saveProjectsToStorage(items: Project[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(items));
}

function loadProjectMembersFromStorage(projectId: string): Teammate[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY_PROJECT_MEMBERS + projectId);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as Teammate[];
  } catch {
    return [];
  }
}

function saveProjectMembersToStorage(projectId: string, members: Teammate[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_PROJECT_MEMBERS + projectId, JSON.stringify(members));
}

function loadSessionId(): string {
  if (typeof window === 'undefined') return 'user_session';
  let id = localStorage.getItem(STORAGE_KEY_SESSION);
  if (!id) {
    id = `user_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(STORAGE_KEY_SESSION, id);
  }
  return id;
}

function formatRelativeTime(isoTimestamp: string): string {
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

function mapApiProject(project: ApiProject): Project {
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

function mapApiProjectMember(member: ApiProjectMember, currentSessionId: string): Teammate {
  const displayName = member.session_id === currentSessionId ? 'You' : member.session_id;
  let role: Teammate['role'] = 'VIEWER';
  if (member.role === 'creator' || member.can_approve) {
    role = 'APPROVER';
  } else if (member.can_edit) {
    role = 'EDITOR';
  }

  return {
    id: member.id,
    name: member.role === 'creator' && member.session_id === currentSessionId ? 'You (Creator)' : displayName,
    initials: toInitials(displayName),
    role,
    isCreator: member.role === 'creator',
  };
}

export const projects = atom<Project[]>(loadProjectsFromStorage());
export const sessionId = atom<string>(loadSessionId());
export const projectMembersByProject = atom<Record<string, Teammate[]>>({});
export const toastMessages = atom<{ id: string; type: 'success' | 'warning' | 'error' | 'info'; text: string }[]>([]);
export const connectionError = atom<string | null>(null);
export const projectInvitationLinks = atom<Record<string, string>>({});

export function addToast(type: 'success' | 'warning' | 'error' | 'info', text: string) {
  const id = Math.random().toString(36).slice(2, 9);
  toastMessages.set([...toastMessages.get(), { id, type, text }]);
  setTimeout(() => {
    toastMessages.set(toastMessages.get().filter((item) => item.id !== id));
  }, 4000);
}

function upsertProject(project: Project) {
  const nextProjects = [project, ...projects.get().filter((item) => item.id !== project.id)];
  projects.set(nextProjects);
  saveProjectsToStorage(nextProjects);
}

export async function loadProjects(force = false) {
  if (typeof window === 'undefined') return;

  const currentProjects = projects.get();
  if (currentProjects.length > 0 && !force) {
    return;
  }

  if (projectsLoadPromise && !force) {
    await projectsLoadPromise;
    return;
  }

  const request = (async () => {
    try {
      const response = await apiFetch<ApiEnvelope<ApiProject[]>>('/api/projects', sessionId.get());
      const nextProjects = response.data.map(mapApiProject);
      projects.set(nextProjects);
      saveProjectsToStorage(nextProjects);
      connectionError.set(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load projects.';
      addToast('error', message);
      connectionError.set(message);
    } finally {
      projectsLoadPromise = null;
    }
  })();

  projectsLoadPromise = request;
  await request;
}

export async function ensureProjectMembersLoaded(projectId: string, force = false) {
  if (typeof window === 'undefined') return;
  const cached = projectMembersByProject.get()[projectId];
  if (cached && cached.length > 0 && !force) return;

  if (projectMembersLoadPromises.has(projectId) && !force) {
    await projectMembersLoadPromises.get(projectId);
    return;
  }

  const request = (async () => {
    try {
      const response = await apiFetch<ApiEnvelope<ApiProjectMember[]>>(
        `/api/projects/${projectId}/members`,
        sessionId.get(),
      );
      const members = response.data.map((member) => mapApiProjectMember(member, sessionId.get()));
      projectMembersByProject.set({
        ...projectMembersByProject.get(),
        [projectId]: members,
      });
      saveProjectMembersToStorage(projectId, members);
      connectionError.set(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load project members.';
      addToast('error', message);
      connectionError.set(message);
    } finally {
      projectMembersLoadPromises.delete(projectId);
    }
  })();

  projectMembersLoadPromises.set(projectId, request);
  await request;
}

export async function loadProjectInvitationLink(projectId: string): Promise<string> {
  const cached = projectInvitationLinks.get()[projectId];
  if (cached) return cached;

  try {
    const response = await apiFetch<ApiEnvelope<{ token: string }>>(
      `/api/projects/${projectId}/member-invitations/default`,
      sessionId.get(),
    );
    const link = `${window.location.origin}/invite/${response.data.token}`;
    projectInvitationLinks.set({
      ...projectInvitationLinks.get(),
      [projectId]: link,
    });
    return link;
  } catch {
    const fallback = `${window.location.origin}/invite/${projectId}`;
    projectInvitationLinks.set({
      ...projectInvitationLinks.get(),
      [projectId]: fallback,
    });
    return fallback;
  }
}

export async function createProject(name: string, description: string): Promise<string | null> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    addToast('error', 'Project name is required.');
    return null;
  }

  try {
    const response = await apiFetch<ApiEnvelope<ApiProject>>('/api/projects', sessionId.get(), {
      method: 'POST',
      body: JSON.stringify({ name: trimmedName, description }),
    });
    const createdProject = mapApiProject(response.data);
    upsertProject(createdProject);
    addToast('success', 'Project created successfully!');
    return createdProject.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create project.';
    addToast('error', message);
    return null;
  }
}

export async function renameProject(projectId: string, newName: string) {
  const trimmedName = newName.trim();
  if (!trimmedName) {
    addToast('warning', 'Project name cannot be empty.');
    return;
  }

  try {
    const response = await apiFetch<ApiEnvelope<ApiProject>>(`/api/projects/${projectId}`, sessionId.get(), {
      method: 'PATCH',
      body: JSON.stringify({ name: trimmedName }),
    });
    upsertProject(mapApiProject(response.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to rename project.';
    addToast('error', message);
    return;
  }
}

export async function deleteProject(projectId: string) {
  try {
    await apiFetch<null>(`/api/projects/${projectId}`, sessionId.get(), {
      method: 'DELETE',
    });

    const nextProjects = projects.get().filter((project) => project.id !== projectId);
    projects.set(nextProjects);
    saveProjectsToStorage(nextProjects);

    const nextMembers = { ...projectMembersByProject.get() };
    delete nextMembers[projectId];
    projectMembersByProject.set(nextMembers);

    addToast('warning', 'Project deleted successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete project.';
    addToast('error', message);
  }
}

export function getProjectMembers(projectId: string): Teammate[] {
  const cached = projectMembersByProject.get()[projectId];
  if (cached) return cached;

  const stored = loadProjectMembersFromStorage(projectId);
  if (stored.length > 0) {
    projectMembersByProject.set({
      ...projectMembersByProject.get(),
      [projectId]: stored,
    });
  }
  return stored;
}

export function addProjectMember(projectId: string, name: string, email: string, role: Teammate['role'] = 'VIEWER') {
  const currentMembers = projectMembersByProject.get()[projectId] || getProjectMembers(projectId);
  const newMember: Teammate = {
    id: `u_${Date.now()}`,
    name,
    initials: toInitials(name),
    role,
    isCreator: false,
    email,
  };
  const updatedMembers = [...currentMembers, newMember];
  projectMembersByProject.set({
    ...projectMembersByProject.get(),
    [projectId]: updatedMembers,
  });
  saveProjectMembersToStorage(projectId, updatedMembers);
  addToast('success', `Added ${name} to project as ${role}.`);
}

export function updateProjectMemberRole(projectId: string, memberId: string, role: Teammate['role']) {
  const currentMembers = projectMembersByProject.get()[projectId] || getProjectMembers(projectId);
  const updatedMembers = currentMembers.map((member) =>
    member.id === memberId ? { ...member, role } : member,
  );
  projectMembersByProject.set({
    ...projectMembersByProject.get(),
    [projectId]: updatedMembers,
  });
  saveProjectMembersToStorage(projectId, updatedMembers);
  addToast('success', `Updated user role to ${role}`);
}

export async function acceptMemberInvitation(token: string): Promise<string | null> {
  try {
    const response = await apiFetch<ApiEnvelope<{ project_id: string }>>(
      `/api/member-invitations/${token}/accept`,
      sessionId.get(),
      {
        method: 'POST',
      },
    );
    void loadProjects(true);
    return response.data.project_id;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to accept invitation.';
    addToast('error', message);
    return null;
  }
}
