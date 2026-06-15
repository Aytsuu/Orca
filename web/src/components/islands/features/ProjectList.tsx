import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { navigate } from 'astro:transitions/client';
import { Plus, FolderKanban, Users, MoreVertical, Trash2 } from 'lucide-react';
import { projects, createProject, deleteProject, getProjectMembers, type Teammate } from '../../../stores/projectStore';
import { Modal } from '../ui/Modal';

export const ProjectList: React.FC = () => {
  const projectList = useStore(projects);
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);
  const [membersModalProject, setMembersModalProject] = useState<{ id: string; name: string } | null>(null);

  // Close dropdown on document click
  useEffect(() => {
    const handleClose = () => setActiveMenuProjectId(null);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, []);

  const handleCreateProject = () => {
    const newId = createProject('Untitled', '', true);
    window.location.href = `/project/${newId}/chat`;
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-12 w-full fade-up flex flex-col gap-8 flex-grow">
      {/* Section Header */}
      <div className="flex justify-between items-end border-b border-border-subtle pb-5">
        <div>
          <span className="section-label">Recents</span>
          <h2 className="text-text-primary text-lg mt-1 font-medium">Your workspaces</h2>
        </div>
        {projectList.length > 0 && (
          <button
            onClick={handleCreateProject}
            className="btn-primary flex items-center gap-3"
          >
            <Plus className="w-4 h-4" />
            <span className='font-medium text-sm'>Create project</span>
          </button>
        )}
      </div>

      {/* Grid or Empty State */}
      {projectList.length === 0 ? (
        <div className="flex-grow flex items-center justify-center py-16">
          <div className="border border-dashed border-border rounded-xl p-10 max-w-md w-full text-center flex flex-col items-center gap-5">
            <FolderKanban className="w-10 h-10 text-text-muted" />
            <div>
              <h3 className="text-text-primary text-lg font-medium">No projects yet</h3>
              <p className="text-text-secondary text-sm mt-1">Start by creating one</p>
            </div>
            <button
              onClick={handleCreateProject}
              className="btn-primary flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create your first project</span>
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

          {projectList.map((project, index) => {
            return (
              <div
                key={project.id}
                onClick={() => {
                  navigate(`/project/${project.id}/chat`);
                }}
                className="group bg-surface border border-border-subtle hover:border-border hover:bg-surface-raised rounded-xl p-6 flex flex-col justify-between aspect-square transition-all duration-150 cursor-pointer relative"
                style={{
                  transform: 'translateY(0)',
                  transitionTimingFunction: 'var(--ease-spring)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
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
                                deleteProject(project.id);
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
        title={`MEMBERS — ${membersModalProject?.name.toUpperCase()}`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col border border-border-subtle bg-surface rounded-xl divide-y divide-border-subtle overflow-hidden">
            {membersModalProject && getProjectMembers(membersModalProject.id).map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-semibold text-text-muted shrink-0">
                    {member.initials}
                  </div>
                  <span className="text-sm font-bold text-text-primary">{member.name}</span>
                </div>
                <span className="category-badge text-[10px] py-0.5 px-2 font-semibold badge--viewer">
                  {member.role}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setMembersModalProject(null)}
              className="btn-secondary py-1.5 px-5 text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default ProjectList;
