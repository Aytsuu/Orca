// src/stores/projectStore.ts
import { atom } from 'nanostores';

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  membersCount: number;
  updatedText: string;
  status: 'active' | 'draft';
}

export interface Teammate {
  id: string;
  name: string;
  initials: string;
  role: 'APPROVER' | 'EDITOR' | 'VIEWER';
  isCreator?: boolean;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
}

export interface AISuggestion {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'accepted' | 'rejected' | 'applied';
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderInitials: string;
  isAI: boolean;
  timestamp: string;
  content: string;
  aiSuggestion?: AISuggestion;
}

export interface AgentStatus {
  MONITOR: 'active' | 'idle' | 'complete' | 'error';
  ANALYZER: 'active' | 'idle' | 'complete' | 'error';
  PLANNER: 'active' | 'idle' | 'complete' | 'error';
  UPDATER: 'active' | 'idle' | 'complete' | 'error';
}

export interface AIPanelSuggestion {
  id: string;
  type: 'SUGGESTION' | 'GAP' | 'TASK' | 'INSIGHT';
  content: string;
}

export interface Task {
  id: string;
  title: string;
  owner: string;
  due: string;
  isNew?: boolean;
  hasGap?: boolean;
  gapText?: string;
}

export interface Phase {
  title: string;
  timeframe: string;
  tasks: Task[];
}

export interface ProjectPlan {
  title: string;
  updatedAt: string;
  phases: Phase[];
}

export interface PendingChange {
  id: string;
  type: 'ADD_TASK' | 'UPDATE_PRIORITY' | 'DELETE_TASK';
  taskTitle: string;
  detail: string;
  phaseIndex: number;
  due: string;
  owner: string;
}

export interface MCPServer {
  name: string;
  url: string;
  status: 'Connected' | 'Failed';
}

export interface AIPermissions {
  analyzeConversations: boolean;
  generatePlans: boolean;
  flagRisks: boolean;
  generateSummaries: boolean;
  accessExternalTools: boolean;
  generateCodeSnippets: boolean;
}

export interface ProjectDetailState {
  projectId: string;
  teammates: Teammate[];
  files: UploadedFile[];
  messages: ChatMessage[];
  agentStatus: AgentStatus;
  panelSuggestions: AIPanelSuggestion[];
  currentPlan: ProjectPlan;
  planHistory: ProjectPlan[]; // max length 3
  pendingChanges: PendingChange[];
  mcpServers: MCPServer[];
  aiPermissions: AIPermissions;
  revertsRemaining: number;
  finalizedAt?: string;
}

// -------------------------------------------------------------
// Helper: Load/Save from localStorage
// -------------------------------------------------------------
const STORAGE_KEY_PROJECTS = 'orca_projects_list';
const STORAGE_KEY_DETAILS = 'orca_project_details_';
const STORAGE_KEY_SESSION = 'orca_session_id';

function loadProjectsFromStorage(): Project[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY_PROJECTS);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  
  // Seed initial project list if empty
  const defaultProjects: Project[] = [
    {
      id: 'runway-q3',
      name: 'Runway Q3 Launch',
      description: 'Go-to-market timeline and product deliverables for Q3 release.',
      createdAt: new Date(Date.now() - 24 * 3600 * 1000 * 3).toISOString(),
      membersCount: 4,
      updatedText: '2h ago',
      status: 'active'
    },
    {
      id: 'billing-v2',
      name: 'Billing System v2',
      description: 'Migration to Stripe invoicing and checkout flows.',
      createdAt: new Date(Date.now() - 24 * 3600 * 1000 * 10).toISOString(),
      membersCount: 1,
      updatedText: 'Draft',
      status: 'draft'
    }
  ];
  localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(defaultProjects));
  return defaultProjects;
}

