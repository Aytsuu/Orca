import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { navigate } from 'astro:transitions/client';
import {
  Plus,
  FileText,
  Paperclip,
  Download,
  ExternalLink,
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
  Loader2,
  Compass,
  Calendar,
  RefreshCw
} from 'lucide-react';
import {
  addToast,
  projects,
  loadProjects
} from '../../../stores/projectStore';
import {
  useProjectWorkspace
} from '../../../lib/query/projectWorkspace';
import {
  useProjectAiActivity,
  usePromoteAiActivityItem,
  usePromoteAllAiActivity,
} from '../../../lib/query/projectAiActivity';
import {
  useProjectMessages,
  useSendProjectMessage,
} from '../../../lib/query/projectMessages';
import {
  useProjectFiles,
  useProjectFileAccessUrl,
  useDeleteProjectFile,
  usePromoteProjectFileToSource,
  useUploadProjectFile,
} from '../../../lib/query/projectFiles';
import { QueryProvider } from '../providers/QueryProvider';
import Modal from '../ui/Modal';
import { ShareProjectModal } from './ShareProjectModal';
import { sessionId } from '../../../stores/project/session';
import { formatRelativeTime, toInitials } from '../../../stores/project/repository';

interface ChatViewProps {
  projectId: string;
}

interface SuggestionCluster {
  key: string;
  type: 'GAP' | 'TASK' | 'SUGGESTION' | 'INSIGHT';
  suggestions: Array<{
    id: string;
    type: 'GAP' | 'TASK' | 'SUGGESTION' | 'INSIGHT';
    content: string;
    actionable: boolean;
  }>;
  collapsible: boolean;
}

const agentDetails: Record<
  string,
  { name: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }
> = {
  MONITOR: { name: 'Monitor Orca', icon: Eye },
  ANALYZER: { name: 'Analyzer Orca', icon: Compass },
  PLANNER: { name: 'Planner Orca', icon: Calendar },
  UPDATER: { name: 'Updater Orca', icon: RefreshCw },
};

