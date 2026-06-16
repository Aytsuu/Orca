import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  Plus,
  FileText,
  Search,
  Users2,
  Check,
  Edit2,
  X,
  AlertTriangle,
  Zap,
  Info,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  addToast,
  projects,
  loadProjects
} from '../../../stores/projectStore';
import {
  useProjectWorkspace
} from '../../../lib/query/projectWorkspace';
import { QueryProvider } from '../providers/QueryProvider';
import { ShareProjectModal } from './ShareProjectModal';

interface ChatViewProps {
  projectId: string;
}

const ChatViewInner: React.FC<ChatViewProps> = ({ projectId }) => {
  const { data: detail, isLoading, error } = useProjectWorkspace(projectId);

  const projectList = useStore(projects);
  const currentProject = projectList.find((p) => p.id === projectId);

  const [messageText, setMessageText] = useState('');
  const [mobileTab, setMobileTab] = useState<'files' | 'chat' | 'ai'>('chat');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [visibleSuggestionId, setVisibleSuggestionId] = useState<string | null>(null);

  const [showTabletFiles, setShowTabletFiles] = useState(false);

  // Edit suggestion state
  const [editingSugId, setEditingSugId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Local mock states for interactive demo
  const [messages, setMessages] = useState<Array<{
    id: string;
    senderName: string;
    senderInitials: string;
    isAI: boolean;
    timestamp: string;
    content: string;
    aiSuggestion?: {
      id: string;
      title: string;
      content: string;
      status: 'pending' | 'accepted' | 'rejected' | 'applied';
    };
  }>>([]);

  const [files, setFiles] = useState<Array<{
    id: string;
    name: string;
    size: string;
    type: string;
    uploadedAt: string;
  }>>([]);

  const [agentStatus, setAgentStatus] = useState<Record<string, 'active' | 'idle' | 'complete' | 'error'>>({
    MONITOR: 'idle',
    ANALYZER: 'idle',
    PLANNER: 'idle',
    UPDATER: 'idle',
  });

  const [panelSuggestions, setPanelSuggestions] = useState<Array<{
    id: string;
    type: 'SUGGESTION' | 'GAP' | 'TASK' | 'INSIGHT';
    content: string;
  }>>([]);

  // Initialize mock state when projectId changes
  useEffect(() => {
    setMessages([
      {
        id: 'msg_1',
        senderName: 'Sarah Connor',
        senderInitials: 'SC',
        isAI: false,
        timestamp: '10:30 AM',
        content: `Hi everyone! Welcome to the new workspace for project ${projectId}. Let's outline our foundation plan.`
      },
      {
        id: 'msg_2',
        senderName: 'You',
        senderInitials: 'YO',
        isAI: false,
        timestamp: '10:32 AM',
        content: "Thanks Sarah, glad to be here. I'll upload some specs files so the AI planner can suggest tasks."
      }
    ]);

    setFiles([
      { id: 'file_1', name: 'pr-specs.pdf', size: '2.4 MB', type: 'PDF', uploadedAt: '10m ago' },
      { id: 'file_2', name: 'api-endpoints.json', size: '1.2 MB', type: 'JSON', uploadedAt: '5m ago' }
    ]);

    setAgentStatus({
      MONITOR: 'idle',
      ANALYZER: 'idle',
      PLANNER: 'idle',
      UPDATER: 'idle',
    });

    setPanelSuggestions([
      {
        id: 'ps_1',
        type: 'INSIGHT',
        content: 'No critical path bottlenecks detected.'
      }
    ]);
  }, [projectId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load projects list on mount to get the project name
  useEffect(() => {
    void loadProjects();
  }, []);

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center text-text-muted select-none">
        Loading workspace data...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex-grow flex items-center justify-center text-error select-none">
        Error: {error instanceof Error ? error.message : 'Unable to load workspace.'}
      </div>
    );
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    
    const nextMsg = {
      id: `msg_${Date.now()}`,
      senderName: 'You',
      senderInitials: 'YO',
      isAI: false,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      content: messageText.trim()
    };
    setMessages(prev => [...prev, nextMsg]);
    setMessageText('');

    // Trigger fake agent pipeline animations
    setTimeout(() => {
      setAgentStatus({ MONITOR: 'active', ANALYZER: 'active', PLANNER: 'idle', UPDATER: 'idle' });
      setTimeout(() => {
        setAgentStatus({ MONITOR: 'idle', ANALYZER: 'complete', PLANNER: 'active', UPDATER: 'idle' });
        setTimeout(() => {
          setAgentStatus({ MONITOR: 'idle', ANALYZER: 'complete', PLANNER: 'complete', UPDATER: 'idle' });
          const sugId = `sug_${Date.now()}`;
          const aiMsg = {
            id: `msg_ai_${Date.now()}`,
            senderName: 'AI Suggestion',
            senderInitials: 'AI',
            isAI: true,
            timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            content: 'The AI analyzed your message and proposed a new task for Phase 1.',
            aiSuggestion: {
              id: sugId,
              title: 'AI Suggestion',
              content: 'ADD TASK: Design API authorization flow',
              status: 'pending' as const
            }
          };
          setMessages(prev => [...prev, aiMsg]);
          setPanelSuggestions(prev => [
            ...prev,
            {
              id: `ps_${sugId}`,
              type: 'TASK',
              content: 'ADD TASK: Design API authorization flow'
            }
          ]);
          addToast('info', 'New AI suggestion received!');
        }, 1200);
      }, 1000);
    }, 1500);
  };

  const handleFakeUpload = () => {
    const filenames = ['db-migration.sql', 'assets-pack.zip', 'architecture.md'];
    const randomName = filenames[Math.floor(Math.random() * filenames.length)];
    const fileExt = randomName.split('.').pop()?.toUpperCase() || 'FILE';
    const randomSize = `${(Math.random() * 5 + 1).toFixed(1)} MB`;

    const newFile = {
      id: `file_${Date.now()}`,
      name: randomName,
      size: randomSize,
      type: fileExt,
      uploadedAt: 'Just now'
    };
    setFiles(prev => [newFile, ...prev]);
    addToast('success', `${randomName} uploaded successfully!`);
  };

  const handleApproveProposal = (sugId: string) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.aiSuggestion && msg.aiSuggestion.id === sugId
          ? { ...msg, aiSuggestion: { ...msg.aiSuggestion, status: 'accepted' } }
          : msg
      )
    );
    addToast('success', 'Plan change approved and applied.');
  };

  const handleRejectProposal = (sugId: string) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.aiSuggestion && msg.aiSuggestion.id === sugId
          ? { ...msg, aiSuggestion: { ...msg.aiSuggestion, status: 'rejected' } }
          : msg
      )
    );
    addToast('warning', 'Plan change rejected.');
  };

  return (
    <div className="flex-grow flex flex-col lg:flex-row lg:h-[calc(100vh-112px)] lg:overflow-hidden bg-background relative lg:p-4 lg:gap-4">
      {/* 1. Files Panel (Left Column) */}
      <aside
        className={`w-full lg:w-[22%] lg:min-w-[240px] lg:max-w-[300px] border-r border-border lg:border-0 lg:rounded-xl lg:overflow-hidden bg-surface p-6 flex flex-col gap-6 shrink-0 lg:flex ${mobileTab === 'files' ? 'flex absolute inset-0 z-10' : 'hidden'
          } ${showTabletFiles ? 'flex absolute inset-y-0 left-0 w-[260px] z-30 shadow-2xl' : ''}`}
      >
        <div className="flex justify-between items-center">
          <span className="section-label">Files</span>
          {showTabletFiles && (
            <button
              onClick={() => setShowTabletFiles(false)}
              className="text-text-muted hover:text-text-primary text-xs lg:hidden flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          )}
        </div>

        <div className="flex-grow overflow-y-auto flex flex-col gap-3 pr-1">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-2 hover:bg-primary-muted rounded-sm transition-colors cursor-pointer group"
            >
              <FileText className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors shrink-0" />
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-text-primary truncate">{file.name}</p>
                <p className="text-xs text-text-muted mt-0.5">{file.type} · {file.size}</p>
              </div>
            </div>
          ))}

          {files.length === 0 && (
            <div className="text-xs text-text-muted italic py-4">No files uploaded.</div>
          )}
        </div>

        <button
          onClick={handleFakeUpload}
          className="btn-ghost border border-solid border-border rounded-full flex items-center justify-center gap-1.5 py-2 hover:border-primary hover:text-primary"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add File</span>
        </button>
      </aside>

      {/* 2. Team Chat Panel (Center Column) */}
      <section
        className={`flex-grow min-w-0 flex flex-col border-r border-border lg:border-0 lg:rounded-xl lg:overflow-hidden bg-surface min-h-[50vh] ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
      >
        {/* Chat Header */}
        <header className="h-[56px] px-8 border-b border-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium">Team Chat</h3>

            {/* Tablet File Toggle */}
            <button
              onClick={() => setShowTabletFiles(!showTabletFiles)}
              className="text-xs bg-surface border border-border px-2.5 py-1 rounded-sm text-text-muted hover:text-text-primary hover:border-text-muted transition-colors lg:hidden hidden md:inline-block"
            >
              ◫ Files
            </button>
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={() => addToast('info', 'Search is currently in indexing mode.')}
              className="btn-ghost p-2 h-8 w-8 rounded-md flex items-center justify-center hover:bg-surface-raised"
              title="Search"
              aria-label="Search chat"
            >
              <Search className="text-text-muted" />
            </button>
            <button
              onClick={() => setIsInviteOpen(true)}
              className="btn-ghost p-2 h-8 w-8 rounded-md flex items-center justify-center hover:bg-surface-raised"
              title="Members"
              aria-label="View project members"
            >
              <Users2 className="text-text-muted" />
            </button>
          </div>
        </header>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
          <div className="divider-labeled uppercase">TODAY</div>

          {messages.map((msg) => {
            const isUser = msg.senderName === 'You';
            const isAI = msg.isAI;

            if (isAI && msg.aiSuggestion) {
              const sug = msg.aiSuggestion;
              const isPending = sug.status === 'pending';
              const isVisibleInChat = visibleSuggestionId === sug.id;

              if (!isVisibleInChat) {
                return null;
              }

              return (
                <div
                  key={msg.id}
                  id={`msg-sug-${sug.id}`}
                  className="bg-primary-muted border border-primary/20 rounded-sm p-6 flex flex-col gap-4 max-w-[680px] w-full self-end fade-up scroll-mt-6"
                >
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <div className="flex items-center gap-2 text-primary">
                      <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="tracking-wide uppercase">AI SUGGESTION</span>
                    </div>
                    <span className="text-text-muted">{msg.timestamp}</span>
                  </div>

                  <p className="text-md text-text-secondary leading-relaxed select-text">
                    {msg.content}
                  </p>

                  <div className="border border-border-subtle bg-background p-4 rounded-sm">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Proposed plan change</p>

                    {editingSugId === sug.id ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={2}
                          className="bg-surface border border-border p-2 text-sm text-text-primary focus:outline-none focus:border-primary rounded-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingSugId(null)}
                            className="px-2.5 py-1 text-xs btn-secondary"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              sug.content = editingText;
                              setEditingSugId(null);
                              addToast('success', 'Plan change draft updated.');
                            }}
                            className="px-2.5 py-1 text-xs btn-primary"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-text-primary mt-1 select-text">
                        {sug.content}
                      </p>
                    )}
                  </div>

                  {isPending && (
                    <div className="flex gap-3 mt-1">
                      <button
                        onClick={() => handleApproveProposal(sug.id)}
                        className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditingSugId(sug.id);
                          setEditingText(sug.content);
                        }}
                        className="btn-secondary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleRejectProposal(sug.id)}
                        className="btn-secondary text-error hover:bg-error/10 hover:border-error/30 py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}

                  {!isPending && (
                    <div className="text-xs font-semibold flex items-center gap-1.5 mt-1 select-none">
                      {sug.status === 'accepted' && (
                        <>
                          <span className="text-success flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Approved & Synced</span>
                          <span className="text-text-muted">plan updated</span>
                        </>
                      )}
                      {sug.status === 'rejected' && (
                        <span className="text-error flex items-center gap-1"><X className="w-3.5 h-3.5" /> Plan change rejected</span>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-4 max-w-[680px] w-full fade-up ${isUser ? 'self-end flex-row-reverse' : 'self-start'
                  }`}
              >
                {/* Avatar */}
                <div className="h-8 w-8 rounded-full bg-surface border border-border flex items-center justify-center text-xs font-semibold text-text-muted select-none shrink-0">
                  {msg.senderInitials}
                </div>

                <div className={`flex flex-col gap-1 w-full ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-baseline gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs font-semibold text-text-muted">{msg.senderName}</span>
                    <span className="text-[10px] text-text-muted font-medium">{msg.timestamp}</span>
                  </div>
                  <p className={`text-md text-text-secondary leading-relaxed select-text whitespace-pre-wrap ${isUser ? 'text-right' : 'text-left'
                    }`}>
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          })}

          <div ref={chatEndRef} />
        </div>

        {/* Message Input Container */}
        <form
          onSubmit={handleSend}
          className="p-6 border-t border-border-subtle bg-surface flex flex-col shrink-0"
        >
          <div
            style={{ backgroundColor: 'transparent' }}
            className="flex items-center gap-3 bg-transparent border border-border rounded-xl pr-3 pl-5 py-2 w-full focus-within:border-text-muted transition-colors"
          >
            <textarea
              required
              placeholder="Type your message here..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              style={{ backgroundColor: 'transparent', border: 'none', outline: 'none' }}
              className="flex-1 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-text-primary text-sm placeholder-text-muted resize-none py-1.5 h-[34px] max-h-40"
            />

            <button
              type="submit"
              disabled={!messageText.trim()}
              className="h-8 w-8 rounded-full flex items-center justify-center transition-colors bg-surface-raised hover:bg-border text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:hover:bg-surface-raised disabled:hover:text-text-secondary shrink-0 cursor-pointer disabled:cursor-not-allowed"
              title="Send message"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </section>

      {/* 3. AI Activity Panel (Right Column) */}
      <aside
        className={`w-full lg:w-[28%] lg:min-w-[300px] lg:max-w-[380px] border-l border-border lg:border-0 lg:rounded-xl lg:overflow-hidden bg-surface p-6 flex flex-col gap-6 shrink-0 lg:flex ${mobileTab === 'ai' ? 'flex absolute inset-0 z-10' : 'hidden'
          }`}
      >
        <span className="section-label">AI Activity</span>

        {/* Agents statuses */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-text-primary tracking-wider uppercase">AGENTS</span>

          <div className="flex flex-col border border-border-subtle bg-background/50 rounded-sm divide-y divide-border-subtle/50">
            {Object.entries(agentStatus).map(([agent, status]) => {
              const isActive = status === 'active';
              const isComplete = status === 'complete';
              const isError = status === 'error';

              let labelColor = 'text-text-muted';
              let iconNode: React.ReactNode = <span className="h-2 w-2 rounded-full bg-text-muted shrink-0" />;

              if (isActive) {
                labelColor = 'text-primary font-bold';
                iconNode = <span className="h-2 w-2 rounded-full agent-pulse-dot shrink-0" />;
              } else if (isComplete) {
                labelColor = 'text-success';
                iconNode = <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />;
              } else if (isError) {
                labelColor = 'text-error';
                iconNode = <AlertCircle className="w-3.5 h-3.5 text-error shrink-0" />;
              }

              return (
                <div key={agent} className="flex justify-between items-center px-4 py-2.5 text-xs">
                  <span className="font-mono text-text-primary tracking-wider font-semibold">{agent}</span>
                  <div className="flex items-center gap-2">
                    {iconNode}
                    <span className={`uppercase tracking-widest text-[10px] ${labelColor}`}>
                      {status === 'active' ? 'Active' : status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border-subtle pt-4 flex flex-col gap-3">
          <span className="text-xs font-bold text-text-primary tracking-wider uppercase">SUGGESTIONS</span>

          <div className="flex-grow overflow-y-auto flex flex-col gap-3 max-h-[350px]">
            {panelSuggestions.map((sug) => {
              const chatSugId = sug.id === 'ps_2' ? 'sug_1' : (sug.id.startsWith('ps_ch_') ? sug.id.replace('ps_', '') : sug.id);
              const isVisible = visibleSuggestionId === chatSugId;
              let iconNode = <Zap className="w-3.5 h-3.5 text-primary shrink-0" />;
              let color = 'text-primary';

              if (sug.type === 'GAP') {
                iconNode = <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />;
                color = 'text-warning';
              } else if (sug.type === 'TASK') {
                iconNode = <Zap className="w-3.5 h-3.5 text-success shrink-0" />;
                color = 'text-success';
              } else if (sug.type === 'INSIGHT') {
                iconNode = <Info className="w-3.5 h-3.5 text-text-muted shrink-0" />;
                color = 'text-text-muted';
              }

              return (
                <div
                  key={sug.id}
                  className="bg-background border border-border-subtle rounded-sm p-4 flex flex-col gap-2 transition-all"
                >
                  <div className="flex justify-between items-center text-xs font-bold">
                    <div className="flex items-center gap-1.5">
                      {iconNode}
                      <span className={`tracking-wider uppercase ${color}`}>{sug.type}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextId = isVisible ? null : chatSugId;
                        setVisibleSuggestionId(nextId);
                        if (nextId) {
                          setTimeout(() => {
                            const el = document.getElementById(`msg-sug-${nextId}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }, 120);
                        }
                      }}
                      className="text-text-muted hover:text-text-primary p-0.5 hover:bg-surface-raised rounded transition-colors cursor-pointer"
                      title={isVisible ? "Hide suggestion details" : "View suggestion details"}
                    >
                      {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {isVisible && (
                    <p className="text-xs text-text-secondary leading-relaxed select-text mt-1 fade-up">
                      {sug.content}
                    </p>
                  )}
                  <div className="flex justify-end mt-1">
                    <a
                      href={`/project/${projectId}/plan`}
                      className="btn-ghost p-0 text-[10px] font-bold text-primary hover:bg-transparent flex items-center gap-1"
                    >
                      <span>Go to Plan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}

            {panelSuggestions.length === 0 && (
              <div className="text-xs text-text-muted italic py-4">No active warnings or suggestions.</div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (replaces sidebar controls on smaller viewports) */}
      <nav className="fixed bottom-0 left-0 right-0 h-14 bg-surface-raised border-t border-border flex justify-around items-center lg:hidden z-20 select-none">
        <button
          onClick={() => setMobileTab('files')}
          className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${mobileTab === 'files' ? 'text-primary' : 'text-text-muted'
            }`}
        >
          <span className="text-lg leading-none">▢</span>
          <span>Files</span>
        </button>
        <button
          onClick={() => setMobileTab('chat')}
          className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${mobileTab === 'chat' ? 'text-primary' : 'text-text-muted'
            }`}
        >
          <span className="text-lg leading-none">◈</span>
          <span>Chat</span>
        </button>
        <button
          onClick={() => setMobileTab('ai')}
          className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${mobileTab === 'ai' ? 'text-primary' : 'text-text-muted'
            }`}
        >
          <span className="text-lg leading-none">●</span>
          <span>AI activity</span>
        </button>
      </nav>

      {/* Share / Members Modal */}
      <ShareProjectModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        projectId={projectId}
        projectName={currentProject?.name || 'Project Workspace'}
      />
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = (props) => {
  return (
    <QueryProvider>
      <ChatViewInner {...props} />
    </QueryProvider>
  );
};

export default ChatView;