function saveProjectsToStorage(projects: Project[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
}

function loadSessionId(): string {
  if (typeof window === 'undefined') return 'user_session';
  let id = localStorage.getItem(STORAGE_KEY_SESSION);
  if (!id) {
    id = `user_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(STORAGE_KEY_SESSION, id);
  }
  return id;
}

// Seed helper for detailed project data
function seedProjectDetail(projectId: string): ProjectDetailState {
  const defaultPlan: ProjectPlan = {
    title: projectId === 'runway-q3' ? 'Project Plan — Runway Q3 Launch' : 'Project Plan — ' + projectId,
    updatedAt: 'Jun 12 · Last updated 2h ago',
    phases: [
      {
        title: 'Phase 1 — Foundation',
        timeframe: 'Day 1–2',
        tasks: [
          { id: 't1', title: 'Define product requirements', owner: '@jan', due: 'Jun 14' },
          { id: 't2', title: 'Set up repository and environments', owner: '@ryu', due: 'Jun 14' }
        ]
      },
      {
        title: 'Phase 2 — Build',
        timeframe: 'Day 3–5',
        tasks: [
          { id: 't3', title: 'Core UI layout implementation', owner: '@sam', due: 'Jun 17', hasGap: true, gapText: 'Missing designer signoff' }
        ]
      }
    ]
  };

  const defaultTeammates: Teammate[] = [
    { id: 'creator_id', name: 'You (Creator)', initials: 'YO', role: 'APPROVER', isCreator: true },
    { id: 'jan_doe', name: 'Jan Doe', initials: 'JD', role: 'APPROVER' },
    { id: 'ryu_lee', name: 'Ryu Lee', initials: 'RD', role: 'EDITOR' },
    { id: 'sam_k', name: 'Sam K.', initials: 'SK', role: 'VIEWER' }
  ];

  const defaultFiles: UploadedFile[] = [
    { id: 'f1', name: 'design-brief.pdf', size: '2.4 MB', type: 'PDF', uploadedAt: '2h ago' },
    { id: 'f2', name: 'wireframes.fig', size: '14 MB', type: 'Figma', uploadedAt: '1h ago' }
  ];

  const defaultMessages: ChatMessage[] = [
    {
      id: 'm1',
      senderName: 'Jan Doe',
      senderInitials: 'JD',
      isAI: false,
      timestamp: '10:32 AM',
      content: 'What should the priority be for setting up environments? We need it before starting core implementation.'
    },
    {
      id: 'm2',
      senderName: 'AI Suggestion',
      senderInitials: 'AI',
      isAI: true,
      timestamp: '10:33 AM',
      content: "Based on our timeline, environment setup is a blocker. I suggest prioritizing Phase 1 setup tasks to prevent delays. I've flagged a gap in Phase 2 where Core UI layout lacks owner confirmation.",
      aiSuggestion: {
        id: 'sug_1',
        title: 'AI Suggestion',
        content: 'Add "Verify QA Pipeline" task to Phase 1, due Jun 15, owned by @ryu.',
        status: 'pending'
      }
    }
  ];

  const defaultMCPServers: MCPServer[] = [
    { name: 'Notion', url: 'https://mcp.notion.so', status: 'Connected' },
    { name: 'GitHub', url: 'https://mcp.github.com', status: 'Connected' }
  ];

  const defaultPermissions: AIPermissions = {
    analyzeConversations: true,
    generatePlans: true,
    flagRisks: true,
    generateSummaries: true,
    accessExternalTools: true,
    generateCodeSnippets: false
  };

  const defaultSuggestions: AIPanelSuggestion[] = [
    { id: 'ps_1', type: 'GAP', content: 'Task 3 "Core UI layout" has no designer signoff' },
    { id: 'ps_2', type: 'SUGGESTION', content: 'Suggest adding a review milestone before Phase 2 build starts' }
  ];

  const defaultPendingChanges: PendingChange[] = [
    {
      id: 'ch_1',
      type: 'ADD_TASK',
      taskTitle: 'Verify QA Pipeline',
      detail: 'Add to Phase 1. Due Jun 15. Owner: @ryu',
      phaseIndex: 0,
      due: 'Jun 15',
      owner: '@ryu'
    }
  ];

  return {
    projectId,
    teammates: defaultTeammates,
    files: defaultFiles,
    messages: defaultMessages,
    agentStatus: { MONITOR: 'idle', ANALYZER: 'idle', PLANNER: 'idle', UPDATER: 'idle' },
    panelSuggestions: defaultSuggestions,
    currentPlan: defaultPlan,
    planHistory: [JSON.parse(JSON.stringify(defaultPlan))],
    pendingChanges: defaultPendingChanges,
    mcpServers: defaultMCPServers,
    aiPermissions: defaultPermissions,
    revertsRemaining: 3
  };
}

function loadProjectDetailFromStorage(projectId: string): ProjectDetailState {
  if (typeof window === 'undefined') return seedProjectDetail(projectId);
  const stored = localStorage.getItem(STORAGE_KEY_DETAILS + projectId);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return seedProjectDetail(projectId);
    }
  }
  const seeded = seedProjectDetail(projectId);
  localStorage.setItem(STORAGE_KEY_DETAILS + projectId, JSON.stringify(seeded));
  return seeded;
}

function saveProjectDetailToStorage(projectId: string, state: ProjectDetailState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_DETAILS + projectId, JSON.stringify(state));
}

// -------------------------------------------------------------
// Nanostores Definitions
// -------------------------------------------------------------
export const projects = atom<Project[]>(loadProjectsFromStorage());
export const sessionId = atom<string>(loadSessionId());
export const activeProjectState = atom<ProjectDetailState | null>(null);
export const toastMessages = atom<{ id: string; type: 'success' | 'warning' | 'error' | 'info'; text: string }[]>([]);

// -------------------------------------------------------------
// Actions
// -------------------------------------------------------------

export function addToast(type: 'success' | 'warning' | 'error' | 'info', text: string) {
  const id = Math.random().toString(36).substring(2, 9);
  toastMessages.set([...toastMessages.get(), { id, type, text }]);
  
  // Auto dismiss after 4 seconds
  setTimeout(() => {
    toastMessages.set(toastMessages.get().filter(t => t.id !== id));
  }, 4000);
}

export function selectProject(projectId: string) {
  const detail = loadProjectDetailFromStorage(projectId);
  activeProjectState.set(detail);
}

export function createProject(name: string, description: string): string {
  const list = projects.get();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `proj-${Date.now()}`;
  
  // Check duplication
  const exists = list.some(p => p.id === id);
  const finalId = exists ? `${id}-${Date.now().toString().slice(-4)}` : id;

  const newProject: Project = {
    id: finalId,
    name,
    description: description || 'No description provided.',
    createdAt: new Date().toISOString(),
    membersCount: 1,
    updatedText: 'Draft',
    status: 'draft'
  };

  const updatedList = [newProject, ...list];
  projects.set(updatedList);
  saveProjectsToStorage(updatedList);

  // Initialize and seed details in localStorage
  const detail = seedProjectDetail(finalId);
  detail.currentPlan.title = `Project Plan — ${name}`;
  detail.currentPlan.phases = [
    {
      title: 'Phase 1 — Inception',
      timeframe: 'Day 1–3',
      tasks: [
        { id: 't_init_1', title: 'Kickoff meeting and scope alignment', owner: '@you', due: 'Day 1' }
      ]
    }
  ];
  detail.planHistory = [JSON.parse(JSON.stringify(detail.currentPlan))];
  detail.pendingChanges = [];
  detail.messages = [
    {
      id: 'm_welcome',
      senderName: 'AI Planner',
      senderInitials: 'AI',
      isAI: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: `Welcome to ${name}! I've initialized an empty plan. Talk to your team and upload files to expand this plan.`
    }
  ];
  
  saveProjectDetailToStorage(finalId, detail);
  addToast('success', 'Project created successfully!');
  
  return finalId;
}

