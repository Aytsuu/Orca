// src/components/islands/ui/TabBar.tsx
import React from 'react';

interface TabBarProps {
  currentTab: 'chat' | 'plan' | 'settings';
  projectId: string;
}

export const TabBar: React.FC<TabBarProps> = ({ currentTab, projectId }) => {
  return (
    <div className="h-[48px] border-b border-border-subtle bg-background flex items-center px-6 select-none">
      {/* Tabs */}
      <div className="flex gap-6 h-full items-center">
        <a
          href={`/project/${projectId}/chat`}
          className={`h-full flex items-center text-sm font-semibold transition-colors border-b-2 ${currentTab === 'chat'
            ? 'border-primary text-text-primary'
            : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
        >
          Chat
        </a>
        <a
          href={`/project/${projectId}/plan`}
          className={`h-full flex items-center text-sm font-semibold transition-colors border-b-2 ${currentTab === 'plan'
            ? 'border-primary text-text-primary'
            : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
        >
          Plan
        </a>
        <a
          href={`/project/${projectId}/settings`}
          className={`h-full flex items-center text-sm font-semibold transition-colors border-b-2 ${currentTab === 'settings'
            ? 'border-primary text-text-primary'
            : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
        >
          Settings
        </a>
      </div>
    </div>
  );
};
