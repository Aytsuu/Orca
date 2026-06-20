import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { navigate } from 'astro:transitions/client';
import { Plus, MoreVertical, Trash2, Search, X, WifiOff, UsersRound } from 'lucide-react';
import {
  projects,
  createProject,
  deleteProject,
  loadProjects,
  connectionError,
} from '../../../stores/projectStore';
import { ShareProjectModal } from './ShareProjectModal';

export const ProjectList: React.FC = () => {
  const projectList = useStore(projects);
  const connError = useStore(connectionError);
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);
  const [membersModalProject, setMembersModalProject] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Close dropdown on document click
  useEffect(() => {
    const handleClose = () => setActiveMenuProjectId(null);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, []);

  useEffect(() => {
    void loadProjects();
  }, []);

  // Members modal loading is now internalized in ShareProjectModal

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
              className="btn-primary flex items-center gap-2 shrink-0 h-10"
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
                          className="absolute right-0 mt-1.5 w-44 bg-surface-raised border border-border rounded-lg shadow-xl flex flex-col p-1.5 z-30 fade-up"
                          style={{ boxShadow: '0 8px 24px -6px rgba(0,0,0,0.6)' }}
                        >
                          <button
                            onClick={() => {
                              setMembersModalProject({ id: project.id, name: project.name });
                              setActiveMenuProjectId(null);
                            }}
                            className="w-full text-left px-3.5 py-2 rounded-md text-sm font-semibold text-text-secondary hover:bg-primary-muted hover:text-primary transition-colors flex items-center gap-2.5 cursor-pointer"
                          >
                            <UsersRound className="w-4 h-4" />
                            <span>View Members</span>
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
                                void deleteProject(project.id);
                              }
                              setActiveMenuProjectId(null);
                            }}
                            className="w-full text-left px-3.5 py-2 rounded-md text-sm font-semibold text-error hover:bg-error/10 transition-colors flex items-center gap-2.5 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete Project</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border-subtle pt-3 mt-1 flex justify-between items-center text-xs text-text-muted w-full">
                  <span className="flex items-center gap-1.5">
                    <UsersRound className="w-3.5 h-3.5" />
                    <span>{project.membersCount}</span>
                  </span>
                  <span>{project.updatedText}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share / Members Modal */}
      <ShareProjectModal
        isOpen={!!membersModalProject}
        onClose={() => setMembersModalProject(null)}
        projectId={membersModalProject?.id || ''}
        projectName={membersModalProject?.name || ''}
      />
    </div>
  );
};
export default ProjectList;