export function sendMessage(content: string) {
  const detail = activeProjectState.get();
  if (!detail) return;

  const newMessage: ChatMessage = {
    id: `m_${Date.now()}`,
    senderName: 'You',
    senderInitials: 'YO',
    isAI: false,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    content
  };

  const updatedMessages = [...detail.messages, newMessage];
  const newState = { ...detail, messages: updatedMessages };
  
  activeProjectState.set(newState);
  saveProjectDetailToStorage(detail.projectId, newState);

  // If AI permissions permit, simulate the AI Agent Pipeline
  if (detail.aiPermissions.analyzeConversations) {
    triggerAIPipeline(content);
  }
}

export function uploadFile(name: string, size: string) {
  const detail = activeProjectState.get();
  if (!detail) return;

  const ext = name.split('.').pop()?.toUpperCase() || 'Doc';
  const newFile: UploadedFile = {
    id: `f_${Date.now()}`,
    name,
    size,
    type: ext,
    uploadedAt: 'Just now'
  };

  const newState = {
    ...detail,
    files: [...detail.files, newFile]
  };

  activeProjectState.set(newState);
  saveProjectDetailToStorage(detail.projectId, newState);
  addToast('success', `${name} uploaded successfully!`);

  // Simulate AI PM responding to files
  setTimeout(() => {
    triggerAIPipeline(`[Uploaded File: ${name}]`);
  }, 1000);
}

