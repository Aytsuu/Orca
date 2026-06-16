import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { navigate } from 'astro:transitions/client';
import { Plus, FolderKanban, Users, MoreVertical, Trash2, Search, X, WifiOff, HelpCircle, Settings, Mail, Copy, ChevronDown, Globe, Link } from 'lucide-react';
import {
  projects,
  projectMembersByProject,
  projectInvitationLinks,
  createProject,
  deleteProject,
  ensureProjectMembersLoaded,
  getProjectMembers,
  loadProjectInvitationLink,
  loadProjects,
  connectionError,
  addToast,
  addProjectMember,
  updateProjectMemberRole,
} from '../../../stores/projectStore';
import { Modal } from '../ui/Modal';

export const ProjectList: React.FC = () => {
  const projectList = useStore(projects);
  const membersByProject = useStore(projectMembersByProject);
  const invitationLinks = useStore(projectInvitationLinks);
  const connError = useStore(connectionError);
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);
  const [membersModalProject, setMembersModalProject] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLoadingInviteLink, setIsLoadingInviteLink] = useState(false);

  // Close dropdown on document click
  useEffect(() => {
    const handleClose = () => setActiveMenuProjectId(null);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, []);

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (!membersModalProject) return;
    void ensureProjectMembersLoaded(membersModalProject.id);
    if (invitationLinks[membersModalProject.id]) {
      return;
    }
    setIsLoadingInviteLink(true);
    void loadProjectInvitationLink(membersModalProject.id).finally(() => {
      setIsLoadingInviteLink(false);
    });
  }, [membersModalProject]);

  const handleCreateProject = async () => {
    const newId = await createProject('Untitled', '');
    if (newId) {
      window.location.href = `/project/${newId}/chat`;
    }
  };

  const filteredProjects = projectList.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-12 w-full fade-up flex flex-col gap-4 flex-grow">
      {/* Section Header */}
      <div className="flex justify-between items-center pb-5">
        <div>
          <h2 className="text-text-primary text-lg font-medium">Your workspaces</h2>
        </div>
        {!connError && (
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center bg-surface border border-border-subtle rounded-full transition-all duration-300 h-10 ${isSearchOpen ? 'w-64 px-4 border-border' : 'w-10 justify-center cursor-pointer hover:bg-surface-raised hover:border-border'
                }`}
              onClick={() => {
                if (!isSearchOpen) setIsSearchOpen(true);
              }}
            >
              <Search className={`w-4 h-4 text-text-muted shrink-0 ${isSearchOpen ? 'mr-2 text-primary' : ''}`} />

              {isSearchOpen ? (
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-0 outline-none text-sm text-text-primary placeholder-text-muted w-full p-0 focus:outline-none"
                  autoFocus
                  onBlur={() => {
                    if (searchQuery === '') {
                      setIsSearchOpen(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                      setSearchQuery('');
                      setIsSearchOpen(false);
                    }
                  }}
                />
              ) : null}

              {isSearchOpen && searchQuery ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery('');
                  }}
                  className="text-text-muted hover:text-text-primary shrink-0 ml-1 p-0.5 rounded-full hover:bg-background transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            <button
              onClick={handleCreateProject}
              className="btn-primary flex items-center gap-3 shrink-0 h-10"
            >
              <Plus className="w-4 h-4" />
              <span className='font-medium text-sm'>Create project</span>
            </button>
          </div>
        )}
      </div>

      <span className="section-label">Recent Projects</span>
      {/* Grid or Empty State */}
      {connError ? (
        <div className="flex-grow flex items-center justify-center py-16">
          <div className="border border-border bg-surface rounded-xl p-10 max-w-md w-full text-center flex flex-col items-center gap-5">
            <div className="h-12 w-12 rounded-full bg-error/10 flex items-center justify-center">
              <WifiOff className="w-6 h-6 text-error animate-pulse" />
            </div>
            <div>
              <h3 className="text-text-primary text-lg font-medium">Backend Connection Offline</h3>
              <p className="text-text-secondary text-sm mt-1 select-text font-mono text-xs max-w-xs break-words mx-auto">
                {connError}
              </p>
            </div>
            <button
              onClick={() => {
                void loadProjects(true);
              }}
              className="btn-primary flex items-center gap-1.5"
            >
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      ) : searchQuery && filteredProjects.length === 0 ? (
        <div className="flex-grow flex items-center justify-center py-16">
          <div className="border border-border bg-surface rounded-xl p-10 max-w-md w-full text-center flex flex-col items-center gap-5">
            <Search className="w-10 h-10 text-text-muted" />
            <div>
              <h3 className="text-text-primary text-lg font-medium">No projects found</h3>
              <p className="text-text-secondary text-sm mt-1">No workspaces match your query "{searchQuery}"</p>
            </div>
            <button
              onClick={() => setSearchQuery('')}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-4"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear search</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {/* New Project Ghost Card — always first */}
          <div
            onClick={handleCreateProject}
            className="group border border-dashed border-border hover:border-primary rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3 cursor-pointer transition-colors duration-200 select-none aspect-square"
          >
            <Plus className="w-8 h-8 text-text-muted group-hover:text-primary transition-colors" />
            <span className="text-sm font-semibold text-text-muted group-hover:text-primary transition-colors">
              Create new project
            </span>
          </div>

          {filteredProjects.map((project) => {
            return (
              <div
                key={project.id}
                onClick={() => {
                  navigate(`/project/${project.id}/chat`);
                }}
                className="group bg-surface border border-border-subtle hover:border-border hover:bg-surface-raised rounded-xl p-6 flex flex-col justify-between aspect-square transition-all duration-150 cursor-pointer relative"
              >
                <div>
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="text-text-primary text-lg font-medium group-hover:text-primary transition-colors pr-6 break-words">
                      {project.name}
                    </h3>

                    {/* Menu Button */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-5 right-5 z-20"
                    >
                      <button
                        onClick={() => setActiveMenuProjectId(activeMenuProjectId === project.id ? null : project.id)}
                        className="p-1 text-text-muted hover:text-text-primary hover:bg-background rounded-full transition-colors cursor-pointer"
                        title="Project options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeMenuProjectId === project.id && (
                        <div
                          className="absolute right-0 mt-1.5 w-36 bg-surface-raised border border-border rounded shadow-xl flex flex-col p-1 z-30 fade-up"
                          style={{ boxShadow: '0 8px 24px -6px rgba(0,0,0,0.6)' }}
                        >
                          <button
                            onClick={() => {
                              setMembersModalProject({ id: project.id, name: project.name });
                              setActiveMenuProjectId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 rounded-sm text-xs font-semibold text-text-secondary hover:bg-primary-muted hover:text-primary transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>View Members</span>
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
                                void deleteProject(project.id);
                              }
                              setActiveMenuProjectId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 rounded-sm text-xs font-semibold text-error hover:bg-error/10 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Project</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border-subtle pt-3 mt-1 flex justify-between items-center text-xs text-text-muted w-full">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>{project.membersCount}</span>
                  </span>
                  <span>{project.updatedText}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Members View Modal */}
      <Modal
        isOpen={!!membersModalProject}
        onClose={() => setMembersModalProject(null)}
        maxWidthClass="max-w-[560px]"
      >
        <div className="flex flex-col gap-6 text-text-secondary select-text">
          {/* Header */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-heading font-medium text-text-primary select-none">
              Share '{membersModalProject?.name}'
            </h2>
            <div className="flex items-center gap-3 text-text-muted select-none">
              <button
                type="button"
                onClick={() => addToast('info', 'Help is under construction.')}
                className="hover:text-text-primary transition-colors cursor-pointer"
                title="Help"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => addToast('info', 'Settings are under construction.')}
                className="hover:text-text-primary transition-colors cursor-pointer"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search Box / Add Member */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem('emailOrName') as HTMLInputElement);
              const val = input.value.trim();
              if (val && membersModalProject) {
                // If it is an email, extract name
                const atIdx = val.indexOf('@');
                const name = atIdx !== -1 ? val.substring(0, atIdx) : val;
                const email = atIdx !== -1 ? val : `${val.toLowerCase().replace(/\s+/g, '')}@company.com`;
                
                // Let's add them
                addProjectMember(membersModalProject.id, name, email, 'EDITOR');
                input.value = '';
              }
            }}
            className="w-full select-none"
          >
            <input
              type="text"
              name="emailOrName"
              placeholder="Add people, groups, spaces and calendar events"
              className="w-full bg-background border border-border focus:border-primary focus:outline-none rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-colors"
            />
          </form>

          {/* People with Access */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center select-none">
              <h3 className="text-sm font-medium text-text-primary font-heading uppercase tracking-wider">
                People with access
              </h3>
              <div className="flex items-center gap-3 text-text-muted">
                <button
                  type="button"
                  onClick={async () => {
                    if (membersModalProject && invitationLinks[membersModalProject.id]) {
                      await navigator.clipboard.writeText(invitationLinks[membersModalProject.id]);
                      addToast('success', 'Invitation link copied.');
                    } else {
                      addToast('warning', 'Link not available yet.');
                    }
                  }}
                  className="hover:text-text-primary transition-colors cursor-pointer"
                  title="Copy link"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => addToast('info', 'Email invitations are sent automatically.')}
                  className="hover:text-text-primary transition-colors cursor-pointer"
                  title="Mail access details"
                >
                  <Mail className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Members List inside a rounded container card */}
            <div className="flex flex-col border border-border-subtle bg-surface rounded-xl divide-y divide-border-subtle overflow-hidden px-4">
              {membersModalProject &&
                (membersByProject[membersModalProject.id] || getProjectMembers(membersModalProject.id)).map((member) => {
                  const email = member.email || `${member.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@company.com`;
                  const isYou = member.name.toLowerCase().includes('you');
                  
                  return (
                    <div key={member.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary-glow to-primary-muted border border-border flex items-center justify-center text-xs font-bold text-primary shrink-0 select-none">
                          {member.initials}
                        </div>
                        <div className="truncate pr-4">
                          <p className="text-sm font-semibold text-text-primary truncate">
                            {member.name} {isYou && <span className="text-text-muted font-normal">(you)</span>}
                          </p>
                          <p className="text-xs text-text-muted truncate select-all">{email}</p>
                        </div>
                      </div>

                      {/* Dropdown / Role Selector */}
                      {member.isCreator ? (
                        <span className="text-xs text-text-muted select-none font-medium pr-2">Owner</span>
                      ) : (
                        <div className="relative select-none">
                          <select
                            value={member.role}
                            onChange={(e) => {
                              // Let's update the member's role
                              updateProjectMemberRole(membersModalProject.id, member.id, e.target.value as any);
                            }}
                            className="bg-transparent text-xs font-medium text-text-secondary hover:text-text-primary border-none outline-none focus:outline-none pr-6 pl-2 py-1 cursor-pointer appearance-none text-right"
                          >
                            <option value="APPROVER" className="bg-surface">Approver</option>
                            <option value="EDITOR" className="bg-surface">Editor</option>
                            <option value="VIEWER" className="bg-surface">Viewer</option>
                          </select>
                          <ChevronDown className="w-3 h-3 text-text-muted pointer-events-none absolute right-1 top-1/2 -translate-y-1/2" />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* General Access Section */}
          <div className="flex flex-col gap-3 mt-1">
            <h3 className="text-sm font-medium text-text-primary font-heading uppercase tracking-wider select-none">
              General access
            </h3>
            
            {/* General Access row in a rounded container card */}
            <div className="flex items-start justify-between p-4 bg-surface border border-border-subtle rounded-xl">
              <div className="flex gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-success/10 border border-success/20 flex items-center justify-center text-success shrink-0 select-none">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 select-none">
                    <span className="text-sm font-semibold text-text-primary">Anyone with the link</span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    Anyone on the Internet with the link can edit
                  </p>
                </div>
              </div>

              {/* Role Dropdown */}
              <div className="relative select-none">
                <select
                  defaultValue="EDITOR"
                  className="bg-transparent text-xs font-medium text-text-secondary hover:text-text-primary border-none outline-none focus:outline-none pr-6 pl-2 py-1 cursor-pointer appearance-none text-right"
                  disabled
                >
                  <option value="EDITOR" className="bg-surface">Editor</option>
                </select>
                <ChevronDown className="w-3 h-3 text-text-muted pointer-events-none absolute right-1 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-border-subtle mt-2 select-none">
            <button
              type="button"
              onClick={async () => {
                if (membersModalProject && invitationLinks[membersModalProject.id]) {
                  await navigator.clipboard.writeText(invitationLinks[membersModalProject.id]);
                  addToast('success', 'Link copied to clipboard!');
                } else {
                  addToast('warning', 'Link not available yet.');
                }
              }}
              className="btn-secondary py-2 px-5 text-sm font-semibold rounded-full flex items-center gap-2"
            >
              <Link className="w-4 h-4" />
              <span>Copy link</span>
            </button>
            <button
              onClick={() => setMembersModalProject(null)}
              className="py-2.5 px-6 text-sm font-semibold rounded-full bg-primary hover:bg-primary-hover text-text-inverse transition-all hover:scale-[1.02] shadow-lg shadow-primary-glow/20"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default ProjectList;
