// src/components/islands/features/ShareProjectModal.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  HelpCircle,
  Settings,
  Copy,
  Mail,
  Globe,
  Link,
  ChevronDown,
} from 'lucide-react';
import {
  projectInvitationLinks,
  projectMembersByProject,
  ensureProjectMembersLoaded,
  getProjectMembers,
  loadProjectInvitationLink,
  addToast,
  addProjectMember,
  updateProjectMemberRole,
} from '../../../stores/projectStore';
import { Modal } from '../ui/Modal';

interface ShareProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

export const ShareProjectModal: React.FC<ShareProjectModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
}) => {
  const membersByProject = useStore(projectMembersByProject);
  const invitationLinks = useStore(projectInvitationLinks);
  const [isLoadingInviteLink, setIsLoadingInviteLink] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    void ensureProjectMembersLoaded(projectId);
    if (invitationLinks[projectId]) return;

    setIsLoadingInviteLink(true);
    void loadProjectInvitationLink(projectId).finally(() => {
      setIsLoadingInviteLink(false);
    });
  }, [isOpen, projectId, invitationLinks]);

  const teammates = membersByProject[projectId] || getProjectMembers(projectId);

  const handleCopyLink = async () => {
    const link = invitationLinks[projectId];
    if (link) {
      await navigator.clipboard.writeText(link);
      addToast('success', 'Invitation link copied.');
    } else {
      addToast('warning', 'Link not available yet.');
    }
  };

  const handleCopyLinkFooter = async () => {
    const link = invitationLinks[projectId];
    if (link) {
      await navigator.clipboard.writeText(link);
      addToast('success', 'Link copied to clipboard!');
    } else {
      addToast('warning', 'Link not available yet.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-[560px]"
    >
      <div className="flex flex-col gap-6 text-text-secondary select-text">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-heading font-medium text-text-primary select-none">
            Share '{projectName}'
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
            if (val) {
              const atIdx = val.indexOf('@');
              const name = atIdx !== -1 ? val.substring(0, atIdx) : val;
              const email = atIdx !== -1 ? val : `${val.toLowerCase().replace(/\s+/g, '')}@company.com`;

              void addProjectMember(projectId, name, email, 'VIEWER');
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
                onClick={handleCopyLink}
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
            {teammates.map((member) => {
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
                          void updateProjectMemberRole(
                            projectId,
                            member.id,
                            e.target.value as any
                          );
                        }}
                        className="bg-transparent text-xs font-medium text-text-secondary hover:text-text-primary border-none outline-none focus:outline-none pr-6 pl-2 py-1 cursor-pointer appearance-none text-right"
                      >
                        <option value="APPROVER" className="bg-surface">Approver</option>
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
                  Anyone on the Internet with the link can view
                </p>
              </div>
            </div>

            {/* Role Dropdown */}
            <div className="relative select-none">
              <select
                defaultValue="VIEWER"
                className="bg-transparent text-xs font-medium text-text-secondary hover:text-text-primary border-none outline-none focus:outline-none pr-6 pl-2 py-1 cursor-pointer appearance-none text-right"
                disabled
              >
                <option value="VIEWER" className="bg-surface">Viewer</option>
              </select>
              <ChevronDown className="w-3 h-3 text-text-muted pointer-events-none absolute right-1 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-border-subtle mt-2 select-none">
          <button
            type="button"
            onClick={handleCopyLinkFooter}
            className="btn-secondary py-2 px-5 text-sm font-semibold rounded-full flex items-center gap-2"
          >
            <Link className="w-4 h-4" />
            <span>Copy link</span>
          </button>
          <button
            onClick={onClose}
            className="py-2.5 px-6 text-sm font-semibold rounded-full bg-primary hover:bg-primary-hover text-text-inverse transition-all hover:scale-[1.02] shadow-lg shadow-primary-glow/20"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ShareProjectModal;