const ChatViewInner: React.FC<ChatViewProps> = ({ projectId }) => {
  const { data: detail, isLoading, error } = useProjectWorkspace(projectId);
  const {
    data: projectMessages,
    isLoading: isMessagesLoading,
    error: messagesError,
  } = useProjectMessages(projectId);
  const {
    data: projectFiles,
    isLoading: isFilesLoading,
    error: filesError,
  } = useProjectFiles(projectId);
  const { data: aiActivity } = useProjectAiActivity(projectId);
  const promoteAiActivityItemMutation = usePromoteAiActivityItem(projectId);
  const promoteAllAiActivityMutation = usePromoteAllAiActivity(projectId);
  const sendMessageMutation = useSendProjectMessage(projectId);
  const uploadSourceFileMutation = useUploadProjectFile(projectId);
  const uploadChatFileMutation = useUploadProjectFile(projectId);
  const deleteProjectFileMutation = useDeleteProjectFile(projectId);
  const promoteProjectFileMutation = usePromoteProjectFileToSource(projectId);
  const currentSessionId = sessionId.get();

  const projectList = useStore(projects);
  const currentProject = projectList.find((p) => p.id === projectId);

  const [messageText, setMessageText] = useState('');
  const [mobileTab, setMobileTab] = useState<'files' | 'chat' | 'ai'>('chat');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [expandedSuggestionClusterKeys, setExpandedSuggestionClusterKeys] = useState<string[]>([]);
  const [activeMediaAttachment, setActiveMediaAttachment] = useState<{
    uploadedFileId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    signedUrl: string;
    isInSources: boolean;
    canRemove: boolean;
  } | null>(null);

  const [showTabletFiles, setShowTabletFiles] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Array<{
    id: string;
    name: string;
    size: string;
    type: string;
    uploadedAt: string;
    sessionId: string;
  }>>([]);
  const [pendingChatFiles, setPendingChatFiles] = useState<File[]>([]);

  useEffect(() => {
    if (projectFiles) {
      setFiles(
        projectFiles.map((file) => ({
          id: file.id,
          name: file.filename,
          size: formatFileSize(file.sizeBytes),
          type: file.mimeType.split('/').pop()?.toUpperCase() || 'FILE',
          uploadedAt: formatRelativeTime(file.createdAt),
          sessionId: file.sessionId,
        }))
      );
      return;
    }

    if (!isFilesLoading && !filesError) {
      setFiles([]);
    }
  }, [projectFiles, isFilesLoading, filesError]);

  const isInitialLoad = useRef(true);

  // Scroll to bottom on new messages and load transitions
  useEffect(() => {
    if (isLoading || isMessagesLoading) return;
    const container = chatEndRef.current?.parentElement;
    if (!container) return;

    const scrollToBottom = (behavior: 'auto' | 'smooth' = 'auto') => {
      if (behavior === 'auto') {
        container.scrollTop = container.scrollHeight;
      } else {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });
      }
    };

    // Initial scroll
    scrollToBottom('auto');

    // Handle container resizing (e.g. flexbox layout settling, window resizes)
    const resizeObserver = new ResizeObserver(() => {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom || isInitialLoad.current) {
        scrollToBottom('auto');
      }
    });
    resizeObserver.observe(container);

    // Watch for new messages added to DOM
    const mutationObserver = new MutationObserver(() => {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom || isInitialLoad.current) {
        scrollToBottom(isInitialLoad.current ? 'auto' : 'smooth');
        if (isInitialLoad.current) {
          isInitialLoad.current = false;
        }
      }
    });
    mutationObserver.observe(container, { childList: true, subtree: true });

    // Mark initial load finished after a short delay
    const timer = setTimeout(() => {
      isInitialLoad.current = false;
    }, 500);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      clearTimeout(timer);
    };
  }, [isLoading, isMessagesLoading]);

  // Load projects list on mount to get the project name
  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    setExpandedSuggestionClusterKeys([]);
  }, [projectId]);

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = messageText.trim();
    if (!content && pendingChatFiles.length === 0) return;
    setMessageText('');

    try {
      const uploadedAttachments = await Promise.all(
        pendingChatFiles.map((file) =>
          uploadChatFileMutation.mutateAsync({
            file,
            purpose: 'chat',
          })
        )
      );
      await sendMessageMutation.mutateAsync({
        content,
        attachments: uploadedAttachments.map((file) => ({
          uploadedFileId: file.id,
          filename: file.filename,
          mimeType: file.mimeType,
          storagePath: file.storagePath,
          sizeBytes: file.sizeBytes,
        })),
      });
      setPendingChatFiles([]);
    } catch (sendError) {
      setMessageText(content);
      if (pendingChatFiles.length > 0) {
        setPendingChatFiles([...pendingChatFiles]);
      }
      addToast(
        'error',
        sendError instanceof Error ? sendError.message : 'Unable to send message.'
      );
    }
  };

  const handleUploadSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      await uploadSourceFileMutation.mutateAsync({ file, purpose: 'source' });
      addToast('success', `${file.name} uploaded successfully.`);
    } catch (uploadError) {
      addToast(
        'error',
        uploadError instanceof Error ? uploadError.message : 'Unable to upload file.'
      );
    }
  };

  const handleChatAttachmentSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;

    setPendingChatFiles((currentFiles) => [...currentFiles, ...selectedFiles]);
  };

  const handleRemovePendingChatFile = (fileName: string, lastModified: number) => {
    setPendingChatFiles((currentFiles) =>
      currentFiles.filter(
        (file) => !(file.name === fileName && file.lastModified === lastModified)
      )
    );
  };

  const handlePromoteChatAttachment = async (fileId: string, filename: string) => {
    try {
      await promoteProjectFileMutation.mutateAsync(fileId);
      addToast('success', `${filename} added to Sources.`);
    } catch (promotionError) {
      addToast(
        'error',
        promotionError instanceof Error ? promotionError.message : 'Unable to add file to Sources.'
      );
    }
  };

  const handleDeleteFile = async (fileId: string, filename: string) => {
    try {
      await deleteProjectFileMutation.mutateAsync(fileId);
      addToast('success', `${filename} removed.`);
    } catch (deleteError) {
      addToast(
        'error',
        deleteError instanceof Error ? deleteError.message : 'Unable to remove file.'
      );
    }
  };

  const handlePromoteSuggestion = async (suggestionId: string) => {
    try {
      await promoteAiActivityItemMutation.mutateAsync(suggestionId);
      addToast('success', 'Suggestion moved to pending changes.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Unable to send suggestion to review.');
    }
  };

  const handlePromoteAllSuggestions = async () => {
    try {
      const result = await promoteAllAiActivityMutation.mutateAsync();
      addToast('success', `${result.change_ids.length} suggestion${result.change_ids.length === 1 ? '' : 's'} moved to pending changes.`);
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Unable to send suggestions to review.');
    }
  };

  const agentStatus = aiActivity?.agentStatus || {
    MONITOR: 'idle',
    ANALYZER: 'idle',
    PLANNER: 'idle',
    UPDATER: 'idle',
  };
  const recentOrcaActivity = aiActivity?.recentActivity || null;
  const panelSuggestions = aiActivity?.suggestions || [];
  const actionableSuggestionCount = panelSuggestions.filter((suggestion) => suggestion.actionable).length;
  const suggestionClusters = buildSuggestionClusters(panelSuggestions);

  const renderedMessages = (projectMessages ?? []).map((message) => {
    const teammate = detail.teammates.find((member) => member.sessionId === message.sessionId);
    const isCurrentUser = message.sessionId === currentSessionId;

    return {
      id: message.id,
      senderName: isCurrentUser ? 'You' : teammate?.name ?? message.sessionId,
      senderInitials: isCurrentUser ? 'YO' : teammate?.initials ?? toInitials(message.sessionId),
      timestamp: new Date(message.createdAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      }),
      content: message.content,
      attachments: message.attachments,
      isCurrentUser,
      isOptimistic: message.isOptimistic,
    };
  });

  const lastUserMessageId = [...renderedMessages]
    .reverse()
    .find((msg) => msg.isCurrentUser)?.id;
  const sourceFileIds = new Set((projectFiles || []).map((file) => file.id));
  const currentMember = detail.teammates.find((member) => member.sessionId === currentSessionId);
  const canManageAnyFile = Boolean(currentMember?.isCreator || currentMember?.role === 'APPROVER');

  return (
    <div className="flex-grow flex flex-col lg:flex-row lg:h-[calc(100vh-112px)] lg:overflow-hidden bg-background relative lg:p-4 lg:gap-4">
      {/* 1. Sources Panel (Left Column) */}
      <aside
        className={`w-full lg:w-[22%] lg:min-w-[240px] lg:max-w-[300px] border-r border-border lg:border-0 lg:rounded-xl lg:overflow-hidden bg-surface p-6 flex flex-col gap-6 shrink-0 lg:flex ${mobileTab === 'files' ? 'flex absolute inset-0 z-10' : 'hidden'
          } ${showTabletFiles ? 'flex absolute inset-y-0 left-0 w-[260px] z-30 shadow-2xl' : ''}`}
      >
        <div className="flex justify-between items-center">
          <span className="section-label">Sources</span>
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
              className="flex items-center justify-between gap-3 p-2 hover:bg-primary-muted rounded-sm transition-colors group"
            >
              <div className="min-w-0 flex items-center gap-3">
                <FileText className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors shrink-0" />
                <div className="overflow-hidden">
                  <p className="text-sm font-semibold text-text-primary truncate">{file.name}</p>
                  <p className="text-xs text-text-muted mt-0.5">{file.type} / {file.size}</p>
                </div>
              </div>
              {(canManageAnyFile || file.sessionId === currentSessionId) && (
                <button
                  type="button"
                  onClick={() => {
                    void handleDeleteFile(file.id, file.name);
                  }}
                  disabled={deleteProjectFileMutation.isPending}
                  className="text-[10px] font-semibold uppercase tracking-wide text-error hover:opacity-80 disabled:opacity-50 shrink-0"
                >
                  Remove
                </button>
              )}
            </div>
          ))}

          {files.length === 0 && (
            <div className="text-xs text-text-muted py-4">No sources added.</div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            void handleUploadSelection(event);
          }}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadSourceFileMutation.isPending}
          className="btn-ghost border border-solid border-border rounded-full flex items-center justify-center gap-1.5 py-2 hover:border-primary hover:text-primary disabled:opacity-60"
        >
          {uploadSourceFileMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          <span>{uploadSourceFileMutation.isPending ? 'Uploading...' : 'Add Sources'}</span>
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

          {isMessagesLoading && (
            <div className="text-sm text-text-muted">Loading messages...</div>
          )}

          {messagesError && (
            <div className="text-sm text-error">
              {messagesError instanceof Error ? messagesError.message : 'Unable to load messages.'}
            </div>
          )}

          {!isMessagesLoading && !messagesError && renderedMessages.length === 0 && (
            <div className="text-sm text-text-muted">
              No messages yet. Start the conversation with your project members.
            </div>
          )}

          {renderedMessages.map((msg) => {
            const isUser = msg.isCurrentUser;
            return (
              <div
                key={msg.id}
                className={`flex gap-4 max-w-[680px] w-full fade-up transition-opacity duration-300 ${isUser ? 'self-end flex-row-reverse' : 'self-start'
                  } ${msg.isOptimistic ? 'opacity-70' : 'opacity-100'}`}
              >
                {/* Avatar */}
                <div className="h-8 w-8 rounded-full bg-surface border border-border flex items-center justify-center text-xs font-semibold text-text-muted select-none shrink-0">
                  {msg.senderInitials}
                </div>

                <div className={`flex flex-col gap-1.5 w-full ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-baseline gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs font-semibold text-text-muted">{msg.senderName}</span>
                    <span className="text-[10px] text-text-muted font-medium">{msg.timestamp}</span>
                  </div>

                  {/* Message Bubble Container - Only for Text */}
                  {renderMessageText(msg.content, msg.attachments) && (
                    <div
                      className={`rounded-2xl py-2 px-4 text-sm max-w-[85%] select-text whitespace-pre-wrap leading-relaxed ${isUser
                        ? 'bg-primary-muted border border-primary/10 text-text-primary rounded-tr-none'
                        : 'bg-surface-raised border border-border-subtle text-text-secondary rounded-tl-none'
                        }`}
                    >
                      {renderMessageText(msg.content, msg.attachments)}
                    </div>
                  )}

                  {/* Attachments rendered outside of the text bubble container */}
                  {msg.attachments.length > 0 && (
                    <div className="flex flex-col gap-2 w-full max-w-[85%] sm:max-w-[360px]">
                      {msg.attachments.map((attachment) => {
                        const isInSources = sourceFileIds.has(attachment.uploadedFileId);
                        return (
                          <div
                            key={attachment.uploadedFileId}
                            className="rounded-xl border border-border-subtle bg-background/60 px-3 py-3 flex flex-col gap-3"
                          >
                            <ChatAttachmentPreview
                              projectId={projectId}
                              attachment={attachment}
                              onOpenMedia={(media) =>
                                setActiveMediaAttachment({
                                  ...media,
                                  uploadedFileId: attachment.uploadedFileId,
                                  sizeBytes: attachment.sizeBytes,
                                  isInSources,
                                  canRemove: canManageAnyFile || msg.isCurrentUser,
                                })
                              }
                            />
                            <div className="min-w-0 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-text-muted shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-text-primary truncate">
                                  {attachment.filename}
                                </div>
                                <div className="text-[11px] text-text-muted">
                                  {attachment.mimeType.split('/').pop()?.toUpperCase() || 'FILE'} / {formatFileSize(attachment.sizeBytes)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isUser && (msg.isOptimistic || msg.id === lastUserMessageId) && (
                    <div className="mt-0.5 flex justify-end items-center text-text-muted select-none">
                      {msg.isOptimistic ? (
                        <span className="flex items-center gap-1" title="Sending...">
                          <span className='text-[11px]'>Sending</span>
                          <Loader2 className="w-3 h-3 animate-spin" />
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-medium animate-fade-in" title="Delivered">
                          <span className='text-[11px]'>Delivered</span>
                        </span>
                      )}
                    </div>
                  )}
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
          {pendingChatFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {pendingChatFiles.map((file) => (
                <div
                  key={`${file.name}-${file.lastModified}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-text-secondary"
                >
                  <FileText className="w-3.5 h-3.5 text-text-muted" />
                  <span className="max-w-[180px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePendingChatFile(file.name, file.lastModified)}
                    className="text-text-muted hover:text-text-primary"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={chatFileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleChatAttachmentSelection}
          />

          <div
            style={{ backgroundColor: 'transparent' }}
            className="flex items-center gap-3 bg-transparent border border-border rounded-xl pr-3 pl-5 py-2 w-full focus-within:border-text-muted transition-colors"
          >
            <textarea
              placeholder="Type your message here..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend(e);
                }
              }}
              style={{ backgroundColor: 'transparent', border: 'none', outline: 'none' }}
              className="flex-1 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-text-primary text-sm placeholder-text-muted resize-none py-1.5 h-[34px] max-h-40"
            />

            <button
              type="button"
              onClick={() => chatFileInputRef.current?.click()}
              disabled={sendMessageMutation.isPending || uploadChatFileMutation.isPending}
              className="h-8 w-8 rounded-full flex items-center justify-center transition-colors bg-surface-raised hover:bg-border text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:hover:bg-surface-raised disabled:hover:text-text-secondary shrink-0"
              title="Attach file to team chat"
              aria-label="Attach file to team chat"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              type="submit"
              disabled={
                (!messageText.trim() && pendingChatFiles.length === 0) ||
                sendMessageMutation.isPending ||
                uploadChatFileMutation.isPending
              }
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
        <span className="section-label shrink-0">AI Activity</span>

        {/* Agents statuses */}
        <div className="flex flex-col gap-2 shrink-0">
          <span className="text-xs font-bold text-text-primary tracking-wider uppercase">ORCAS</span>

          <div className="relative flex items-center justify-between px-6 py-4 bg-background/50 rounded-xl border border-border-subtle">
            {/* Connector Line */}
            <div className="absolute left-[42px] right-[42px] h-0.5 bg-border-subtle top-1/2 -translate-y-1/2 z-0" />

            {['MONITOR', 'ANALYZER', 'PLANNER', 'UPDATER'].map((key) => {
              const status = agentStatus[key] || 'idle';
              const agentInfo = agentDetails[key];
              if (!agentInfo) return null;

              const IconComponent = agentInfo.icon;
              const isActive = status === 'active';
              const isError = status === 'error';

              let iconContainerClass = '';

              if (isActive) {
                iconContainerClass = 'border-primary text-primary bg-primary/15 shadow-sm shadow-primary-glow/20';
              } else if (isError) {
                iconContainerClass = 'border-error/50 text-error bg-error/10';
              } else {
                iconContainerClass = 'border-border-subtle text-text-muted bg-surface-raised/50';
              }

              return (
                <div key={key} className="relative z-10 flex flex-col items-center group cursor-help" title={`${agentInfo.name}: ${status}`}>
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 flex flex-col items-center">
                    <div className="bg-surface-raised border border-border-subtle text-text-primary text-[10px] px-2.5 py-1 rounded-md shadow-lg font-medium tracking-wide whitespace-nowrap">
                      <span className="font-semibold text-text-primary">{agentInfo.name}</span>
                      <span className="mx-1 text-text-muted">•</span>
                      <span className={`uppercase text-[9px] font-bold ${isActive ? 'text-primary animate-pulse' : isError ? 'text-error' : 'text-text-muted'
                        }`}>{status}</span>
                    </div>
                    <div className="w-1.5 h-1.5 bg-surface-raised border-r border-b border-border-subtle transform rotate-45 -mt-1" />
                  </div>

                  {/* Icon Container with solid backing to mask the line */}
                  <div className="relative transition-transform duration-300 hover:scale-110">
                    {/* Solid Mask */}
                    <div className="absolute inset-0 rounded-full bg-surface -z-10" />

                    {/* Pulsing ring for active state */}
                    {isActive && (
                      <div className="absolute -inset-1 rounded-full bg-primary/25 animate-ping -z-10" />
                    )}

                    <div className={`h-9 w-9 rounded-full flex items-center justify-center border transition-all duration-300 ${iconContainerClass}`}>
                      <IconComponent
                        className={`w-4.5 h-4.5 ${isActive && key !== 'UPDATER' ? 'animate-pulse' : ''
                          } ${isActive && key === 'UPDATER' ? 'animate-spin' : ''
                          }`}
                        style={isActive && key === 'UPDATER' ? { animationDuration: '3s' } : undefined}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {recentOrcaActivity && (
            <div className="px-1 text-[11px] text-text-muted leading-relaxed select-text">
              {recentOrcaActivity}
            </div>
          )}
        </div>

        <div className="border-t border-border-subtle pt-4 flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 shrink-0">
            <span className="text-xs font-bold text-text-primary tracking-wider uppercase">SUGGESTIONS</span>
            {actionableSuggestionCount > 1 && (
              <button
                type="button"
                onClick={() => {
                  void handlePromoteAllSuggestions();
                }}
                disabled={promoteAllAiActivityMutation.isPending}
                className="text-[10px] font-bold text-primary hover:text-primary-hover disabled:opacity-50"
              >
                {promoteAllAiActivityMutation.isPending ? 'Sending...' : `Send All (${actionableSuggestionCount})`}
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-3 pr-1 pb-6">
            {suggestionClusters.map((cluster) => {
              const isInsight = cluster.type === 'INSIGHT';
              const isExpanded = !cluster.collapsible || expandedSuggestionClusterKeys.includes(cluster.key);
              let iconNode = <Zap className="w-3.5 h-3.5 text-primary shrink-0" />;
              let color = 'text-primary';

              if (cluster.type === 'GAP') {
                iconNode = <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />;
                color = 'text-warning';
              } else if (cluster.type === 'TASK') {
                iconNode = <Zap className="w-3.5 h-3.5 text-success shrink-0" />;
                color = 'text-success';
              } else if (cluster.type === 'INSIGHT') {
                iconNode = <Info className="w-3.5 h-3.5 text-text-muted shrink-0" />;
                color = 'text-text-muted';
              }

              if (isInsight) {
                return (
                  <div
                    key={cluster.key}
                    className="min-w-0 shrink-0 text-xs text-text-secondary leading-relaxed"
                  >
                    <p className="select-text">
                      {cluster.suggestions[0]?.content}
                    </p>
                  </div>
                );
              }

              return (
                <div
                  key={cluster.key}
                  className="bg-background/50 border border-border-subtle rounded-xl p-4 flex flex-col gap-3 transition-all min-w-0 shrink-0"
                >
                  <div className="flex items-center justify-between gap-3 text-xs font-bold">
                    <div className="flex items-center gap-1.5">
                      {iconNode}
                      <span className={`tracking-wider uppercase ${color}`}>
                        {cluster.type}
                        {cluster.collapsible ? ` (${cluster.suggestions.length})` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {cluster.type === 'TASK' && (
                        <button
                          type="button"
                          onClick={() => {
                            void navigate(`/project/${projectId}/plan`);
                          }}
                          className="px-2.5 py-1 rounded-md border border-border bg-surface-raised text-[10px] font-bold text-text-primary hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          Preview
                        </button>
                      )}
                      {cluster.collapsible && (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedSuggestionClusterKeys((currentKeys) =>
                              currentKeys.includes(cluster.key)
                                ? currentKeys.filter((key) => key !== cluster.key)
                                : [...currentKeys, cluster.key]
                            );
                          }}
                          className="text-[10px] font-bold text-text-muted hover:text-text-primary"
                        >
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="flex flex-col gap-3">
                      {cluster.suggestions.map((suggestion, index) => (
                        <div
                          key={suggestion.id}
                          className={index > 0 ? 'border-t border-border-subtle pt-3' : ''}
                        >
                          <p className="text-xs text-text-secondary leading-relaxed select-text">
                            {suggestion.content}
                          </p>
                          {suggestion.actionable && (
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  void handlePromoteSuggestion(suggestion.id);
                                }}
                                disabled={promoteAiActivityItemMutation.isPending}
                                className="text-[10px] font-bold text-primary hover:text-primary-hover disabled:opacity-50"
                              >
                                {promoteAiActivityItemMutation.isPending ? 'Sending...' : 'Send to review'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {suggestionClusters.length === 0 && (
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
      <Modal
        isOpen={Boolean(activeMediaAttachment)}
        onClose={() => setActiveMediaAttachment(null)}
        title={
          activeMediaAttachment?.mimeType.startsWith('image/')
            ? 'Image Preview'
            : activeMediaAttachment?.mimeType.startsWith('video/')
              ? 'Video Preview'
              : 'File Preview'
        }
        maxWidthClass="max-w-[1100px]"
        className="p-5"
      >
        {activeMediaAttachment && (
          <div className="flex flex-col gap-4">
            <div className="text-xs text-text-muted">{activeMediaAttachment.filename}</div>
            {activeMediaAttachment.mimeType.startsWith('image/') ? (
              <img
                src={activeMediaAttachment.signedUrl}
                alt={activeMediaAttachment.filename}
                className="block max-h-[75vh] w-full object-contain rounded-lg bg-black/10"
              />
            ) : activeMediaAttachment.mimeType.startsWith('video/') ? (
              <video
                controls
                preload="metadata"
                className="block max-h-[75vh] w-full rounded-lg bg-black"
                src={activeMediaAttachment.signedUrl}
              />
            ) : (
              <div className="rounded-lg border border-border-subtle bg-surface-raised p-4 text-sm text-text-secondary">
                <div className="font-semibold text-text-primary">{activeMediaAttachment.filename}</div>
                <div className="mt-1 text-xs text-text-muted">
                  {activeMediaAttachment.mimeType} / {formatFileSize(activeMediaAttachment.sizeBytes)}
                </div>
              </div>
            )}
            <ChatAttachmentActions
              attachment={activeMediaAttachment}
              onAddToSources={() => {
                void handlePromoteChatAttachment(
                  activeMediaAttachment.uploadedFileId,
                  activeMediaAttachment.filename
                );
              }}
              onRemove={() => {
                void handleDeleteFile(
                  activeMediaAttachment.uploadedFileId,
                  activeMediaAttachment.filename
                );
                setActiveMediaAttachment(null);
              }}
              canRemove={activeMediaAttachment.canRemove}
              isInSources={activeMediaAttachment.isInSources}
              isPromoting={promoteProjectFileMutation.isPending}
              isDeleting={deleteProjectFileMutation.isPending}
            />
          </div>
        )}
      </Modal>
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

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function renderMessageText(
  content: string,
  attachments: Array<{ uploadedFileId: string }>
): string {
  const normalized = content.trim();
  if (
    attachments.length > 0 &&
    (normalized === 'Shared an attachment.' || normalized === `Shared ${attachments.length} attachments.`)
  ) {
    return '';
  }

  return content;
}

type ChatAttachmentDisplay = {
  uploadedFileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

function ChatAttachmentPreview({
  projectId,
  attachment,
  onOpenMedia,
}: {
  projectId: string;
  attachment: ChatAttachmentDisplay;
  onOpenMedia: (media: { filename: string; mimeType: string; signedUrl: string }) => void;
}) {
  const { data, isLoading } = useProjectFileAccessUrl(projectId, attachment.uploadedFileId);
  const signedUrl = data?.signedUrl;
  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');
  const canPreviewVideo = isVideo && attachment.sizeBytes <= 50 * 1024 * 1024;

  if (!signedUrl || (!isImage && !canPreviewVideo)) {
    if (isLoading) {
      return <div className="text-[11px] text-text-muted">Loading preview...</div>;
    }
    return (
      <button
        type="button"
        onClick={() =>
          onOpenMedia({
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            signedUrl: signedUrl || '',
          })
        }
        className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-left transition-colors hover:border-primary/40"
      >
        <span className="text-[11px] font-medium text-text-primary">Open file details</span>
        <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-raised">
      {isImage ? (
        <button
          type="button"
          onClick={() =>
            onOpenMedia({
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              signedUrl,
            })
          }
          className="block w-full"
        >
          <img
            src={signedUrl}
            alt={attachment.filename}
            className="block max-h-72 w-full object-contain bg-black/5"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() =>
            onOpenMedia({
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              signedUrl,
            })
          }
          className="block w-full"
        >
          <video
            muted
            preload="metadata"
            className="block max-h-72 w-full bg-black"
            src={signedUrl}
          />
        </button>
      )}
    </div>
  );
}

function ChatAttachmentActions({
  attachment,
  onAddToSources,
  onRemove,
  canRemove,
  isInSources,
  isPromoting,
  isDeleting,
}: {
  attachment: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    signedUrl: string;
  };
  onAddToSources: () => void;
  onRemove: () => void;
  canRemove: boolean;
  isInSources: boolean;
  isPromoting: boolean;
  isDeleting: boolean;
}) {
  const signedUrl = attachment.signedUrl;
  const isMedia =
    attachment.mimeType.startsWith('image/') || attachment.mimeType.startsWith('video/');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isInSources ? (
        <span className="inline-flex items-center rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-[11px] font-medium text-success">
          In Sources
        </span>
      ) : (
        <button
          type="button"
          onClick={onAddToSources}
          disabled={isPromoting}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-[11px] font-medium text-text-primary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isPromoting ? 'Adding...' : 'Add to Sources'}</span>
        </button>
      )}
      {!isMedia && (
        <a
          href={signedUrl || '#'}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-[11px] font-medium text-text-primary hover:border-primary/40 hover:text-primary transition-colors"
          aria-disabled={!signedUrl}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open file</span>
        </a>
      )}
      <a
        href={signedUrl || '#'}
        download={attachment.filename}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-[11px] font-medium text-text-primary hover:border-primary/40 hover:text-primary transition-colors"
        aria-disabled={!signedUrl}
      >
        <Download className="w-3.5 h-3.5" />
        <span>Download</span>
      </a>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={isDeleting}
          className="inline-flex items-center gap-1 rounded-md border border-error/30 bg-error/10 px-2.5 py-1.5 text-[11px] font-medium text-error hover:opacity-80 disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          <span>{isDeleting ? 'Removing...' : 'Remove'}</span>
        </button>
      )}
      {attachment.mimeType.startsWith('video/') && attachment.sizeBytes > 50 * 1024 * 1024 && (
        <span className="text-[11px] text-text-muted">Preview limited to 50 MB.</span>
      )}
    </div>
  );
}

function buildSuggestionClusters(
  suggestions: SuggestionCluster['suggestions']
): SuggestionCluster[] {
  const clusters: SuggestionCluster[] = [];
  let index = 0;

  while (index < suggestions.length) {
    const current = suggestions[index];
    if (!current) {
      index += 1;
      continue;
    }

    if (current.type === 'GAP' || current.type === 'TASK') {
      const groupedSuggestions = [current];
      let nextIndex = index + 1;

      while (nextIndex < suggestions.length && suggestions[nextIndex]?.type === current.type) {
        groupedSuggestions.push(suggestions[nextIndex]);
        nextIndex += 1;
      }

      clusters.push({
        key: `${current.type.toLowerCase()}-cluster-${current.id}`,
        type: current.type,
        suggestions: groupedSuggestions,
        collapsible: groupedSuggestions.length >= 2,
      });
      index = nextIndex;
      continue;
    }

    clusters.push({
      key: `${current.type.toLowerCase()}-${current.id}`,
      type: current.type,
      suggestions: [current],
      collapsible: false,
    });
    index += 1;
  }

  return clusters;
}
