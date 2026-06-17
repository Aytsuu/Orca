import { atom } from 'nanostores';
import { defaultProjectRepository, type ProjectRepository } from './repository';
import { sessionId } from './session';
import { addToast } from './toast';
import { loadProjects } from './projects';

export const projectInvitationLinks = atom<Record<string, string>>({});

export async function loadProjectInvitationLink(
  projectId: string,
  repository: ProjectRepository = defaultProjectRepository
): Promise<string> {
  const cached = projectInvitationLinks.get()[projectId];
  if (cached) return cached;

  try {
    const link = await repository.fetchProjectInvitationLink(projectId, sessionId.get());
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

export async function acceptMemberInvitation(
  token: string,
  repository: ProjectRepository = defaultProjectRepository
): Promise<string | null> {
  try {
    const projectId = await repository.acceptInvitation(token, sessionId.get());
    void loadProjects(true, repository);
    return projectId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to accept invitation.';
    addToast('error', message);
    return null;
  }
}