export function triggerAIPipeline(userText?: string) {
  const detail = activeProjectState.get();
  if (!detail) return;

  // Step 1: MONITOR Agent Active
  updateAgentStatus('MONITOR', 'active');
  
  setTimeout(() => {
    // MONITOR complete, ANALYZER active
    updateAgentStatus('MONITOR', 'complete');
    updateAgentStatus('ANALYZER', 'active');

    // Add a panel suggestion dynamically
    const isFile = !!userText?.includes('[Uploaded File:');
    const gapText = (isFile && userText)
      ? `Found new dependencies in file: "${userText.replace('[Uploaded File: ', '').replace(']', '')}"`
      : `Extracted action items related to: "${userText || 'discussion'}"`;
    
    const changeId = `ch_${Date.now()}`;
    
    const newPanelSuggestion: AIPanelSuggestion = {
      id: `ps_${changeId}`,
      type: isFile ? 'INSIGHT' : 'GAP',
      content: gapText
    };

    setTimeout(() => {
      // ANALYZER complete, PLANNER active
      updateAgentStatus('ANALYZER', 'complete');
      updateAgentStatus('PLANNER', 'active');

      // PLANNER proposes plan changes
      const proposalText = isFile
        ? `I've analyzed the document. Recommend adding architectural reviews to Phase 1.`
        : `Based on your request, I propose adding a new deliverable checklist.`;

      const newChange: PendingChange = {
        id: changeId,
        type: 'ADD_TASK',
        taskTitle: isFile ? 'Architectural Review & Signoff' : 'Deploy staging environment',
        detail: isFile ? 'Add to Phase 1. Due Day 3. Owner: @jan' : 'Add to Phase 2. Due Jun 20. Owner: @ryu',
        phaseIndex: isFile ? 0 : 1,
        due: isFile ? 'Day 3' : 'Jun 20',
        owner: isFile ? '@jan' : '@ryu'
      };

      const newAIMessage: ChatMessage = {
        id: `m_ai_${Date.now()}`,
        senderName: 'AI Suggestion',
        senderInitials: 'AI',
        isAI: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: proposalText,
        aiSuggestion: {
          id: changeId,
          title: 'AI Plan Change Propose',
          content: `${newChange.taskTitle} (${newChange.detail})`,
          status: 'pending'
        }
      };

      const current = activeProjectState.get();
      if (current) {
        const nextState: ProjectDetailState = {
          ...current,
          messages: [...current.messages, newAIMessage],
          pendingChanges: [...current.pendingChanges, newChange],
          panelSuggestions: [newPanelSuggestion, ...current.panelSuggestions],
          agentStatus: { ...current.agentStatus, PLANNER: 'complete', MONITOR: 'idle', ANALYZER: 'idle' }
        };
        activeProjectState.set(nextState);
        saveProjectDetailToStorage(current.projectId, nextState);
        addToast('info', 'AI proposed plan modifications.');
      }
    }, 1500);
  }, 1200);
}

function updateAgentStatus(agent: keyof AgentStatus, status: AgentStatus[keyof AgentStatus]) {
  const detail = activeProjectState.get();
  if (!detail) return;
  const nextState = {
    ...detail,
    agentStatus: {
      ...detail.agentStatus,
      [agent]: status
    }
  };
  activeProjectState.set(nextState);
  saveProjectDetailToStorage(detail.projectId, nextState);
}

