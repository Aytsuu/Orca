// src/components/islands/ui/Navbar.tsx
import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '@nanostores/react';
import orcaLogo from '../../../assets/orca_logo.png';
import { projects, createProject, loadProjects, renameProject } from '../../../stores/projectStore';

interface NavbarProps {
  isHome?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ isHome: initialIsHome = false }) => {
  const [isHome, setIsHome] = useState(initialIsHome);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState('');

  const projectList = useStore(projects);

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    const updatePath = () => {
      setIsHome(window.location.pathname === '/');
      const match = window.location.pathname.match(/^\/project\/([^/]+)/);
      setCurrentProjectId(match ? match[1] : null);
      setIsEditing(false);
    };

    updatePath();

    // Track client-side page transitions in Astro
    document.addEventListener('astro:after-swap', updatePath);
    return () => {
      document.removeEventListener('astro:after-swap', updatePath);
    };
  }, []);

  const activeProject = projectList.find(p => p.id === currentProjectId);
  const projectName = activeProject?.name || null;

  useEffect(() => {
    if (projectName) {
      setTempName(projectName);
    }
  }, [projectName]);

  const logoSrc = typeof orcaLogo === 'string' ? orcaLogo : orcaLogo.src;

  return (
    <header className="sticky top-0 z-50 h-[64px] py-3 bg-background/80 backdrop-blur-md flex items-center px-8 justify-between select-none">
      <div className="flex items-center gap-4">
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
          <img src={logoSrc} alt="Orca Logo" className="h-6 w-6 object-contain" />
        </a>
        <div className="flex items-center">
          {currentProjectId && projectName ? (
            isEditing ? (
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={() => {
                  setIsEditing(false);
                  if (tempName.trim() && tempName.trim() !== projectName) {
                    void renameProject(currentProjectId, tempName.trim());
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditing(false);
                    if (tempName.trim() && tempName.trim() !== projectName) {
                      void renameProject(currentProjectId, tempName.trim());
                    }
                  } else if (e.key === 'Escape') {
                    setIsEditing(false);
                    setTempName(projectName);
                  }
                }}
                autoFocus
                className="bg-surface-raised border border-border rounded px-2 py-0.5 text-md font-medium text-text-primary focus:outline-none focus:border-primary select-text"
              />
            ) : (
              <span
                onClick={() => setIsEditing(true)}
                className="text-md font-medium text-text-primary tracking-tight hover:bg-surface-raised px-2 py-0.5 rounded cursor-pointer select-none"
                title="Click to rename project"
              >
                {projectName}
              </span>
            )
          ) : (
            <a href="/" className="text-md font-medium text-text-primary tracking-tight hover:opacity-80">
              Orca
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        {!isHome && (
          <button
            onClick={async () => {
              const newId = await createProject('Untitled', '');
              if (newId) {
                window.location.href = `/project/${newId}/chat`;
              }
            }}
            className="btn-primary flex items-center gap-1.5 px-4 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="font-medium text-[14px]">Create project</span>
          </button>
        )}

        <div className="h-10 w-10 rounded-full bg-surface border border-border flex items-center justify-center text-xs font-semibold text-text-muted hover:border-text-muted transition-colors cursor-pointer">
          YO
        </div>
      </div>
    </header>
  );
};
