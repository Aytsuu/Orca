import { atom } from 'nanostores';
import type { Project } from './types';
import { defaultProjectRepository, type ProjectRepository } from './repository';
import { sessionId } from './session';
import { addToast, connectionError } from './toast';
import { projectMembersByProject } from './members';

const STORAGE_KEY_PROJECTS = 'orca_projects_list';

export function loadProjectsFromStorage(): Project[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY_PROJECTS);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as Project[];
  } catch {
    return [];
  }
}

export function saveProjectsToStorage(items: Project[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(items));
}

export const projects = atom<Project[]>(loadProjectsFromStorage());

let projectsLoadPromise: Promise<void> | null = null;

export function upsertProject(project: Project) {
  const nextProjects = [project, ...projects.get().filter((item) => item.id !== project.id)];
  projects.set(nextProjects);
  saveProjectsToStorage(nextProjects);
}

export async function loadProjects(force = false, repository: ProjectRepository = defaultProjectRepository) {
  if (typeof window === 'undefined') return;

  if (projectsLoadPromise && !force) {
    await projectsLoadPromise;
    return;
  }

  const request = (async () => {
    try {
      const nextProjects = await repository.fetchProjects(sessionId.get());
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

export async function createProject(
  name: string,
  description: string,
  repository: ProjectRepository = defaultProjectRepository
): Promise<string | null> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    addToast('error', 'Project name is required.');
    return null;
  }

  try {
    const createdProject = await repository.createProject(trimmedName, description, sessionId.get());
    upsertProject(createdProject);
    addToast('success', 'Project created successfully!');
    return createdProject.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create project.';
    addToast('error', message);
    return null;
  }
}

export async function renameProject(
  projectId: string,
  newName: string,
  repository: ProjectRepository = defaultProjectRepository
) {
  const trimmedName = newName.trim();
  if (!trimmedName) {
    addToast('warning', 'Project name cannot be empty.');
    return;
  }

  try {
    const updatedProject = await repository.renameProject(projectId, trimmedName, sessionId.get());
    upsertProject(updatedProject);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to rename project.';
    addToast('error', message);
    return;
  }
}

export async function deleteProject(
  projectId: string,
  repository: ProjectRepository = defaultProjectRepository
) {
  try {
    await repository.deleteProject(projectId, sessionId.get());

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