export function acceptChange(changeId: string) {
  const detail = activeProjectState.get();
  if (!detail) return;

  const change = detail.pendingChanges.find(c => c.id === changeId);
  if (!change) return;

  // Run UPDATER agent
  updateAgentStatus('UPDATER', 'active');

  setTimeout(() => {
    const current = activeProjectState.get();
    if (!current) return;

    // Apply change to plan
    const updatedPlan = JSON.parse(JSON.stringify(current.currentPlan)) as ProjectPlan;
    const phase = updatedPlan.phases[change.phaseIndex];
    if (phase) {
      phase.tasks.push({
        id: `t_${Date.now()}`,
        title: change.taskTitle,
        owner: change.owner,
        due: change.due,
        isNew: true
      });
    }

    // Capture history
    const history = [
      JSON.parse(JSON.stringify(updatedPlan)),
      ...current.planHistory
    ].slice(0, 3);

    // Update message status
    const messages = current.messages.map(msg => {
      if (msg.aiSuggestion && msg.aiSuggestion.id === changeId) {
        return {
          ...msg,
          aiSuggestion: {
            ...msg.aiSuggestion,
            status: 'accepted' as const
          }
        };
      }
      return msg;
    });

    const nextState: ProjectDetailState = {
      ...current,
      currentPlan: updatedPlan,
      planHistory: history,
      pendingChanges: current.pendingChanges.filter(c => c.id !== changeId),
      messages,
      agentStatus: { ...current.agentStatus, UPDATER: 'complete' }
    };

    activeProjectState.set(nextState);
    saveProjectDetailToStorage(current.projectId, nextState);
    addToast('success', 'Plan change approved and applied.');

    // Clear complete state after 2s
    setTimeout(() => {
      const live = activeProjectState.get();
      if (live) {
        activeProjectState.set({
          ...live,
          agentStatus: { ...live.agentStatus, UPDATER: 'idle' }
        });
      }
    }, 2000);
  }, 1000);
}

export function rejectChange(changeId: string) {
  const detail = activeProjectState.get();
  if (!detail) return;

  // Update message status
  const messages = detail.messages.map(msg => {
    if (msg.aiSuggestion && msg.aiSuggestion.id === changeId) {
      return {
        ...msg,
        aiSuggestion: {
          ...msg.aiSuggestion,
          status: 'rejected' as const
        }
      };
    }
    return msg;
  });

  const nextState: ProjectDetailState = {
    ...detail,
    pendingChanges: detail.pendingChanges.filter(c => c.id !== changeId),
    messages
  };

  activeProjectState.set(nextState);
  saveProjectDetailToStorage(detail.projectId, nextState);
  addToast('warning', 'Plan change rejected.');
}

