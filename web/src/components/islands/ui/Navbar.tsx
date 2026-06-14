// src/components/islands/ui/Navbar.tsx
import React, { useState, useEffect } from 'react';
import { navigate } from 'astro:transitions/client';
import { Plus } from 'lucide-react';
import { useStore } from '@nanostores/react';
import orcaLogo from '../../../assets/orca_logo.png';
import { projects, activeProjectState } from '../../../stores/projectStore';

export const Navbar: React.FC = () => {
  const [isHome, setIsHome] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const projectList = useStore(projects);
  const projectDetail = useStore(activeProjectState);

  useEffect(() => {
    const updatePath = () => {
      setIsHome(window.location.pathname === '/');
      const match = window.location.pathname.match(/^\/project\/([^/]+)/);
      setCurrentProjectId(match ? match[1] : null);
    };

    updatePath();

    // Track client-side page transitions in Astro
    document.addEventListener('astro:after-swap', updatePath);
    return () => {
      document.removeEventListener('astro:after-swap', updatePath);
    };
  }, []);

  const activeProject = projectList.find(p => p.id === currentProjectId);
  const projectName = activeProject?.name || (projectDetail?.projectId === currentProjectId ? projectDetail.currentPlan.title.replace('Project Plan — ', '') : null);

  const logoSrc = typeof orcaLogo === 'string' ? orcaLogo : orcaLogo.src;

  return (
    <header className="sticky top-0 z-50 h-[56px] border-b border-border-subtle bg-background/80 backdrop-blur-md flex items-center px-8 justify-between select-none">
      <div className="flex items-center gap-2">
        <a href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
          <img src={logoSrc} alt="Orca Logo" className="h-6 w-6 object-contain" />
          <span className="text-md font-bold text-text-primary tracking-tight">
            {currentProjectId && projectName ? projectName : 'Orca'}
          </span>
        </a>
      </div>

      <div className="flex items-center gap-6">
        {!isHome && (
          <button
            onClick={() => {
              // Trigger New Project Modal programmatically
              navigate('/?new=true');
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
