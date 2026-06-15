// src/components/islands/features/ProjectList.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { navigate } from 'astro:transitions/client';
import { Plus, FolderKanban, ArrowRight } from 'lucide-react';
import { projects, createProject } from '../../../stores/projectStore';
import { Modal } from '../ui/Modal';

export const ProjectList: React.FC = () => {
  const projectList = useStore(projects);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');

  // Handle URL query parameters to open modal from Navbar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === 'true') {
        setIsModalOpen(true);
        // Clear param to avoid re-opening
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    const newId = createProject(projectName.trim(), projectDesc.trim());
    setIsModalOpen(false);
    setProjectName('');
    setProjectDesc('');

    // Redirect to the chat page of the new project
    setTimeout(() => {
      navigate(`/project/${newId}/chat`);
    }, 300);
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12 w-full fade-up flex flex-col gap-8 flex-grow">
      {/* Section Header */}
      <div className="flex justify-between items-end border-b border-border-subtle pb-5">
        <div>
          <span className="section-label">PROJECTS</span>
          <h2 className="text-text-primary text-lg mt-1 font-bold">Your workspaces</h2>
        </div>
        {projectList.length > 0 && (
          <button
            onClick={() => setIsModalOpen(true)}
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
          <div className="border border-dashed border-border rounded-sm p-10 max-w-md w-full text-center flex flex-col items-center gap-5">
            <FolderKanban className="w-10 h-10 text-text-muted" />
            <div>
              <h3 className="text-text-primary text-lg font-bold">No projects yet</h3>
              <p className="text-text-secondary text-sm mt-1">Start by creating one</p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn-primary flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create your first project</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* New Project Ghost Card — always first */}
          <div
            onClick={() => setIsModalOpen(true)}
            className="group border border-dashed border-border hover:border-primary rounded-sm p-6 flex flex-col items-center justify-center text-center gap-3 cursor-pointer transition-colors duration-200 select-none min-h-[170px]"
          >
            <Plus className="w-8 h-8 text-text-muted group-hover:text-primary transition-colors" />
            <span className="text-sm font-semibold text-text-muted group-hover:text-primary transition-colors">
              Create new project
            </span>
          </div>

          {projectList.map((project, index) => {
            const indexStr = String(index + 1).padStart(2, '0');
            const isActive = project.status === 'active';

            return (
              <a
                key={project.id}
                href={`/project/${project.id}/chat`}
                className="group bg-surface border border-border-subtle hover:border-border hover:bg-surface-raised rounded-sm p-6 flex flex-col gap-4 transition-all duration-150 cursor-pointer select-none"
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
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-text-muted">{indexStr}</span>
                  <span className={`category-badge text-[10px] py-0.5 px-2 font-bold ${isActive ? 'badge--approver' : 'badge--viewer'
                    }`}>
                    {isActive ? 'ACTIVE' : 'DRAFT'}
                  </span>
                </div>

                <div>
                  <h3 className="text-text-primary text-base font-bold group-hover:text-primary transition-colors">
                    {project.name}
                  </h3>
                  <p className="text-text-secondary text-sm mt-1 line-clamp-1 overflow-hidden text-ellipsis">
                    {project.description}
                  </p>
                </div>

                <div className="border-t border-border-subtle pt-3 mt-1 flex justify-between items-center text-xs text-text-muted">
                  <span>◎ {project.membersCount} members</span>
                  <span>🕐 {project.updatedText}</span>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* Creation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="NEW PROJECT"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Project Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Q3 Product Launch"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="bg-background border border-border rounded-sm px-4 py-2.5 text-text-primary text-md focus:outline-none focus:border-primary placeholder-text-muted"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Description (optional)
            </label>
            <textarea
              placeholder="Describe project details..."
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              rows={3}
              className="bg-background border border-border rounded-sm px-4 py-2.5 text-text-primary text-md focus:outline-none focus:border-primary placeholder-text-muted resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-border-subtle pt-4 mt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn-secondary py-1.5 px-5 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary py-1.5 px-5 text-xs font-semibold flex items-center gap-1.5"
            >
              <span>Create Project</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
export default ProjectList;
