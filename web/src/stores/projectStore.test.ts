import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock API client before importing stores
vi.mock('../lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

// Set up DOM globals for storage testing
const mockStore = new Map<string, string>();
global.window = {
  location: {
    origin: 'http://localhost:3000',
  },
} as any;

global.localStorage = {
  getItem: (key: string) => mockStore.get(key) || null,
  setItem: (key: string, value: string) => {
    mockStore.set(key, value);
  },
  removeItem: (key: string) => {
    mockStore.delete(key);
  },
  clear: () => {
    mockStore.clear();
  },
} as any;

// Now import the facade exports
import {
  toastMessages,
  addToast,
  connectionError,
  sessionId,
  projects,
  projectMembersByProject,
  projectInvitationLinks,
  loadProjects,
  createProject,
  renameProject,
  deleteProject,
  ensureProjectMembersLoaded,
  getProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  loadProjectInvitationLink,
  acceptMemberInvitation,
} from './projectStore';

import type { Project, Teammate } from './project/types';
import { type ProjectRepository } from './project/repository';

describe('projectStore tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
    toastMessages.set([]);
    connectionError.set(null);
    projects.set([]);
    projectMembersByProject.set({});
    projectInvitationLinks.set({});
    vi.useFakeTimers();
  });

  describe('Toast Store', () => {
    it('adds and auto-removes toast messages', () => {
      addToast('success', 'Project created successfully!');
      let list = toastMessages.get();
      expect(list).toHaveLength(1);
      expect(list[0].type).toBe('success');
      expect(list[0].text).toBe('Project created successfully!');

      // Fast-forward 4 seconds
      vi.advanceTimersByTime(4000);
      expect(toastMessages.get()).toHaveLength(0);
    });
  });

  describe('Session Store', () => {
    it('sets session ID', () => {
      expect(sessionId.get()).toBeDefined();
    });
  });

  describe('Projects Store', () => {
    const mockRepo: ProjectRepository = {
      fetchProjects: vi.fn(),
      fetchProjectMembers: vi.fn(),
      fetchProjectInvitationLink: vi.fn(),
      createProjectInvitation: vi.fn(),
      updateProjectMemberRole: vi.fn(),
      createProject: vi.fn(),
      renameProject: vi.fn(),
      deleteProject: vi.fn(),
      acceptInvitation: vi.fn(),
    };

    it('loads projects successfully', async () => {
      const mockProjects: Project[] = [
        {
          id: 'proj_1',
          name: 'Project A',
          description: 'Desc A',
          createdAt: new Date().toISOString(),
          membersCount: 2,
          updatedText: 'Recently',
          status: 'active',
        },
      ];

      (mockRepo.fetchProjects as Mock).mockResolvedValue(mockProjects);

      await loadProjects(true, mockRepo);

      expect(projects.get()).toEqual(mockProjects);
      expect(connectionError.get()).toBeNull();
      expect(JSON.parse(mockStore.get('orca_projects_list') || '[]')).toEqual(mockProjects);
    });

    it('revalidates projects even when cached projects already exist', async () => {
      const cachedProject: Project = {
        id: 'proj_cached',
        name: 'Cached Project',
        description: 'Old cache',
        createdAt: new Date().toISOString(),
        membersCount: 1,
        updatedText: 'Recently',
        status: 'active',
      };
      const freshProjects: Project[] = [
        {
          id: 'proj_fresh',
          name: 'Fresh Project',
          description: 'From API',
          createdAt: new Date().toISOString(),
          membersCount: 2,
          updatedText: 'Recently',
          status: 'active',
        },
      ];

      projects.set([cachedProject]);
      (mockRepo.fetchProjects as Mock).mockResolvedValue(freshProjects);

      await loadProjects(false, mockRepo);

      expect(mockRepo.fetchProjects).toHaveBeenCalledTimes(1);
      expect(projects.get()).toEqual(freshProjects);
    });

    it('handles load projects error', async () => {
      (mockRepo.fetchProjects as Mock).mockRejectedValue(new Error('Network error'));

      await loadProjects(true, mockRepo);

      expect(connectionError.get()).toBe('Network error');
      expect(toastMessages.get()).toHaveLength(1);
      expect(toastMessages.get()[0].type).toBe('error');
    });

    it('creates a project successfully', async () => {
      const mockProject: Project = {
        id: 'proj_new',
        name: 'New Project',
        description: 'New Desc',
        createdAt: new Date().toISOString(),
        membersCount: 1,
        updatedText: 'Recently',
        status: 'active',
      };

      (mockRepo.createProject as Mock).mockResolvedValue(mockProject);

      const newId = await createProject('New Project', 'New Desc', mockRepo);

      expect(newId).toBe('proj_new');
      expect(projects.get()).toContainEqual(mockProject);
      expect(toastMessages.get()).toHaveLength(1);
      expect(toastMessages.get()[0].type).toBe('success');
    });

    it('validates project creation name', async () => {
      const newId = await createProject('  ', 'Desc', mockRepo);
      expect(newId).toBeNull();
      expect(toastMessages.get()).toHaveLength(1);
      expect(toastMessages.get()[0].type).toBe('error');
    });

    it('renames a project successfully', async () => {
      const existingProject: Project = {
        id: 'proj_1',
        name: 'Old Name',
        description: 'Desc',
        createdAt: new Date().toISOString(),
        membersCount: 1,
        updatedText: 'Recently',
        status: 'active',
      };
      projects.set([existingProject]);

      const updatedProject = { ...existingProject, name: 'Renamed Project' };
      (mockRepo.renameProject as Mock).mockResolvedValue(updatedProject);

      await renameProject('proj_1', 'Renamed Project', mockRepo);

      expect(projects.get()[0].name).toBe('Renamed Project');
    });

    it('deletes a project successfully', async () => {
      const projectToDelete: Project = {
        id: 'proj_to_delete',
        name: 'To Delete',
        description: 'Desc',
        createdAt: new Date().toISOString(),
        membersCount: 1,
        updatedText: 'Recently',
        status: 'active',
      };
      projects.set([projectToDelete]);
      projectMembersByProject.set({ proj_to_delete: [] });

      (mockRepo.deleteProject as Mock).mockResolvedValue(undefined);

      await deleteProject('proj_to_delete', mockRepo);

      expect(projects.get()).toHaveLength(0);
      expect(projectMembersByProject.get()['proj_to_delete']).toBeUndefined();
      expect(toastMessages.get()).toHaveLength(1);
      expect(toastMessages.get()[0].type).toBe('warning');
    });
  });

  describe('Members Store', () => {
    const mockRepo: ProjectRepository = {
      fetchProjects: vi.fn(),
      fetchProjectMembers: vi.fn(),
      fetchProjectInvitationLink: vi.fn(),
      createProjectInvitation: vi.fn(),
      updateProjectMemberRole: vi.fn(),
      createProject: vi.fn(),
      renameProject: vi.fn(),
      deleteProject: vi.fn(),
      acceptInvitation: vi.fn(),
    };

    it('ensures members are loaded successfully', async () => {
      const mockMembers: Teammate[] = [
        {
          id: 'u_1',
          sessionId: 'alpha',
          name: 'Sarah Connor',
          initials: 'SC',
          role: 'APPROVER',
          isCreator: true,
        },
      ];

      (mockRepo.fetchProjectMembers as Mock).mockResolvedValue(mockMembers);

      await ensureProjectMembersLoaded('proj_1', true, mockRepo);

      expect(projectMembersByProject.get()['proj_1']).toEqual(mockMembers);
      expect(JSON.parse(mockStore.get('orca_project_members_proj_1') || '[]')).toEqual(mockMembers);
    });

    it('gets project members from storage fallback if not in atom', () => {
      const mockMembers: Teammate[] = [
        {
          id: 'u_1',
          sessionId: 'beta',
          name: 'John Doe',
          initials: 'JD',
          role: 'EDITOR',
        },
      ];
      mockStore.set('orca_project_members_proj_1', JSON.stringify(mockMembers));

      const members = getProjectMembers('proj_1');
      expect(members).toEqual(mockMembers);
      expect(projectMembersByProject.get()['proj_1']).toEqual(mockMembers);
    });

    it('creates a member invitation via the API', async () => {
      projectMembersByProject.set({ proj_1: [] });

      (mockRepo.createProjectInvitation as Mock).mockResolvedValue({
        id: 'invite_1',
      });

      await addProjectMember('proj_1', 'Jane Watson', 'jane@test.com', 'VIEWER', mockRepo);

      expect(mockRepo.createProjectInvitation).toHaveBeenCalledWith(
        'proj_1',
        'Jane Watson',
        'jane@test.com',
        'VIEWER',
        sessionId.get()
      );
      expect(projectMembersByProject.get()['proj_1']).toEqual([]);
      expect(toastMessages.get()).toHaveLength(1);
    });

    it('updates a member role through the API', async () => {
      const member: Teammate = {
        id: 'u_test',
        sessionId: 'beta',
        name: 'Jane Watson',
        initials: 'JW',
        role: 'VIEWER',
      };
      projectMembersByProject.set({ proj_1: [member] });

      (mockRepo.updateProjectMemberRole as Mock).mockResolvedValue({
        ...member,
        role: 'APPROVER',
      });

      await updateProjectMemberRole('proj_1', 'u_test', 'APPROVER', mockRepo);

      const updated = projectMembersByProject.get()['proj_1'][0];
      expect(updated.role).toBe('APPROVER');
      expect(mockRepo.updateProjectMemberRole).toHaveBeenCalledWith(
        'proj_1',
        'beta',
        'APPROVER',
        sessionId.get()
      );
      expect(toastMessages.get()).toHaveLength(1);
    });
  });

  describe('Invitations Store', () => {
    const mockRepo: ProjectRepository = {
      fetchProjects: vi.fn(),
      fetchProjectMembers: vi.fn(),
      fetchProjectInvitationLink: vi.fn(),
      createProjectInvitation: vi.fn(),
      updateProjectMemberRole: vi.fn(),
      createProject: vi.fn(),
      renameProject: vi.fn(),
      deleteProject: vi.fn(),
      acceptInvitation: vi.fn(),
    };

    it('loads project invitation links', async () => {
      (mockRepo.fetchProjectInvitationLink as Mock).mockResolvedValue('http://localhost:3000/invite/token123');

      const link = await loadProjectInvitationLink('proj_1', mockRepo);

      expect(link).toBe('http://localhost:3000/invite/token123');
      expect(projectInvitationLinks.get()['proj_1']).toBe('http://localhost:3000/invite/token123');
    });

    it('accepts member invitation', async () => {
      (mockRepo.acceptInvitation as Mock).mockResolvedValue('proj_1');
      (mockRepo.fetchProjects as Mock).mockResolvedValue([]);

      const projectId = await acceptMemberInvitation('token123', mockRepo);

      expect(projectId).toBe('proj_1');
      expect(mockRepo.fetchProjects).toHaveBeenCalled();
    });
  });
});