export function acceptAllChanges() {
  const detail = activeProjectState.get();
  if (!detail || detail.pendingChanges.length === 0) return;

  updateAgentStatus('UPDATER', 'active');

  setTimeout(() => {
    const current = activeProjectState.get();
    if (!current) return;

    const updatedPlan = JSON.parse(JSON.stringify(current.currentPlan)) as ProjectPlan;
    
    current.pendingChanges.forEach(change => {
      const phase = updatedPlan.phases[change.phaseIndex];
      if (phase) {
        phase.tasks.push({
          id: `t_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          title: change.taskTitle,
          owner: change.owner,
          due: change.due,
          isNew: true
        });
      }
    });

    const history = [
      JSON.parse(JSON.stringify(updatedPlan)),
      ...current.planHistory
    ].slice(0, 3);

    // Update suggestions status
    const messages = current.messages.map(msg => {
      if (msg.aiSuggestion && current.pendingChanges.some(c => c.id === msg.aiSuggestion?.id)) {
        return {
          ...msg,
          aiSuggestion: {
            ...msg.aiSuggestion,
            status: 'accepted' as const
          }
        };
      }
      return msg;
    });

    const nextState: ProjectDetailState = {
      ...current,
      currentPlan: updatedPlan,
      planHistory: history,
      pendingChanges: [],
      messages,
      agentStatus: { ...current.agentStatus, UPDATER: 'complete' }
    };

    activeProjectState.set(nextState);
    saveProjectDetailToStorage(current.projectId, nextState);
    addToast('success', 'Approved and applied all proposed plan changes.');

    setTimeout(() => {
      const live = activeProjectState.get();
      if (live) {
        activeProjectState.set({
          ...live,
          agentStatus: { ...live.agentStatus, UPDATER: 'idle' }
        });
      }
    }, 2000);
  }, 1200);
}

export function revertPlan() {
  const detail = activeProjectState.get();
  if (!detail) return;
  if (detail.revertsRemaining <= 0) {
    addToast('error', 'Revert limit reached! Max 3 reverts allowed.');
    return;
  }
  if (detail.planHistory.length <= 1) {
    addToast('warning', 'No older version of the plan exists.');
    return;
  }

  // Pop the top (current) history and revert to previous
  const nextHistory = detail.planHistory.slice(1);
  const previousPlan = nextHistory[0];

  const nextState: ProjectDetailState = {
    ...detail,
    currentPlan: previousPlan,
    planHistory: nextHistory,
    revertsRemaining: detail.revertsRemaining - 1
  };

  activeProjectState.set(nextState);
  saveProjectDetailToStorage(detail.projectId, nextState);
  addToast('success', `Plan reverted. Reverts remaining: ${detail.revertsRemaining - 1}`);
}

export function finalizePlan() {
  const detail = activeProjectState.get();
  if (!detail) return;

  const nextState: ProjectDetailState = {
    ...detail,
    finalizedAt: new Date().toLocaleDateString()
  };

  activeProjectState.set(nextState);
  saveProjectDetailToStorage(detail.projectId, nextState);
  addToast('success', 'Plan finalized. All members notified.');
}

export function savePermissions(perms: AIPermissions) {
  const detail = activeProjectState.get();
  if (!detail) return;

  const nextState: ProjectDetailState = {
    ...detail,
    aiPermissions: perms
  };

  activeProjectState.set(nextState);
  saveProjectDetailToStorage(detail.projectId, nextState);
  addToast('success', 'Settings saved');
}

export function updateTeammateRole(id: string, role: Teammate['role']) {
  const detail = activeProjectState.get();
  if (!detail) return;

  const teammates = detail.teammates.map(t => {
    if (t.id === id) {
      return { ...t, role };
    }
    return t;
  });

  const nextState = { ...detail, teammates };
  activeProjectState.set(nextState);
  saveProjectDetailToStorage(detail.projectId, nextState);
  addToast('success', `Updated user role to ${role}`);
}

export function addTeammate(name: string, email: string, role: Teammate['role']) {
  const detail = activeProjectState.get();
  if (!detail) return;

  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const newTeammate: Teammate = {
    id: `u_${Date.now()}`,
    name,
    initials: initials || 'TM',
    role
  };

  const nextState = {
    ...detail,
    teammates: [...detail.teammates, newTeammate]
  };

  activeProjectState.set(nextState);
  saveProjectDetailToStorage(detail.projectId, nextState);
  addToast('success', `Invited ${name} as ${role}!`);
}

export function addMCPServer(name: string, url: string) {
  const detail = activeProjectState.get();
  if (!detail) return;

  const newServer: MCPServer = {
    name,
    url,
    status: 'Connected'
  };

  const nextState = {
    ...detail,
    mcpServers: [...detail.mcpServers, newServer]
  };

  activeProjectState.set(nextState);
  saveProjectDetailToStorage(detail.projectId, nextState);
  addToast('success', `Connected tool server: ${name}`);
}

export function removeMCPServer(name: string) {
  const detail = activeProjectState.get();
  if (!detail) return;

  const nextState = {
    ...detail,
    mcpServers: detail.mcpServers.filter(s => s.name !== name)
  };

  activeProjectState.set(nextState);
  saveProjectDetailToStorage(detail.projectId, nextState);
  addToast('warning', `Disconnected tool server: ${name}`);
}
