import { atom } from 'nanostores';
import type { Teammate } from './types';
import { defaultProjectRepository, type ProjectRepository } from './repository';
import { sessionId } from './session';
import { addToast, connectionError } from './toast';

const STORAGE_KEY_PROJECT_MEMBERS = 'orca_project_members_';
const projectMembersLoadPromises = new Map<string, Promise<void>>();

export function loadProjectMembersFromStorage(projectId: string): Teammate[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY_PROJECT_MEMBERS + projectId);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as Teammate[];
  } catch {
    return [];
  }
}

export function saveProjectMembersToStorage(projectId: string, members: Teammate[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_PROJECT_MEMBERS + projectId, JSON.stringify(members));
}

export const projectMembersByProject = atom<Record<string, Teammate[]>>({});

export async function ensureProjectMembersLoaded(
  projectId: string,
  force = false,
  repository: ProjectRepository = defaultProjectRepository
) {
  if (typeof window === 'undefined') return;
  const cached = projectMembersByProject.get()[projectId];
  if (cached && cached.length > 0 && !force) return;

  if (projectMembersLoadPromises.has(projectId) && !force) {
    await projectMembersLoadPromises.get(projectId);
    return;
  }

  const request = (async () => {
    try {
      const members = await repository.fetchProjectMembers(projectId, sessionId.get());
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

export async function addProjectMember(
  projectId: string,
  name: string,
  email: string,
  role: Teammate['role'] = 'VIEWER',
  repository: ProjectRepository = defaultProjectRepository
) {
  try {
    await repository.createProjectInvitation(projectId, name, email, role, sessionId.get());
    addToast('success', `Invitation created for ${name}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create invitation.';
    addToast('error', message);
  }
}

export async function updateProjectMemberRole(
  projectId: string,
  memberId: string,
  role: Teammate['role'],
  repository: ProjectRepository = defaultProjectRepository
) {
  const currentMembers = projectMembersByProject.get()[projectId] || getProjectMembers(projectId);
  const existingMember = currentMembers.find((member) => member.id === memberId);
  if (!existingMember) {
    addToast('error', 'Member not found.');
    return;
  }

  try {
    const updatedMember = await repository.updateProjectMemberRole(
      projectId,
      existingMember.sessionId,
      role,
      sessionId.get()
    );
    const updatedMembers = currentMembers.map((member) =>
      member.id === memberId ? { ...member, ...updatedMember } : member
    );
    projectMembersByProject.set({
      ...projectMembersByProject.get(),
      [projectId]: updatedMembers,
    });
    saveProjectMembersToStorage(projectId, updatedMembers);
    addToast('success', `Updated user role to ${role}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update member role.';
    addToast('error', message);
  }
}
