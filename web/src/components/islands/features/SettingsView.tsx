// src/components/islands/features/SettingsView.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  Server,
  Check,
  X,
  Plus,
  ChevronDown,
  Trash2,
  ArrowRight
} from 'lucide-react';
import {
  projectMembersByProject,
  ensureProjectMembersLoaded,
  getProjectMembers,
  updateProjectMemberRole,
  addToast
} from '../../../stores/projectStore';
import { Modal } from '../ui/Modal';

interface SettingsViewProps {
  projectId: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ projectId }) => {
  const teammates = useStore(projectMembersByProject)[projectId] || getProjectMembers(projectId);

  // Local state for permissions
  const [localPerms, setLocalPerms] = useState<{
    analyzeConversations: boolean;
    generatePlans: boolean;
    flagRisks: boolean;
    generateSummaries: boolean;
    accessExternalTools: boolean;
    generateCodeSnippets: boolean;
  }>({
    analyzeConversations: true,
    generatePlans: true,
    flagRisks: true,
    generateSummaries: true,
    accessExternalTools: true,
    generateCodeSnippets: false,
  });

  const [initialPerms, setInitialPerms] = useState(localPerms);
  const [isChanged, setIsChanged] = useState(false);

  // Local state for MCP servers
  const [mcpServers, setMcpServers] = useState<Array<{ name: string; url: string; status: 'Connected' | 'Failed' }>>([
    { name: 'Notion', url: 'https://mcp.notion.so', status: 'Connected' },
    { name: 'GitHub', url: 'https://mcp.github.com', status: 'Connected' },
  ]);

  // Add MCP server modal state
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [mcpName, setMcpName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');

  // Dropdown states for each user role change
  const [openDropdownUserId, setOpenDropdownUserId] = useState<string | null>(null);

  useEffect(() => {
    void ensureProjectMembersLoaded(projectId);
  }, [projectId]);

  const handleToggle = (key: keyof typeof localPerms) => {
    if (key === 'accessExternalTools' && mcpServers.length === 0) {
      addToast('warning', 'Connect an MCP server first before enabling tool access.');
      return;
    }

    const nextPerms = {
      ...localPerms,
      [key]: !localPerms[key]
    };
    setLocalPerms(nextPerms);
    setIsChanged(JSON.stringify(nextPerms) !== JSON.stringify(initialPerms));
  };

  const handleSave = () => {
    if (!isChanged) return;
    setInitialPerms(localPerms);
    setIsChanged(false);
    addToast('success', 'Settings saved');
  };

  const handleAddMcp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpUrl.trim()) return;

    setMcpServers([...mcpServers, { name: mcpName.trim(), url: mcpUrl.trim(), status: 'Connected' }]);
    addToast('success', `Connected tool server: ${mcpName.trim()}`);
    setIsMcpOpen(false);
    setMcpName('');
    setMcpUrl('');
  };

  const handleRemoveMcp = (name: string) => {
    setMcpServers(mcpServers.filter((server) => server.name !== name));
    addToast('warning', `Disconnected tool server: ${name}`);
  };

  return (
    <div className="h-[calc(100vh-112px)] overflow-y-auto w-full fade-up">
      <div className="max-w-[720px] mx-auto px-8 py-12 flex flex-col gap-8">

        {/* Page Header */}
        <div>
          <h2 className="text-text-primary text-xl font-bold mt-1">
            Configure what the AI can do in this project
          </h2>
        </div>

        {/* ── AI PERMISSIONS ── */}
        <div className="flex flex-col gap-4">
          <div className="divider-labeled uppercase">AI PERMISSIONS</div>

          <div className="flex flex-col border border-border-subtle bg-surface rounded-xl divide-y divide-border-subtle overflow-hidden">

            {/* Analyze conversations */}
            <div className="flex justify-between items-center p-5">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Analyze conversations and the project plan</h4>
                <p className="text-xs text-text-muted mt-1">The AI reads all messages to extract tasks.</p>
              </div>
              <button
                onClick={() => handleToggle('analyzeConversations')}
                className={`relative w-10 h-[22px] rounded-pill p-0.5 transition-colors duration-200 focus:outline-none ${localPerms.analyzeConversations ? 'bg-primary' : 'bg-border'
                  }`}
              >
                <div
                  className={`w-[18px] h-[18px] rounded-full transition-transform duration-200 ${localPerms.analyzeConversations
                    ? 'translate-x-[18px] bg-text-inverse'
                    : 'translate-x-0 bg-text-muted'
                    }`}
                />
              </button>
            </div>

            {/* Generate plans */}
            <div className="flex justify-between items-center p-5">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Generate plans and tasks</h4>
                <p className="text-xs text-text-muted mt-1">The AI proposes action items and milestones automatically.</p>
              </div>
              <button
                onClick={() => handleToggle('generatePlans')}
                className={`relative w-10 h-[22px] rounded-pill p-0.5 transition-colors duration-200 focus:outline-none ${localPerms.generatePlans ? 'bg-primary' : 'bg-border'
                  }`}
              >
                <div
                  className={`w-[18px] h-[18px] rounded-full transition-transform duration-200 ${localPerms.generatePlans
                    ? 'translate-x-[18px] bg-text-inverse'
                    : 'translate-x-0 bg-text-muted'
                    }`}
                />
              </button>
            </div>

            {/* Flag risks */}
            <div className="flex justify-between items-center p-5">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Flag risks and gaps</h4>
                <p className="text-xs text-text-muted mt-1">The AI warns you of missing owners or due dates.</p>
              </div>
              <button
                onClick={() => handleToggle('flagRisks')}
                className={`relative w-10 h-[22px] rounded-pill p-0.5 transition-colors duration-200 focus:outline-none ${localPerms.flagRisks ? 'bg-primary' : 'bg-border'
                  }`}
              >
                <div
                  className={`w-[18px] h-[18px] rounded-full transition-transform duration-200 ${localPerms.flagRisks
                    ? 'translate-x-[18px] bg-text-inverse'
                    : 'translate-x-0 bg-text-muted'
                    }`}
                />
              </button>
            </div>

            {/* Generate summaries */}
            <div className="flex justify-between items-center p-5">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Generate summaries</h4>
                <p className="text-xs text-text-muted mt-1">The AI creates a brief of updates every day.</p>
              </div>
              <button
                onClick={() => handleToggle('generateSummaries')}
                className={`relative w-10 h-[22px] rounded-pill p-0.5 transition-colors duration-200 focus:outline-none ${localPerms.generateSummaries ? 'bg-primary' : 'bg-border'
                  }`}
              >
                <div
                  className={`w-[18px] h-[18px] rounded-full transition-transform duration-200 ${localPerms.generateSummaries
                    ? 'translate-x-[18px] bg-text-inverse'
                    : 'translate-x-0 bg-text-muted'
                    }`}
                />
              </button>
            </div>

            {/* Access external tools (MCP) */}
            <div
              className={`flex justify-between items-center p-5 ${mcpServers.length === 0 ? 'opacity-38 cursor-not-allowed' : ''
                }`}
            >
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Access external tools (MCP)</h4>
                <p className="text-xs text-text-muted mt-1">The AI can write to Notion and pull GitHub pull requests.</p>
              </div>
              <button
                disabled={mcpServers.length === 0}
                onClick={() => handleToggle('accessExternalTools')}
                className={`relative w-10 h-[22px] rounded-pill p-0.5 transition-colors duration-200 focus:outline-none ${localPerms.accessExternalTools && mcpServers.length > 0 ? 'bg-primary' : 'bg-border'
                  }`}
              >
                <div
                  className={`w-[18px] h-[18px] rounded-full transition-transform duration-200 ${localPerms.accessExternalTools && mcpServers.length > 0
                    ? 'translate-x-[18px] bg-text-inverse'
                    : 'translate-x-0 bg-text-muted'
                    }`}
                />
              </button>
            </div>

            {/* Generate code snippets (Stretch) */}
            <div className="flex justify-between items-center p-5">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-text-primary">Generate code snippets</h4>
                  <span className="category-badge text-[9px] py-0.5 px-1.5 font-bold badge--viewer">★ STRETCH</span>
                </div>
                <p className="text-xs text-text-muted">The AI writes code inside chat windows.</p>
              </div>
              <button
                onClick={() => handleToggle('generateCodeSnippets')}
                className={`relative w-10 h-[22px] rounded-pill p-0.5 transition-colors duration-200 focus:outline-none ${localPerms.generateCodeSnippets ? 'bg-primary' : 'bg-border'
                  }`}
              >
                <div
                  className={`w-[18px] h-[18px] rounded-full transition-transform duration-200 ${localPerms.generateCodeSnippets
                    ? 'translate-x-[18px] bg-text-inverse'
                    : 'translate-x-0 bg-text-muted'
                    }`}
                />
              </button>
            </div>

          </div>
        </div>

        {/* ── MCP TOOL SERVERS ── */}
        <div className="flex flex-col gap-4">
          <div className="divider-labeled uppercase">MCP TOOL SERVERS</div>

          <div className="flex flex-col gap-3">
            {mcpServers.map((server) => {
              const isSuccess = server.status === 'Connected';

              return (
                <div
                  key={server.name}
                  className="bg-surface border border-border-subtle rounded-xl p-5 flex justify-between items-center"
                >
                  <div className="flex items-start gap-4">
                    <Server className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-text-primary">{server.name}</h4>
                        <span className={`text-[10px] font-semibold flex items-center gap-1 ${isSuccess ? 'text-success' : 'text-error'
                          }`}>
                          <span>{server.status}</span>
                          {isSuccess ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-text-muted mt-1">{server.url}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveMcp(server.name)}
                    className="btn-ghost text-xs text-error hover:bg-error/10 hover:border-error/30 py-1 px-2.5 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              );
            })}

            {/* Add MCP server trigger */}
            <button
              onClick={() => setIsMcpOpen(true)}
              className="btn-ghost border border-dashed border-border py-2 flex items-center justify-center gap-1.5 hover:border-primary hover:text-primary rounded-xl text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add MCP Server</span>
            </button>
          </div>
        </div>

        {/* ── TEAM PERMISSIONS ── */}
        <div className="flex flex-col gap-4">
          <div className="divider-labeled uppercase">TEAM PERMISSIONS</div>

          <div className="flex flex-col border border-border-subtle bg-surface rounded-xl divide-y divide-border-subtle overflow-hidden">
            {teammates.map((member) => {
              const isSelfOrCreator = member.isCreator || member.id === 'creator_id';
              const isApprover = member.role === 'APPROVER';
              const isEditor = member.role === 'EDITOR';

              let roleClass = 'badge--viewer';
              if (isApprover) roleClass = 'badge--approver';
              else if (isEditor) roleClass = 'badge--editor';

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 relative"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-surface border border-border flex items-center justify-center text-xs font-semibold text-text-muted shrink-0">
                      {member.initials}
                    </div>
                    <span className="text-sm font-bold text-text-primary">{member.name}</span>
                  </div>

                  {isSelfOrCreator ? (
                    /* Creator cannot change their own permission */
                    <span className={`category-badge ${roleClass}`}>
                      {member.role}
                    </span>
                  ) : (
                    /* Role drop-down editor */
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdownUserId(openDropdownUserId === member.id ? null : member.id)}
                        className={`category-badge cursor-pointer hover:opacity-85 ${roleClass} flex items-center gap-1`}
                      >
                        <span>{member.role}</span>
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>

                      {openDropdownUserId === member.id && (
                        <div
                          className="absolute right-0 mt-1.5 w-32 bg-surface-raised border border-border rounded-sm shadow-xl flex flex-col p-1 z-30 fade-up"
                          style={{ boxShadow: '0 8px 24px -6px rgba(0,0,0,0.6)' }}
                        >
                          {['VIEWER', 'EDITOR', 'APPROVER'].map((r) => (
                            <button
                              key={r}
                              onClick={() => {
                                void updateProjectMemberRole(projectId, member.id, r as any);
                                setOpenDropdownUserId(null);
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-primary-muted transition-colors ${member.role === r ? 'text-primary' : 'text-text-secondary'
                                }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Save Button Row */}
        <div className="flex justify-end pt-5 border-t border-border-subtle">
          <button
            onClick={handleSave}
            disabled={!isChanged}
            className="btn-primary flex items-center gap-1.5 py-1.5 px-4 text-xs font-semibold"
          >
            <span>Save Changes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Add MCP server modal */}
        <Modal
          isOpen={isMcpOpen}
          onClose={() => setIsMcpOpen(false)}
          title="ADD MCP SERVER"
        >
          <form onSubmit={handleAddMcp} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Server Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Notion Server"
                value={mcpName}
                onChange={(e) => setMcpName(e.target.value)}
                className="bg-background border border-border rounded-sm px-4 py-2.5 text-text-primary text-md focus:outline-none focus:border-primary placeholder-text-muted"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Server URL
              </label>
              <input
                type="url"
                required
                placeholder="https://mcp.notion.so"
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                className="bg-background border border-border rounded-sm px-4 py-2.5 text-text-primary text-md focus:outline-none focus:border-primary placeholder-text-muted"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-border-subtle pt-4 mt-2">
              <button
                type="button"
                onClick={() => setIsMcpOpen(false)}
                className="btn-secondary py-1.5 px-5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary py-1.5 px-5 text-xs font-semibold flex items-center gap-1.5"
              >
                <span>Connect Server</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </Modal>

      </div>
    </div>
  );
};
export default SettingsView;
