// src/components/islands/features/PlanView.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
  Check,
  ArrowRight,
  Info,
  X,
  Plus,
  Trash2,
  Edit2,
  MoreHorizontal,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Upload,
  User,
  Activity
} from 'lucide-react';
import { useStore } from '@nanostores/react';
import {
  addToast,
  projectMembersByProject,
  ensureProjectMembersLoaded,
  getProjectMembers,
  sessionId
} from '../../../stores/projectStore';
import { QueryProvider } from '../providers/QueryProvider';
import { Modal } from '../ui/Modal';

// --- Type Definitions ---
interface FileAttachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
  sizeBytes: number;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

interface GapItem {
  id: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  relatedTaskId?: string;
  sourceMessageIds: string[];
  sourceExcerpt?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  owner?: string;
  ownerUserId?: string;
  due?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  originalPriority?: 'critical' | 'high' | 'medium' | 'low';
  status: 'proposed' | 'accepted' | 'rejected' | 'gap';
  attachments: FileAttachment[];
  sourceMessageIds: string[];
  sourceExcerpt?: string;
  confidence: 'high' | 'medium' | 'low';
  isNew?: boolean;
  isModified?: boolean;
  isRemoved?: boolean;
}

interface Phase {
  id: string;
  title: string;
  goal: string;
  timeframe: string;
  tasks: Task[];
  gaps: GapItem[];
}

interface Stakeholder {
  userId: string;
  name: string;
  role: string;
  initials: string;
}

interface RiskItem {
  id: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  mitigation?: string;
  sourceMessageIds?: string[];
  sourceExcerpt?: string;
}

interface StructuredPlan {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'draft' | 'pending_review' | 'finalized' | 'reverted';
  version: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  objectives: string[];
  stakeholders: Stakeholder[];
  phases: Phase[];
  globalRisks: RiskItem[];
}

interface ProposedChange {
  id: string;
  action: 'add' | 'update' | 'remove';
  section: 'tasks' | 'phases' | 'gaps' | 'risks';
  targetId: string;
  title: string;
  detail: string;
  confidence?: 'high' | 'medium' | 'low';
  sourceQuote: string;
}

interface PlanViewProps {
  projectId: string;
}

// --- Formatting Helpers ---
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// --- Mock Data Templates ---
const MOCK_STAKEHOLDERS: Stakeholder[] = [
  { userId: 'u1', name: 'Jan Doe', role: 'Tech Lead', initials: 'JD' },
  { userId: 'u2', name: 'Ryu Lee', role: 'Designer', initials: 'RY' },
  { userId: 'u3', name: 'Sam K.', role: 'QA', initials: 'SK' }
];

const createInitialHistory = (projectId: string): StructuredPlan[] => {
  // Only one version (pending review / active draft)
  const v1: StructuredPlan = {
    id: `v1-${projectId}`,
    projectId,
    title: 'Runway Q3 Launch',
    description: 'AI-generated plan based on 3 days of team discussion.',
    status: 'pending_review',
    version: 1,
    createdAt: '2026-06-14T09:00:00Z',
    updatedAt: '2026-06-17T16:45:00Z',
    objectives: [
      'Launch redesigned checkout flow before Q3 ends',
      'Reduce checkout drop-off rate by 15%',
      'Pass WCAG AA accessibility audit'
    ],
    stakeholders: [...MOCK_STAKEHOLDERS],
    phases: [
      {
        id: 'p1',
        title: 'Phase 1 — Foundation',
        goal: 'Set up the technical foundation for the project.',
        timeframe: 'Day 1–2',
        tasks: [
          {
            id: 't1',
            title: 'Define product requirements',
            description: 'Define the full requirements for the redesigned checkout flow: user stories, API contract, and acceptance criteria aligned with the Q3 goal.',
            acceptanceCriteria: [
              'PRD document shared with the team',
              'API contract reviewed by @ryu',
              'Acceptance criteria signed off by @jan'
            ],
            owner: '@jan',
            ownerUserId: 'u1',
            due: 'Jun 14',
            priority: 'high',
            status: 'accepted',
            attachments: [
              { id: 'f1', name: 'design-brief.pdf', type: 'document', sizeBytes: 2516582, url: '#', uploadedBy: 'Jan Doe', uploadedAt: 'Jun 12' },
              { id: 'f2', name: 'wireframes.fig', type: 'other', sizeBytes: 14680064, url: '#', uploadedBy: 'Ryu Lee', uploadedAt: 'Jun 12' }
            ],
            sourceMessageIds: ['m1'],
            sourceExcerpt: "Let's make sure we document the API before we build anything.",
            confidence: 'high'
          },
          {
            id: 't2',
            title: 'Deploy staging environment',
            description: 'Deploy a staging environment connected to the test database for the checkout flow demonstration.',
            acceptanceCriteria: [
              'CI/CD pipeline configured for automated deploy to staging',
              'Verify database credentials are encrypted and stored in Doppler'
            ],
            owner: '@ryu',
            ownerUserId: 'u2',
            due: 'Jun 15',
            priority: 'high',
            status: 'proposed',
            isNew: true,
            attachments: [],
            sourceMessageIds: ['m2'],
            sourceExcerpt: 'we need a staging env before the demo',
            confidence: 'high'
          }
        ],
        gaps: [
          {
            id: 'g1',
            description: "No deployment timeline defined for Phase 2. The team discussed 'we'll figure out staging later' — a concrete date must be set before Phase 1 ends.",
            severity: 'critical',
            sourceMessageIds: ['m4'],
            sourceExcerpt: "We'll figure out staging later."
          }
        ]
      },
      {
        id: 'p2',
        title: 'Phase 2 — API & Integration',
        goal: 'Integrate core services and payment APIs.',
        timeframe: 'Day 3–4',
        tasks: [
          {
            id: 't3',
            title: 'API integration',
            description: 'Integrate checkout services with the third-party payment gateway API.',
            acceptanceCriteria: [
              'API endpoints return consistent envelope format',
              'Support webhook events for payment success and failure'
            ],
            owner: '@jan',
            ownerUserId: 'u1',
            due: 'Jun 16',
            priority: 'high',
            originalPriority: 'low',
            status: 'proposed',
            isModified: true,
            attachments: [],
            sourceMessageIds: ['m3'],
            sourceExcerpt: 'this is now the main blocker',
            confidence: 'medium'
          },
          {
            id: 't4',
            title: 'Write test suite',
            description: 'Write unit and integration tests to ensure checkout API reliability.',
            acceptanceCriteria: [
              'Achieve 80%+ code coverage for checkout service logic'
            ],
            owner: '—',
            due: 'Jun 17',
            priority: 'medium',
            status: 'gap',
            attachments: [],
            sourceMessageIds: ['m5'],
            sourceExcerpt: "Let's make sure we have robust coverage before final deployment",
            confidence: 'medium'
          },
          {
            id: 't5',
            title: 'Migrate legacy data',
            description: 'Migrate older order databases to the new schema.',
            acceptanceCriteria: [
              'Migrate 100% of orders from last 12 months'
            ],
            owner: '@sam',
            ownerUserId: 'u3',
            due: 'Jun 17',
            priority: 'low',
            status: 'proposed',
            isRemoved: true,
            attachments: [],
            sourceMessageIds: ['m6'],
            sourceExcerpt: "we should migrate old tables as part of the launch",
            confidence: 'high'
          }
        ],
        gaps: []
      }
    ],
    globalRisks: [
      {
        id: 'r1',
        description: 'No fallback if the external payment API goes down during launch week.',
        severity: 'critical',
        mitigation: 'mock the API for staging; build a retry circuit.'
      },
      {
        id: 'r2',
        description: 'Context window limits may degrade AI plan quality on conversations longer than ~100 messages.',
        severity: 'major',
        mitigation: 'rolling summaries + project memory.'
      },
      {
        id: 'r3',
        description: 'Two team members share the same timezone, which may slow async review cycles.',
        severity: 'minor',
        mitigation: 'set async review SLA of 4 hours.'
      }
    ]
  };

  return [v1];
};

const INITIAL_CHANGES: ProposedChange[] = [
  {
    id: 'c1',
    action: 'add',
    section: 'tasks',
    targetId: 't2',
    title: 'Deploy staging environment',
    detail: 'Phase 1 · Owner @ryu · Due Jun 15',
    sourceQuote: '"we need a staging env before the demo" — @ryu, Jun 13'
  },
  {
    id: 'c2',
    action: 'update',
    section: 'tasks',
    targetId: 't3',
    title: 'API integration',
    detail: 'Priority changed: Low → High · Owner @jan',
    sourceQuote: '"this is now the main blocker" — @jan, Jun 13'
  },
  {
    id: 'c3',
    action: 'remove',
    section: 'tasks',
    targetId: 't5',
    title: 'Migrate legacy data',
    detail: 'Phase 2 · Owner @sam · Due Jun 17',
    sourceQuote: '"do we really need this for MVP? Let\'s push it out" — @jan, Jun 14'
  }
];

// --- Inner PlanView component ---
const PlanViewInner: React.FC<PlanViewProps> = ({ projectId }) => {
  // --- States ---
  const teammates = useStore(projectMembersByProject)[projectId] || getProjectMembers(projectId);
  const activeSessionId = useStore(sessionId);

  useEffect(() => {
    void ensureProjectMembersLoaded(projectId);
  }, [projectId]);

  const currentUserMember = teammates.find(t => t.sessionId === activeSessionId);
  const isApprover = currentUserMember ? currentUserMember.role === 'APPROVER' : true;
  const [planHistory, setPlanHistory] = useState<StructuredPlan[]>([]);
  const [activePlanIndex, setActivePlanIndex] = useState(0); // Start at v1
  const [pendingChanges, setPendingChanges] = useState<ProposedChange[]>([]);
  const [revertsRemaining, setRevertsRemaining] = useState<number>(3);

  // Modal dialog toggles
  const [isRevertOpen, setIsRevertOpen] = useState(false);
  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false);
  const [deletePhaseTarget, setDeletePhaseTarget] = useState<{ id: string; title: string; count: number } | null>(null);

  // UI Interactive States
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);

  // Manual Add Form states
  const [isAddingPhase, setIsAddingPhase] = useState(false);
  const [newPhaseForm, setNewPhaseForm] = useState({ title: '', goal: '', timeframe: '' });

  const [addingTaskPhaseId, setAddingTaskPhaseId] = useState<string | null>(null);
  const [newTaskForm, setNewTaskForm] = useState({ title: '', owner: '', due: '', priority: 'medium' as any });

  const [isAddingRisk, setIsAddingRisk] = useState(false);
  const [newRiskForm, setNewRiskForm] = useState({ description: '', severity: 'minor' as any, mitigation: '' });

  const [isAddingStakeholder, setIsAddingStakeholder] = useState(false);
  const [newStakeholderForm, setNewStakeholderForm] = useState({ name: '', role: '', initials: '' });

  // Field Edit States (Click to Edit)
  const [editingField, setEditingField] = useState<{
    type: string;
    id?: string;
    index?: number;
    subIndex?: number;
    field?: string;
    value: string;
    subValue?: string; // used for fields with two text values like risks
  } | null>(null);

  // Gap Notices confirmation popups (to avoid standard confirmation alerts)
  const [gapDismissConfirmId, setGapDismissConfirmId] = useState<string | null>(null);
  const [taskDeleteConfirmId, setTaskDeleteConfirmId] = useState<string | null>(null);

  // Dropdown menu state
  const [activePhaseMenuId, setActivePhaseMenuId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load Initial Data
  useEffect(() => {
    setPlanHistory(createInitialHistory(projectId));
    setPendingChanges(INITIAL_CHANGES);
    setRevertsRemaining(3);
    setActivePlanIndex(0); // index 0 is v1
    setExpandedTaskId(null);
    setIsReviewDrawerOpen(false);
  }, [projectId]);

  // Click outside phase menu handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActivePhaseMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const activePlan = planHistory[activePlanIndex];
  if (!activePlan) {
    return (
      <div className="flex-grow flex items-center justify-center bg-background text-text-muted text-sm py-16">
        Loading project plan...
      </div>
    );
  }

  const isLatestVersion = activePlanIndex === planHistory.length - 1;
  const showReviewPanel = isApprover && isLatestVersion && activePlan.status !== 'finalized';

  // Calculate gaps count for controls bar (only gaps that aren't dismissed)
  const currentGapCount = activePlan.phases.reduce((sum, phase) => {
    const taskGaps = phase.tasks.filter(t => t.status === 'gap').length;
    const phaseGaps = phase.gaps.length;
    return sum + taskGaps + phaseGaps;
  }, 0);

  // --- Handlers for Review Panel Action ---
  const applyChangeState = (changeId: string, accept: boolean) => {
    const change = pendingChanges.find(c => c.id === changeId);
    if (!change) return;

    // Mutate state in a clean immutable React way
    setPlanHistory(prevHistory => {
      const updatedHistory = [...prevHistory];
      const plan = { ...updatedHistory[activePlanIndex] };
      plan.phases = plan.phases.map(phase => {
        const updatedPhase = { ...phase };

        if (change.section === 'tasks') {
          if (change.action === 'add') {
            if (accept) {
              // Mark task as accepted and remove proposed flag
              updatedPhase.tasks = updatedPhase.tasks.map(t =>
                t.id === change.targetId ? { ...t, status: 'accepted', isNew: false } : t
              );
            } else {
              // Reject addition -> remove task completely
              updatedPhase.tasks = updatedPhase.tasks.filter(t => t.id !== change.targetId);
            }
          } else if (change.action === 'update') {
            updatedPhase.tasks = updatedPhase.tasks.map(t => {
              if (t.id === change.targetId) {
                if (accept) {
                  // Keep priority high (it is already updated in draft state), clear modified flag
                  return { ...t, isModified: false, originalPriority: undefined };
                } else {
                  // Reject update -> revert priority back to original
                  return { ...t, isModified: false, priority: t.originalPriority || t.priority, originalPriority: undefined };
                }
              }
              return t;
            });
          } else if (change.action === 'remove') {
            if (accept) {
              // Accept removal -> remove task completely
              updatedPhase.tasks = updatedPhase.tasks.filter(t => t.id !== change.targetId);
            } else {
              // Reject removal -> restore task to accepted (clear isRemoved)
              updatedPhase.tasks = updatedPhase.tasks.map(t =>
                t.id === change.targetId ? { ...t, status: 'accepted', isRemoved: false } : t
              );
            }
          }
        }
        return updatedPhase;
      });

      updatedPlanMeta(plan);
      updatedHistory[activePlanIndex] = plan;
      return updatedHistory;
    });

    // Remove change card
    setPendingChanges(prev => prev.filter(c => c.id !== changeId));
    addToast('success', `Proposed change ${accept ? 'accepted' : 'rejected'}.`);
  };

  const handleAcceptAll = () => {
    setPlanHistory(prevHistory => {
      const updatedHistory = [...prevHistory];
      const plan = { ...updatedHistory[activePlanIndex] };

      plan.phases = plan.phases.map(phase => {
        const updatedPhase = { ...phase };
        // Process additions & modifications
        updatedPhase.tasks = updatedPhase.tasks
          .filter(t => {
            // Remove tasks accepted for removal
            const removalChange = pendingChanges.find(c => c.targetId === t.id && c.action === 'remove');
            return !removalChange;
          })
          .map(t => {
            const addOrUpdateChange = pendingChanges.find(c => c.targetId === t.id && (c.action === 'add' || c.action === 'update'));
            if (addOrUpdateChange) {
              return { ...t, status: 'accepted', isNew: false, isModified: false, originalPriority: undefined };
            }
            return t;
          });
        return updatedPhase;
      });

      updatedPlanMeta(plan);
      updatedHistory[activePlanIndex] = plan;
      return updatedHistory;
    });

    setPendingChanges([]);
    addToast('success', 'All proposed changes accepted.');
  };

  // Re-calculate plan timestamps
  const updatedPlanMeta = (plan: StructuredPlan) => {
    plan.updatedAt = new Date().toISOString();
  };

  // --- Manual Actions: Revert, Finalize ---
  const handleRevertConfirm = () => {
    if (revertsRemaining <= 0) {
      addToast('error', 'Revert limit reached! Max 3 reverts allowed.');
      setIsRevertOpen(false);
      return;
    }
    if (planHistory.length <= 1) {
      addToast('warning', 'No older version of the plan exists.');
      setIsRevertOpen(false);
      return;
    }

    // Restore version 1 as current version, but keeping version indexing correct
    setPlanHistory(prev => {
      const v1Copy = JSON.parse(JSON.stringify(prev[0]));
      v1Copy.version = prev.length + 1;
      v1Copy.status = 'reverted';
      v1Copy.updatedAt = new Date().toISOString();
      return [...prev, v1Copy];
    });

    setRevertsRemaining(prev => prev - 1);
    setIsRevertOpen(false);
    setActivePlanIndex(planHistory.length); // go to the newly created reverted version
    addToast('success', `Plan reverted. Reverts remaining: ${revertsRemaining - 1}`);
  };

  const handleFinalizeConfirm = () => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.status = 'finalized';
      plan.finalizedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      plan.updatedAt = new Date().toISOString();
      updated[activePlanIndex] = plan;
      return updated;
    });
    setIsFinalizeOpen(false);
    addToast('success', 'Plan finalized and synced. All members notified.');
  };

  // --- Inline Edit Committing ---
  const commitFieldEdit = () => {
    if (!editingField) return;
    const { type, id, index, subIndex, value, subValue } = editingField;

    if (value.trim() === '' && type !== 'task-desc' && type !== 'phase-goal' && type !== 'risk-mitigation') {
      addToast('error', 'Title/text field cannot be blank.');
      return;
    }

    setPlanHistory(prev => {
      const updatedHistory = [...prev];
      const plan = { ...updatedHistory[activePlanIndex] };

      if (type === 'plan-title') {
        plan.title = value;
      } else if (type === 'plan-desc') {
        plan.description = value;
      } else if (type === 'objective' && typeof index === 'number') {
        plan.objectives = plan.objectives.map((o, idx) => idx === index ? value : o);
      } else if (type === 'stakeholder' && id) {
        plan.stakeholders = plan.stakeholders.map(s => {
          if (s.userId === id) {
            if (editingField.field === 'name') return { ...s, name: value };
            if (editingField.field === 'role') return { ...s, role: value };
            if (editingField.field === 'initials') return { ...s, initials: value.toUpperCase().slice(0, 2) };
          }
          return s;
        });
      } else if (type === 'phase-title' && id) {
        plan.phases = plan.phases.map(p => p.id === id ? { ...p, title: value } : p);
      } else if (type === 'phase-goal' && id) {
        plan.phases = plan.phases.map(p => p.id === id ? { ...p, goal: value } : p);
      } else if (type === 'phase-timeframe' && id) {
        plan.phases = plan.phases.map(p => p.id === id ? { ...p, timeframe: value } : p);
      } else if (type === 'task-title' && id) {
        plan.phases = plan.phases.map(p => ({
          ...p,
          tasks: p.tasks.map(t => t.id === id ? { ...t, title: value } : t)
        }));
      } else if (type === 'task-desc' && id) {
        plan.phases = plan.phases.map(p => ({
          ...p,
          tasks: p.tasks.map(t => t.id === id ? { ...t, description: value } : t)
        }));
      } else if (type === 'task-owner' && id) {
        plan.phases = plan.phases.map(p => ({
          ...p,
          tasks: p.tasks.map(t => t.id === id ? { ...t, owner: value } : t)
        }));
      } else if (type === 'task-due' && id) {
        plan.phases = plan.phases.map(p => ({
          ...p,
          tasks: p.tasks.map(t => t.id === id ? { ...t, due: value } : t)
        }));
      } else if (type === 'task-priority' && id) {
        plan.phases = plan.phases.map(p => ({
          ...p,
          tasks: p.tasks.map(t => t.id === id ? { ...t, priority: value as any } : t)
        }));
      } else if (type === 'task-criteria' && id && typeof index === 'number') {
        plan.phases = plan.phases.map(p => ({
          ...p,
          tasks: p.tasks.map(t => {
            if (t.id === id && t.acceptanceCriteria) {
              const updatedCriteria = [...t.acceptanceCriteria];
              updatedCriteria[index] = value;
              return { ...t, acceptanceCriteria: updatedCriteria };
            }
            return t;
          })
        }));
      } else if (type === 'risk-desc' && id) {
        plan.globalRisks = plan.globalRisks.map(r => r.id === id ? { ...r, description: value } : r);
      } else if (type === 'risk-mitigation' && id) {
        plan.globalRisks = plan.globalRisks.map(r => r.id === id ? { ...r, mitigation: value } : r);
      } else if (type === 'risk-severity' && id) {
        plan.globalRisks = plan.globalRisks.map(r => r.id === id ? { ...r, severity: value as any } : r);
      }

      updatedPlanMeta(plan);
      updatedHistory[activePlanIndex] = plan;
      return updatedHistory;
    });

    setEditingField(null);
    addToast('success', 'Field updated.');
  };

  // --- Manual Actions: Adding Entities ---
  const handleAddPhase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhaseForm.title.trim()) return;

    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      const newPhase: Phase = {
        id: `p-${Math.random().toString(36).slice(2, 9)}`,
        title: newPhaseForm.title,
        goal: newPhaseForm.goal,
        timeframe: newPhaseForm.timeframe || 'TBD',
        tasks: [],
        gaps: []
      };
      plan.phases.push(newPhase);
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });

    setIsAddingPhase(false);
    setNewPhaseForm({ title: '', goal: '', timeframe: '' });
    addToast('success', 'New phase added successfully.');
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskForm.title.trim() || !addingTaskPhaseId) return;

    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.phases = plan.phases.map(p => {
        if (p.id === addingTaskPhaseId) {
          const newTask: Task = {
            id: `t-${Math.random().toString(36).slice(2, 9)}`,
            title: newTaskForm.title,
            owner: newTaskForm.owner || '—',
            due: newTaskForm.due || 'TBD',
            priority: newTaskForm.priority,
            status: 'accepted', // Manual adds are direct
            attachments: [],
            sourceMessageIds: [],
            confidence: 'high',
            description: 'Provide context and rationale for this task...',
            acceptanceCriteria: ['Task criteria 1']
          };
          return { ...p, tasks: [...p.tasks, newTask] };
        }
        return p;
      });

      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });

    setAddingTaskPhaseId(null);
    setNewTaskForm({ title: '', owner: '', due: '', priority: 'medium' });
    addToast('success', 'Task created. Click on it to expand and edit details.');
  };

  const handleAddRisk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRiskForm.description.trim()) return;

    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      const newRisk: RiskItem = {
        id: `r-${Math.random().toString(36).slice(2, 9)}`,
        description: newRiskForm.description,
        severity: newRiskForm.severity,
        mitigation: newRiskForm.mitigation || undefined,
        sourceMessageIds: []
      };
      plan.globalRisks.push(newRisk);
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });

    setIsAddingRisk(false);
    setNewRiskForm({ description: '', severity: 'minor', mitigation: '' });
    addToast('success', 'New risk item created.');
  };

  const handleAddStakeholder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStakeholderForm.name.trim() || !newStakeholderForm.role.trim()) return;

    const initials = newStakeholderForm.initials.trim() ||
      newStakeholderForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      const newStk: Stakeholder = {
        userId: `u-${Math.random().toString(36).slice(2, 9)}`,
        name: newStakeholderForm.name,
        role: newStakeholderForm.role,
        initials
      };
      plan.stakeholders.push(newStk);
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });

    setIsAddingStakeholder(false);
    setNewStakeholderForm({ name: '', role: '', initials: '' });
    addToast('success', 'Team member added.');
  };

  // --- Deletion Actions ---
  const handleRemoveObjective = (index: number) => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.objectives = plan.objectives.filter((_, idx) => idx !== index);
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });
    addToast('success', 'Objective removed.');
  };

  const handleAddObjectiveBullet = () => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.objectives.push('New objective bullet...');
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });
    addToast('success', 'Objective bullet added. Click to edit.');
  };

  const handleDeleteStakeholder = (userId: string) => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.stakeholders = plan.stakeholders.filter(s => s.userId !== userId);
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });
    addToast('success', 'Team member removed.');
  };

  const handleDeletePhase = (phaseId: string) => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.phases = plan.phases.filter(p => p.id !== phaseId);
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });
    setDeletePhaseTarget(null);
    addToast('success', 'Phase and all tasks inside deleted.');
  };

  const handleDeleteTask = (taskId: string) => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.phases = plan.phases.map(p => ({
        ...p,
        tasks: p.tasks.filter(t => t.id !== taskId)
      }));
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });
    setTaskDeleteConfirmId(null);
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
    }
    addToast('success', 'Task deleted.');
  };

  const handleDeleteRisk = (riskId: string) => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.globalRisks = plan.globalRisks.filter(r => r.id !== riskId);
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });
    addToast('success', 'Risk item deleted.');
  };

  const handleDismissGap = (phaseId: string, gapId: string) => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.phases = plan.phases.map(p => {
        if (p.id === phaseId) {
          return { ...p, gaps: p.gaps.filter(g => g.id !== gapId) };
        }
        return p;
      });
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });
    setGapDismissConfirmId(null);
    addToast('success', 'Gap notice dismissed.');
  };

  // --- Task Detail Specific Controls ---
  const handleAddCriteria = (taskId: string) => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.phases = plan.phases.map(p => ({
        ...p,
        tasks: p.tasks.map(t => {
          if (t.id === taskId) {
            const currentCriteria = t.acceptanceCriteria || [];
            return { ...t, acceptanceCriteria: [...currentCriteria, 'New acceptance criterion...'] };
          }
          return t;
        })
      }));
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });
    addToast('success', 'Acceptance criterion added.');
  };

  const handleRemoveCriteria = (taskId: string, criteriaIndex: number) => {
    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.phases = plan.phases.map(p => ({
        ...p,
        tasks: p.tasks.map(t => {
          if (t.id === taskId && t.acceptanceCriteria) {
            return {
              ...t,
              acceptanceCriteria: t.acceptanceCriteria.filter((_, idx) => idx !== criteriaIndex)
            };
          }
          return t;
        })
      }));
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });
    addToast('success', 'Acceptance criterion removed.');
  };

  const handleSimulateAttachFile = (taskId: string) => {
    const fileNames = ['api-spec-v2.json', 'user-journey-map.png', 'checkout-styles.css', 'test-plan.md'];
    const selectedName = fileNames[Math.floor(Math.random() * fileNames.length)];
    const extensionsMap: Record<string, 'image' | 'document' | 'other'> = {
      'api-spec-v2.json': 'document',
      'user-journey-map.png': 'image',
      'checkout-styles.css': 'other',
      'test-plan.md': 'document'
    };

    const newAttachment: FileAttachment = {
      id: `f-${Math.random().toString(36).slice(2, 9)}`,
      name: selectedName,
      type: extensionsMap[selectedName] || 'other',
      sizeBytes: Math.floor(Math.random() * 5000000) + 100000,
      url: '#',
      uploadedBy: 'Jan Doe',
      uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };

    setPlanHistory(prev => {
      const updated = [...prev];
      const plan = { ...updated[activePlanIndex] };
      plan.phases = plan.phases.map(p => ({
        ...p,
        tasks: p.tasks.map(t => {
          if (t.id === taskId) {
            return { ...t, attachments: [...t.attachments, newAttachment] };
          }
          return t;
        })
      }));
      updatedPlanMeta(plan);
      updated[activePlanIndex] = plan;
      return updated;
    });

    addToast('success', `File "${selectedName}" attached successfully.`);
  };

  // --- Render Inline Edit Component Helper ---
  const renderEditableText = (
    text: string,
    type: string,
    id?: string,
    index?: number,
    field?: string,
    isTextArea = false,
    className = "",
    placeholder = "Click to enter text..."
  ) => {
    const isEditing =
      editingField &&
      editingField.type === type &&
      editingField.id === id &&
      editingField.index === index &&
      editingField.field === field;

    if (!isApprover) {
      return (
        <span className={`${className} ${!text ? 'italic text-text-muted text-xs' : ''}`}>
          {text || placeholder}
        </span>
      );
    }

    if (isEditing) {
      return (
        <div className="flex items-center gap-2 w-full select-text z-10" onClick={(e) => e.stopPropagation()}>
          {isTextArea ? (
            <textarea
              className="w-full bg-background border border-border rounded-md p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary min-h-[80px]"
              value={editingField.value}
              onChange={(e) => setEditingField({ ...editingField, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  commitFieldEdit();
                } else if (e.key === 'Escape') {
                  setEditingField(null);
                }
              }}
              autoFocus
            />
          ) : (
            <input
              type="text"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              value={editingField.value}
              onChange={(e) => setEditingField({ ...editingField, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitFieldEdit();
                } else if (e.key === 'Escape') {
                  setEditingField(null);
                }
              }}
              autoFocus
            />
          )}
          <div className="flex flex-col sm:flex-row gap-1">
            <button
              onClick={commitFieldEdit}
              className="p-1.5 bg-success/20 text-success hover:bg-success hover:text-text-inverse rounded transition-colors"
              title="Save (Enter)"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setEditingField(null)}
              className="p-1.5 bg-surface-raised border border-border text-text-muted hover:text-text-primary rounded transition-colors"
              title="Cancel (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`group relative flex items-center gap-1.5 cursor-pointer rounded-sm hover:bg-surface-raised/40 px-1 py-0.5 -mx-1 transition-colors ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          setEditingField({ type, id, index, field, value: text });
        }}
      >
        <span className={!text ? 'italic text-text-muted text-xs' : ''}>
          {text || placeholder}
        </span>
        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary transition-opacity shrink-0 ml-1" />
      </div>
    );
  };

  return (
    <div className="flex-grow flex flex-col bg-background h-[calc(100vh-112px)] overflow-hidden font-body select-none">

      {/* Main Content Layout */}
      <div className="flex-grow flex flex-col lg:flex-row relative overflow-hidden lg:p-4 lg:gap-4">

        {/* Timeline Column (Center/Left) */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-border lg:border-0 lg:rounded-xl lg:overflow-hidden bg-surface relative overflow-hidden shadow-sm">

          {/* Plan Controls Bar */}
          {isApprover ? (
            <div className="h-[52px] px-8 bg-surface border-b border-border-subtle flex items-center justify-between shrink-0">

              {/* Version Selector */}
              <div className="flex items-center gap-3">
                <button
                  disabled={activePlanIndex <= 0}
                  onClick={() => {
                    setActivePlanIndex(prev => prev - 1);
                    setExpandedTaskId(null);
                  }}
                  className="btn-ghost p-1 h-8 w-8 rounded-md disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center border border-border-subtle hover:border-border"
                  title="Previous Version"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-text-primary font-semibold select-text">
                  Version {activePlan.version} of {planHistory.length}
                </span>
                <button
                  disabled={activePlanIndex >= planHistory.length - 1}
                  onClick={() => {
                    setActivePlanIndex(prev => prev + 1);
                    setExpandedTaskId(null);
                  }}
                  className="btn-ghost p-1 h-8 w-8 rounded-md disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center border border-border-subtle hover:border-border"
                  title="Newer Version"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Center/Right Action Badges / Controls */}
              <div className="flex items-center gap-3">
                {currentGapCount > 0 && isLatestVersion && activePlan.status !== 'finalized' && (
                  <span className="category-badge badge--editor text-xs py-1 px-3 flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{currentGapCount} gaps flagged</span>
                  </span>
                )}

                {/* Revert Trigger */}
                <button
                  onClick={() => setIsRevertOpen(true)}
                  disabled={revertsRemaining <= 0 || planHistory.length <= 1 || !isLatestVersion}
                  className="btn-secondary py-1 px-3.5 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert</span>
                </button>

                {/* Finalize Trigger */}
                <button
                  onClick={() => setIsFinalizeOpen(true)}
                  disabled={activePlan.status === 'finalized' || !isLatestVersion}
                  className="btn-primary py-1 px-3.5 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {activePlan.status === 'finalized' ? (
                    <>
                      <span>Finalized</span>
                      <Check className="w-3.5 h-3.5 text-success" />
                    </>
                  ) : (
                    <>
                      <span>Finalize & Sync</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>

                {/* Review Toggle for Tablet/Mobile */}
                {pendingChanges.length > 0 && isLatestVersion && activePlan.status !== 'finalized' && (
                  <button
                    onClick={() => setIsReviewDrawerOpen(true)}
                    className="lg:hidden flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-text-inverse text-xs font-bold"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Review ({pendingChanges.length})</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Read Only view notice for Viewer */
            <div className="bg-primary-muted/20 border-b border-primary/20 px-8 py-3 flex items-center shrink-0">
              <div className="flex items-center gap-3">
                <Info className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-semibold text-text-primary tracking-wide">
                  This plan was finalized on {activePlan.finalizedAt || 'Jun 12'}. Comment via chat.
                </span>
              </div>
            </div>
          )}

          {/* Timeline Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-12 flex justify-center">
            <div className="max-w-[760px] w-full flex flex-col gap-8">

              {/* 3.1 Plan Header */}
              <div className="flex flex-col gap-3 select-text">
                <span className="section-label uppercase tracking-widest text-text-muted text-xs">
                  Project Plan
                </span>

                {renderEditableText(
                  activePlan.title,
                  'plan-title',
                  undefined,
                  undefined,
                  undefined,
                  false,
                  "text-display-sm font-bold text-text-primary tracking-tight md:text-3xl"
                )}

                {renderEditableText(
                  activePlan.description,
                  'plan-desc',
                  undefined,
                  undefined,
                  undefined,
                  true,
                  "text-sm text-text-secondary leading-relaxed"
                )}

                {/* Meta chip row */}
                <div className="flex flex-wrap gap-2 mt-2 select-none">
                  <span className="category-badge badge--viewer text-xs py-0.5 px-2 font-semibold bg-surface-raised text-text-muted">
                    Jun 12
                  </span>
                  <span className="category-badge badge--viewer text-xs py-0.5 px-2 font-semibold bg-surface-raised text-text-muted">
                    v{activePlan.version} of {planHistory.length}
                  </span>

                  {activePlan.status === 'pending_review' && (
                    <span className="category-badge text-xs py-0.5 px-2 font-semibold bg-warning/10 text-warning border border-warning/20">
                      Pending Review
                    </span>
                  )}
                  {activePlan.status === 'finalized' && (
                    <span className="category-badge text-xs py-0.5 px-2 font-semibold bg-success/10 text-success border border-success/20">
                      Finalized
                    </span>
                  )}
                  {activePlan.status === 'draft' && (
                    <span className="category-badge text-xs py-0.5 px-2 font-semibold bg-text-muted/10 text-text-muted border border-text-muted/20">
                      Draft
                    </span>
                  )}
                  {activePlan.status === 'reverted' && (
                    <span className="category-badge text-xs py-0.5 px-2 font-semibold bg-text-muted/10 text-text-muted border border-text-muted/20">
                      Reverted
                    </span>
                  )}
                </div>
              </div>

              <hr className="border-border-subtle" />

              {/* 3.2 Overview Section */}
              <div className="flex flex-col gap-6 select-text">
                <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                  <span className="section-label uppercase tracking-widest text-text-muted text-xs">
                    Overview
                  </span>
                </div>

                {/* Objectives */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest text-text-muted font-bold">
                      Objectives
                    </span>
                    {isApprover && (
                      <button
                        onClick={handleAddObjectiveBullet}
                        className="text-[11px] text-primary hover:text-primary-hover flex items-center gap-1 font-semibold"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Objective</span>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 pl-1">
                    {activePlan.objectives.map((obj, idx) => (
                      <div key={idx} className="group/obj flex items-start gap-2.5">
                        <div className="flex-grow">
                          {renderEditableText(obj, 'objective', undefined, idx, undefined, false, "text-sm text-text-secondary")}
                        </div>
                        {isApprover && (
                          <button
                            onClick={() => handleRemoveObjective(idx)}
                            className="opacity-0 group-hover/obj:opacity-100 text-text-muted hover:text-error transition-all p-0.5"
                            title="Remove objective"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {activePlan.objectives.length === 0 && (
                      <span className="text-xs text-text-muted italic">No objectives defined.</span>
                    )}
                  </div>
                </div>

                {/* Stakeholder Team */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest text-text-muted font-bold">
                      Team
                    </span>
                    {isApprover && (
                      <button
                        onClick={() => setIsAddingStakeholder(true)}
                        className="text-[11px] text-primary hover:text-primary-hover flex items-center gap-1 font-semibold"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Member</span>
                      </button>
                    )}
                  </div>

                  {/* Inline Stakeholder Add Form */}
                  {isAddingStakeholder && (
                    <form onSubmit={handleAddStakeholder} className="bg-surface border border-border p-4 rounded-xl flex flex-col gap-3 mb-2 select-text" onClick={(e) => e.stopPropagation()}>
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest">New Team Member</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Name *</label>
                          <input
                            type="text"
                            placeholder="e.g. Sam K."
                            className="bg-background border border-border rounded-md p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            value={newStakeholderForm.name}
                            onChange={(e) => setNewStakeholderForm({ ...newStakeholderForm, name: e.target.value })}
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Role *</label>
                          <input
                            type="text"
                            placeholder="e.g. QA"
                            className="bg-background border border-border rounded-md p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            value={newStakeholderForm.role}
                            onChange={(e) => setNewStakeholderForm({ ...newStakeholderForm, role: e.target.value })}
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Initials (optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. SK"
                            maxLength={2}
                            className="bg-background border border-border rounded-md p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            value={newStakeholderForm.initials}
                            onChange={(e) => setNewStakeholderForm({ ...newStakeholderForm, initials: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setIsAddingStakeholder(false)}
                          className="btn-secondary py-1 px-3 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn-primary py-1 px-3 text-xs"
                          disabled={!newStakeholderForm.name.trim() || !newStakeholderForm.role.trim()}
                        >
                          Add Member
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="flex flex-col gap-3 pl-1">
                    {activePlan.stakeholders.map(stk => (
                      <div key={stk.userId} className="group/stk flex items-center justify-between hover:bg-surface-raised/20 p-1 rounded-lg transition-colors">
                        <div className="flex items-center gap-3">
                          {/* Avatar Circle */}
                          <div className="w-8 h-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-semibold text-text-primary select-none shadow-sm font-mono uppercase tracking-tighter">
                            {renderEditableText(stk.initials, 'stakeholder', stk.userId, undefined, 'initials', false, "text-text-primary")}
                          </div>
                          <div>
                            {renderEditableText(stk.name, 'stakeholder', stk.userId, undefined, 'name', false, "text-sm font-semibold text-text-primary")}
                            {renderEditableText(stk.role, 'stakeholder', stk.userId, undefined, 'role', false, "text-xs text-text-muted")}
                          </div>
                        </div>

                        {isApprover && (
                          <button
                            onClick={() => handleDeleteStakeholder(stk.userId)}
                            className="opacity-0 group-hover/stk:opacity-100 text-text-muted hover:text-error transition-all p-1"
                            title="Remove stakeholder"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {activePlan.stakeholders.length === 0 && (
                      <span className="text-xs text-text-muted italic">No team members assigned.</span>
                    )}
                  </div>
                </div>
              </div>

              <hr className="border-border-subtle" />

              {/* 3.3 Timeline Phases */}
              <div className="flex flex-col gap-10 select-text">
                {activePlan.phases.map((phase: Phase, pIdx: number) => {
                  const hasStandaloneGaps = phase.gaps && phase.gaps.length > 0;
                  const isMenuOpen = activePhaseMenuId === phase.id;

                  return (
                    <div key={phase.id} className="flex flex-col gap-5 relative">

                      {/* Phase Header */}
                      <div className="flex items-start justify-between group/phase">
                        <div className="flex-1 flex flex-col gap-1.5">
                          <div className="flex items-center gap-3">
                            {renderEditableText(
                              phase.title,
                              'phase-title',
                              phase.id,
                              undefined,
                              undefined,
                              false,
                              "text-lg font-bold text-text-primary tracking-tight"
                            )}

                            {renderEditableText(
                              phase.timeframe,
                              'phase-timeframe',
                              phase.id,
                              undefined,
                              undefined,
                              false,
                              "category-badge badge--viewer text-[11px] py-0.5 px-2 font-semibold bg-surface-raised border border-border"
                            )}
                          </div>

                          {renderEditableText(
                            phase.goal,
                            'phase-goal',
                            phase.id,
                            undefined,
                            undefined,
                            false,
                            "text-sm text-text-secondary italic"
                          )}
                        </div>

                        {/* Phase Overflow Menu (Approver Only) */}
                        {isApprover && (
                          <div className="relative" ref={dropdownRef}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePhaseMenuId(isMenuOpen ? null : phase.id);
                              }}
                              className="opacity-0 group-hover/phase:opacity-100 text-text-muted hover:text-text-primary transition-opacity p-1.5 hover:bg-surface-raised rounded"
                              title="Phase options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {isMenuOpen && (
                              <div className="absolute right-0 mt-1 w-44 bg-surface-raised border border-border rounded shadow-xl z-20 overflow-hidden font-semibold py-1">
                                <button
                                  onClick={() => {
                                    setEditingField({ type: 'phase-title', id: phase.id, value: phase.title });
                                    setActivePhaseMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-primary-muted transition-colors flex items-center gap-2"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-primary" />
                                  <span>Rename Title</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingField({ type: 'phase-goal', id: phase.id, value: phase.goal });
                                    setActivePhaseMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-primary-muted transition-colors flex items-center gap-2"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-primary" />
                                  <span>Edit Goal</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingField({ type: 'phase-timeframe', id: phase.id, value: phase.timeframe });
                                    setActivePhaseMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-primary-muted transition-colors flex items-center gap-2"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-primary" />
                                  <span>Edit Timeframe</span>
                                </button>
                                <hr className="border-border-subtle my-1" />
                                <button
                                  onClick={() => {
                                    setDeletePhaseTarget({ id: phase.id, title: phase.title, count: phase.tasks.length });
                                    setActivePhaseMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs text-error hover:bg-error/10 transition-colors flex items-center gap-2"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-error" />
                                  <span>Delete Phase</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Inner dashed divider */}
                      <hr className="border-t border-dashed border-border-subtle" />

                      {/* 3.4 Tasks in Phase */}
                      <div className="flex flex-col gap-4 pl-6 ml-3 select-none">
                        {phase.tasks.map((task: Task, tIdx: number) => {
                          const stepNum = String(tIdx + 1).padStart(2, '0');
                          const isExpanded = expandedTaskId === task.id;

                          // Left Border & Bg matrix styles based on status
                          let rowStyle = 'border-l-2 border-transparent hover:bg-surface-raised/40';
                          let badge = null;

                          if (task.isRemoved) {
                            rowStyle = 'border-l-2 border-transparent bg-error/5 opacity-50 hover:bg-error/10';
                            badge = (
                              <span className="category-badge text-[9px] py-0.5 px-1.5 font-bold bg-error/10 text-error border border-error/20">
                                ✕ Removed
                              </span>
                            );
                          } else if (task.isNew) {
                            rowStyle = 'border-l-2 border-transparent bg-primary-muted/10 hover:bg-primary-muted/20';
                            badge = (
                              <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">
                                NEW
                              </span>
                            );
                          } else if (task.isModified) {
                            rowStyle = 'border-l-2 border-transparent bg-primary-muted/10 hover:bg-primary-muted/20';
                            badge = (
                              <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">
                                UPDATED
                              </span>
                            );
                          } else if (task.status === 'gap') {
                            rowStyle = 'border-l-2 border-transparent bg-warning/5 hover:bg-warning/10';
                            badge = (
                              <span className="text-warning text-xs font-semibold flex items-center gap-1 shrink-0 select-none">
                                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                                <span>⚠ Missing Owner</span>
                              </span>
                            );
                          } else if (task.status === 'rejected') {
                            rowStyle = 'border-l-2 border-transparent hover:bg-surface-raised/40 opacity-40';
                            badge = (
                              <span className="category-badge text-[9px] py-0.5 px-1.5 font-bold bg-error/10 text-error border border-error/20">
                                ✕ Rejected
                              </span>
                            );
                          }

                          // Priority Dot selector mapping
                          const dotColorMap = {
                            critical: 'bg-error',
                            high: 'bg-warning',
                            medium: 'bg-primary',
                            low: 'bg-text-muted'
                          };
                          const dotClass = dotColorMap[task.priority] || 'bg-text-muted';

                          // Task Delete Confirmation state
                          const isDeleteConfirming = taskDeleteConfirmId === task.id;

                          return (
                            <div key={task.id} className="flex flex-col gap-2">
                              {/* Task Row Header */}
                              <div
                                onClick={() => {
                                  if (!isDeleteConfirming) {
                                    setExpandedTaskId(isExpanded ? null : task.id);
                                  }
                                }}
                                className={`flex items-start gap-4 transition-all duration-200 p-2 -mx-2 rounded-xl cursor-pointer group/task-row ${rowStyle} ${isExpanded ? 'bg-surface-raised/30' : ''}`}
                              >
                                {/* Step number */}
                                <span className="font-mono text-xs text-text-muted mt-1 select-none w-6 text-right shrink-0">
                                  {stepNum}
                                </span>

                                <div className="flex-grow min-w-0 select-text" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="font-bold text-text-primary text-sm tracking-tight truncate max-w-full">
                                      {renderEditableText(
                                        task.title,
                                        'task-title',
                                        task.id,
                                        undefined,
                                        undefined,
                                        false,
                                        task.isRemoved || task.status === 'rejected' ? 'line-through text-text-muted opacity-75' : ''
                                      )}
                                    </div>
                                    {badge}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-text-muted select-none">
                                    <span>Owner:</span>
                                    {renderEditableText(task.owner || '—', 'task-owner', task.id, undefined, undefined, false, "font-semibold text-text-secondary")}
                                    <span>·</span>
                                    <span>Due:</span>
                                    {renderEditableText(task.due || '—', 'task-due', task.id, undefined, undefined, false, "font-semibold text-text-secondary")}
                                    <span>·</span>

                                    {/* Priority Dot & text */}
                                    <div className="flex items-center gap-1.5 font-semibold text-text-secondary select-none">
                                      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                                      {isApprover ? (
                                        <select
                                          className="bg-transparent text-xs text-text-secondary font-semibold focus:outline-none border-b border-transparent hover:border-text-muted cursor-pointer pr-1"
                                          value={task.priority}
                                          onChange={(e) => {
                                            const val = e.target.value as any;
                                            setPlanHistory(prev => {
                                              const updated = [...prev];
                                              const plan = { ...updated[activePlanIndex] };
                                              plan.phases = plan.phases.map(p => ({
                                                ...p,
                                                tasks: p.tasks.map(t => t.id === task.id ? { ...t, priority: val } : t)
                                              }));
                                              updatedPlanMeta(plan);
                                              updated[activePlanIndex] = plan;
                                              return updated;
                                            });
                                            addToast('success', `Priority changed to ${val}.`);
                                          }}
                                        >
                                          <option value="critical" className="bg-surface text-error">Critical</option>
                                          <option value="high" className="bg-surface text-warning">High</option>
                                          <option value="medium" className="bg-surface text-primary">Medium</option>
                                          <option value="low" className="bg-surface text-text-muted">Low</option>
                                        </select>
                                      ) : (
                                        <span className="capitalize">{task.priority}</span>
                                      )}
                                    </div>
                                    {task.isModified && task.originalPriority && (
                                      <span className="text-text-muted text-[10px] italic">
                                        (original: {task.originalPriority})
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Row Controls (Expand indicators / Inline delete) */}
                                <div className="flex items-center gap-2 select-none shrink-0" onClick={(e) => e.stopPropagation()}>
                                  {isApprover && !isDeleteConfirming && (
                                    <button
                                      onClick={() => setTaskDeleteConfirmId(task.id)}
                                      className="opacity-0 group-hover/task-row:opacity-100 text-text-muted hover:text-error transition-all p-1"
                                      title="Delete task"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  <button
                                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                    className="text-text-muted hover:text-text-primary text-[10px] transition-colors font-mono"
                                  >
                                    {isExpanded ? '[▲ Hide]' : <span className="opacity-0 group-hover/task-row:opacity-100 font-mono">[▼ Expand]</span>}
                                  </button>
                                </div>
                              </div>

                              {/* Task Deletion Confirmation Inline Box */}
                              {isDeleteConfirming && (
                                <div className="bg-error/5 border border-error/20 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ml-10 select-text" onClick={(e) => e.stopPropagation()}>
                                  <span className="font-semibold text-text-primary">
                                    Delete &quot;{task.title}&quot;? This cannot be undone.
                                  </span>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setTaskDeleteConfirmId(null)}
                                      className="btn-secondary py-1 px-3 text-[10px]"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTask(task.id)}
                                      className="btn-primary bg-error text-text-inverse hover:bg-error/80 py-1 px-3 text-[10px] font-bold"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* 3.5 Task Detail (Inline Expanded Card) */}
                              {isExpanded && !isDeleteConfirming && (
                                <div
                                  className="bg-surface-raised/20 border border-border-subtle rounded-xl p-5 ml-10 flex flex-col gap-4 fade-up select-text"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* Description section */}
                                  <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
                                      Description
                                    </label>
                                    {renderEditableText(
                                      task.description || '',
                                      'task-desc',
                                      task.id,
                                      undefined,
                                      undefined,
                                      true,
                                      "text-sm text-text-secondary leading-relaxed",
                                      "Click to add task description and context..."
                                    )}
                                  </div>

                                  {/* Acceptance Criteria (DONE WHEN) */}
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
                                        Done When
                                      </label>
                                      {isApprover && (
                                        <button
                                          onClick={() => handleAddCriteria(task.id)}
                                          className="text-[10px] text-primary hover:text-primary-hover flex items-center gap-0.5 font-bold"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>Add Criterion</span>
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-2 pl-1">
                                      {task.acceptanceCriteria && task.acceptanceCriteria.map((cri, cIdx) => (
                                        <div key={cIdx} className="group/cri flex items-start gap-2">
                                          <div className="flex-grow">
                                            {renderEditableText(
                                              cri,
                                              'task-criteria',
                                              task.id,
                                              cIdx,
                                              undefined,
                                              false,
                                              "text-sm text-text-secondary"
                                            )}
                                          </div>
                                          {isApprover && (
                                            <button
                                              onClick={() => handleRemoveCriteria(task.id, cIdx)}
                                              className="opacity-0 group-hover/cri:opacity-100 text-text-muted hover:text-error transition-all p-0.5"
                                              title="Remove criterion"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                      {(!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) && (
                                        <span className="text-xs text-text-muted italic">No criteria defined.</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Attachments Section */}
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
                                        Attachments
                                      </label>
                                      {isApprover && (
                                        <button
                                          onClick={() => handleSimulateAttachFile(task.id)}
                                          className="text-[10px] text-primary hover:text-primary-hover flex items-center gap-1 font-semibold"
                                        >
                                          <Upload className="w-3 h-3" />
                                          <span>Attach File</span>
                                        </button>
                                      )}
                                    </div>

                                    <div className="flex flex-col gap-2">
                                      {task.attachments.map(file => (
                                        <div
                                          key={file.id}
                                          className="flex items-center justify-between p-2 rounded-xl border border-border bg-surface hover:bg-primary-muted/10 transition-colors"
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <FileText className="w-4 h-4 text-text-muted shrink-0" />
                                            <div className="truncate">
                                              <div className="text-xs font-medium text-text-primary truncate">
                                                {file.name}
                                              </div>
                                              <div className="text-[10px] text-text-muted">
                                                {file.type.toUpperCase()} · {formatBytes(file.sizeBytes)} · By {file.uploadedBy}
                                              </div>
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => addToast('info', `Downloading/previewing ${file.name}...`)}
                                            className="btn-ghost py-0.5 px-2 text-[10px] text-primary hover:bg-primary/15 font-semibold shrink-0"
                                          >
                                            Preview
                                          </button>
                                        </div>
                                      ))}

                                      {task.attachments.length === 0 && (
                                        <span className="text-xs text-text-muted italic pl-1">No attachments.</span>
                                      )}

                                      <div className="flex justify-end mt-1 select-none">
                                        <a
                                          href={`/project/${projectId}/chat`}
                                          className="text-[10px] font-semibold text-text-muted hover:text-text-primary flex items-center gap-0.5 transition-colors"
                                        >
                                          <span>View All Project Files</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Source Quote block */}
                                  {task.sourceExcerpt && (
                                    <div className="flex flex-col gap-1 mt-1 bg-surface-raised/40 p-3 rounded-xl border border-border-subtle">
                                      <label className="text-[9px] text-text-muted uppercase tracking-widest font-bold">
                                        Source
                                      </label>
                                      <blockquote className="text-xs text-text-muted italic pl-2 border-l border-primary/40 select-text">
                                        &quot;{task.sourceExcerpt}&quot;
                                      </blockquote>
                                      <span className="text-[10px] text-text-muted/80 self-end mt-1">
                                        — from Chat trace
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* + Add Task Ghost row at the bottom of task list */}
                        {isApprover && addingTaskPhaseId !== phase.id && (
                          <button
                            onClick={() => {
                              setAddingTaskPhaseId(phase.id);
                              setNewTaskForm({ title: '', owner: '', due: '', priority: 'medium' });
                            }}
                            className="flex items-center gap-2 p-2 -mx-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-raised/20 border border-dashed border-border-subtle hover:border-text-muted transition-all text-xs font-semibold cursor-pointer w-full text-left justify-start"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Task</span>
                          </button>
                        )}

                        {/* Inline Task Add Mini Form */}
                        {isApprover && addingTaskPhaseId === phase.id && (
                          <form
                            onSubmit={handleAddTask}
                            className="bg-surface border border-border p-4 rounded-xl flex flex-col gap-3 ml-2 select-text"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest">New Task</h4>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Task Title *</label>
                              <input
                                type="text"
                                placeholder="e.g. Write unit tests for checkout flow"
                                className="bg-background border border-border rounded-md p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary w-full"
                                value={newTaskForm.title}
                                onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                                required
                                autoFocus
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Owner</label>
                                <input
                                  type="text"
                                  placeholder="@mention or name"
                                  className="bg-background border border-border rounded-md p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                  value={newTaskForm.owner}
                                  onChange={(e) => setNewTaskForm({ ...newTaskForm, owner: e.target.value })}
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Due Date</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Jun 18 or Day 3"
                                  className="bg-background border border-border rounded-md p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                  value={newTaskForm.due}
                                  onChange={(e) => setNewTaskForm({ ...newTaskForm, due: e.target.value })}
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Priority</label>
                                <select
                                  className="bg-background border border-border rounded-md p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary font-semibold"
                                  value={newTaskForm.priority}
                                  onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value as any })}
                                >
                                  <option value="critical">Critical</option>
                                  <option value="high">High</option>
                                  <option value="medium">Medium</option>
                                  <option value="low">Low</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => setAddingTaskPhaseId(null)}
                                className="btn-secondary py-1 px-3 text-xs"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="btn-primary py-1 px-3 text-xs"
                                disabled={!newTaskForm.title.trim()}
                              >
                                Add Task
                              </button>
                            </div>
                          </form>
                        )}

                        {phase.tasks.length === 0 && !addingTaskPhaseId && (
                          <div className="text-xs text-text-muted italic pl-2 select-text">
                            No tasks in this phase. Add a task to get started.
                          </div>
                        )}
                      </div>

                      {/* 3.8 Gap Notice (inline within a Phase, standalone gaps) */}
                      {hasStandaloneGaps && phase.gaps.map((gap: GapItem) => {
                        // Severity styling matrix
                        let cardBorder = 'rgba(125,141,131,0.40)';
                        let cardBg = 'rgba(125,141,131,0.04)';
                        let labelColor = 'text-text-muted';

                        if (gap.severity === 'critical') {
                          cardBorder = 'rgba(231,76,60,0.40)';
                          cardBg = 'rgba(231,76,60,0.06)';
                          labelColor = 'text-error';
                        } else if (gap.severity === 'major') {
                          cardBorder = 'rgba(243,156,18,0.40)';
                          cardBg = 'rgba(243,156,18,0.06)';
                          labelColor = 'text-warning';
                        }

                        const isConfirming = gapDismissConfirmId === gap.id;

                        return (
                          <div
                            key={gap.id}
                            style={{
                              border: `1px solid ${cardBorder}`,
                              backgroundColor: cardBg
                            }}
                            className="rounded-xl p-4 mt-5 relative group/gap select-text ml-6 transition-all duration-200"
                          >
                            <div className="flex items-center justify-between">
                              <div className={`text-xs font-bold tracking-widest uppercase flex items-center gap-1.5 ${labelColor}`}>
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{gap.severity} Gap Flagged</span>
                              </div>

                              {isApprover && !isConfirming && (
                                <button
                                  onClick={() => setGapDismissConfirmId(gap.id)}
                                  className="opacity-0 group-hover/gap:opacity-100 text-text-muted hover:text-text-primary transition-opacity p-0.5 rounded"
                                  title="Dismiss gap"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <hr style={{ borderTop: `1px solid ${cardBorder}` }} className="my-2" />

                            <p className="text-sm text-text-secondary leading-relaxed">
                              {gap.description}
                            </p>

                            {gap.sourceExcerpt && (
                              <div className="mt-2 text-xs text-text-muted italic border-l border-text-muted/40 pl-2">
                                &quot;{gap.sourceExcerpt}&quot;
                              </div>
                            )}

                            {/* Dismiss confirmation tooltip inline */}
                            {isConfirming && (
                              <div className="absolute inset-0 bg-background/95 flex items-center justify-center p-3 rounded-xl text-xs select-none">
                                <div className="flex flex-col gap-2 items-center text-center">
                                  <span className="font-semibold text-text-primary">
                                    Dismiss this gap? It may reappear if the issue is not resolved.
                                  </span>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setGapDismissConfirmId(null)}
                                      className="btn-secondary py-0.5 px-2 text-[10px]"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleDismissGap(phase.id, gap.id)}
                                      className="btn-primary bg-warning text-text-inverse hover:bg-warning/80 py-0.5 px-2 text-[10px] font-bold"
                                    >
                                      Dismiss
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Phase-end divider */}
                      <hr className="border-t border-border-subtle mt-4" />
                    </div>
                  );
                })}

                {/* + Add Phase button below last phase block */}
                {isApprover && !isAddingPhase && (
                  <button
                    onClick={() => setIsAddingPhase(true)}
                    className="btn-ghost flex items-center justify-center gap-2 p-4 border border-dashed border-border-subtle rounded-xl hover:border-text-muted text-sm text-text-muted hover:text-text-primary transition-all cursor-pointer w-full text-center"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Phase</span>
                  </button>
                )}

                {/* Add Phase Form */}
                {isAddingPhase && (
                  <form
                    onSubmit={handleAddPhase}
                    className="bg-surface border border-border p-6 rounded-xl flex flex-col gap-4 fade-up select-text shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="border-b border-border-subtle pb-2">
                      <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest">New Phase</h3>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Phase Title *</label>
                      <input
                        type="text"
                        placeholder="e.g. Phase 3 — Testing & Verification"
                        className="bg-background border border-border rounded-md p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary w-full"
                        value={newPhaseForm.title}
                        onChange={(e) => setNewPhaseForm({ ...newPhaseForm, title: e.target.value })}
                        required
                        autoFocus
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Goal (one sentence summary)</label>
                      <input
                        type="text"
                        placeholder="e.g. Conduct thorough security audits and validation testing."
                        className="bg-background border border-border rounded-md p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary w-full"
                        value={newPhaseForm.goal}
                        onChange={(e) => setNewPhaseForm({ ...newPhaseForm, goal: e.target.value })}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Timeframe (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Day 5–6"
                        className="bg-background border border-border rounded-md p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary w-full"
                        value={newPhaseForm.timeframe}
                        onChange={(e) => setNewPhaseForm({ ...newPhaseForm, timeframe: e.target.value })}
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingPhase(false)}
                        className="btn-secondary text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-primary text-xs"
                        disabled={!newPhaseForm.title.trim()}
                      >
                        Add Phase
                      </button>
                    </div>
                  </form>
                )}

                {activePlan.phases.length === 0 && !isAddingPhase && (
                  /* 7. No Plan generated empty state */
                  <div className="flex flex-col items-center justify-center text-center p-12 bg-surface border border-border rounded-xl">
                    <Sparkles className="w-10 h-10 text-text-muted mb-4" />
                    <h2 className="text-lg font-bold text-text-primary mb-2">No plan generated yet</h2>
                    <p className="text-sm text-text-secondary max-w-[400px] mb-6 leading-relaxed">
                      Start chatting with your team — the AI will generate a structured plan from your discussions.
                    </p>
                    <a href={`/project/${projectId}/chat`} className="btn-primary flex items-center gap-2">
                      <span>Go to Chat</span>
                    </a>
                  </div>
                )}
              </div>

              {/* 3.9 Risk Summary Block */}
              {(activePlan.status === 'finalized' || isApprover) && (
                <div className="flex flex-col gap-6 mt-16 select-text">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="section-label uppercase tracking-widest text-text-muted text-xs">
                      Risks & Flags
                    </span>
                    {isApprover && (
                      <button
                        onClick={() => setIsAddingRisk(prev => !prev)}
                        className="text-[11px] text-primary hover:text-primary-hover flex items-center gap-1 font-semibold select-none"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Risk</span>
                      </button>
                    )}
                  </div>

                  {/* Add Risk Form inline */}
                  {isAddingRisk && (
                    <form onSubmit={handleAddRisk} className="bg-surface border border-border p-5 rounded-xl flex flex-col gap-4 mb-2 select-text" onClick={(e) => e.stopPropagation()}>
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-1.5">New Risk Flag</h4>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Description *</label>
                        <textarea
                          placeholder="Describe the risk flag..."
                          className="bg-background border border-border rounded-md p-3 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
                          value={newRiskForm.description}
                          onChange={(e) => setNewRiskForm({ ...newRiskForm, description: e.target.value })}
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Severity</label>
                          <select
                            className="bg-background border border-border rounded-md p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary font-semibold"
                            value={newRiskForm.severity}
                            onChange={(e) => setNewRiskForm({ ...newRiskForm, severity: e.target.value as any })}
                          >
                            <option value="critical">Critical</option>
                            <option value="major">Major</option>
                            <option value="minor">Minor</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Mitigation (optional)</label>
                          <input
                            type="text"
                            placeholder="Describe how to mitigate..."
                            className="bg-background border border-border rounded-md p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            value={newRiskForm.mitigation}
                            onChange={(e) => setNewRiskForm({ ...newRiskForm, mitigation: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsAddingRisk(false)}
                          className="btn-secondary py-1 px-3 text-xs select-none"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn-primary py-1 px-3 text-xs select-none"
                          disabled={!newRiskForm.description.trim()}
                        >
                          Create Flag
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Risks List */}
                  <div className="flex flex-col gap-6 pl-1">
                    {activePlan.globalRisks.map((risk) => {
                      // Severity colors map
                      const dotClassMap = {
                        critical: 'bg-error',
                        major: 'bg-warning',
                        minor: 'bg-text-muted'
                      };
                      const dotColor = dotClassMap[risk.severity] || 'bg-text-muted';

                      return (
                        <div key={risk.id} className="group/risk flex flex-col gap-1.5 relative border-l border-border-subtle pl-4 py-0.5">

                          {/* Deletion icon on hover */}
                          {isApprover && (
                            <button
                              onClick={() => handleDeleteRisk(risk.id)}
                              className="absolute top-0 right-0 opacity-0 group-hover/risk:opacity-100 text-text-muted hover:text-error transition-all p-1 hover:bg-surface-raised rounded select-none"
                              title="Delete Risk Flag"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                            {isApprover ? (
                              <select
                                className="bg-transparent text-xs font-bold uppercase tracking-widest focus:outline-none border-b border-transparent hover:border-text-muted cursor-pointer pr-1"
                                style={{
                                  color: risk.severity === 'critical' ? 'var(--color-error)' : risk.severity === 'major' ? 'var(--color-warning)' : 'var(--color-text-muted)'
                                }}
                                value={risk.severity}
                                onChange={(e) => {
                                  const val = e.target.value as any;
                                  setPlanHistory(prev => {
                                    const updated = [...prev];
                                    const plan = { ...updated[activePlanIndex] };
                                    plan.globalRisks = plan.globalRisks.map(r => r.id === risk.id ? { ...r, severity: val } : r);
                                    updatedPlanMeta(plan);
                                    updated[activePlanIndex] = plan;
                                    return updated;
                                  });
                                }}
                              >
                                <option value="critical" className="bg-surface text-error">Critical</option>
                                <option value="major" className="bg-surface text-warning">Major</option>
                                <option value="minor" className="bg-surface text-text-muted">Minor</option>
                              </select>
                            ) : (
                              <span
                                className="text-xs font-bold uppercase tracking-widest shrink-0"
                                style={{
                                  color: risk.severity === 'critical' ? 'var(--color-error)' : risk.severity === 'major' ? 'var(--color-warning)' : 'var(--color-text-muted)'
                                }}
                              >
                                {risk.severity}
                              </span>
                            )}
                          </div>

                          {renderEditableText(
                            risk.description,
                            'risk-desc',
                            risk.id,
                            undefined,
                            undefined,
                            true,
                            "text-sm text-text-secondary leading-relaxed"
                          )}

                          <div className="flex items-center gap-1.5 text-xs text-text-muted select-text mt-1">
                            <span className="font-semibold select-none text-[11px] uppercase tracking-wider">Mitigation:</span>
                            {renderEditableText(
                              risk.mitigation || '',
                              'risk-mitigation',
                              risk.id,
                              undefined,
                              undefined,
                              false,
                              "italic text-text-secondary text-xs",
                              "No mitigation defined. Click to define..."
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {activePlan.globalRisks.length === 0 && (
                      <span className="text-xs text-text-muted italic pl-1">No risk flags registered.</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Review Panel (Right Sidebar, Approver Only) */}
        {showReviewPanel && (
          <div className="hidden lg:flex w-full lg:w-[28%] lg:min-w-[280px] lg:max-w-[340px] border-l border-border lg:border-0 lg:rounded-xl lg:overflow-hidden bg-surface flex-col shrink-0 shadow-sm">
            {/* Review Panel Header */}
            <div className="p-5 border-b border-border-subtle flex flex-col gap-1.5 shrink-0 select-none">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-text-muted font-bold">
                  Pending Changes
                </span>
                <span className="category-badge badge--approver text-[10px] py-0.5 px-2 font-bold">
                  {pendingChanges.length}
                </span>
              </div>
            </div>

            {/* Scrollable list of cards */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {pendingChanges.map(change => {
                // Heading action prefix formatting
                let actionPrefix = 'ADD TASK';
                if (change.action === 'update') {
                  actionPrefix = 'UPDATE PRIORITY';
                } else if (change.action === 'remove') {
                  actionPrefix = 'REMOVE TASK';
                }

                return (
                  <div
                    key={change.id}
                    className="bg-background/50 border border-border rounded-xl p-4 flex flex-col gap-2.5 transition-all select-text"
                  >
                    <div className="flex items-center justify-between select-none">
                      <span className="text-[9px] uppercase tracking-widest font-bold text-primary">
                        {actionPrefix}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-text-primary leading-snug">
                      &quot;{change.title}&quot;
                    </div>

                    <div className="text-[10px] text-text-muted leading-relaxed select-none">
                      {change.detail}
                    </div>

                    {change.sourceQuote && (
                      <div className="text-[10px] text-text-muted italic border-l border-border-subtle pl-2 select-text leading-normal">
                        {change.sourceQuote}
                      </div>
                    )}

                    {/* Accept/Reject individual buttons */}
                    <div className="flex gap-2 mt-1.5 select-none">
                      <button
                        onClick={() => applyChangeState(change.id, true)}
                        className="flex-1 py-1 rounded bg-success/15 hover:bg-success text-success hover:text-text-inverse text-[10px] font-bold transition-all"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => applyChangeState(change.id, false)}
                        className="flex-1 py-1 rounded bg-error/15 hover:bg-error text-error hover:text-text-inverse text-[10px] font-bold transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}

              {pendingChanges.length === 0 && (
                /* Empty state */
                <div className="flex flex-col items-center justify-center text-center p-8 select-none py-20 text-text-muted">
                  <Check className="w-8 h-8 text-success mb-2" />
                  <span className="text-xs font-semibold text-text-primary">Review complete.</span>
                  <span className="text-[10px] mt-1 text-text-muted">No pending changes.</span>
                </div>
              )}
            </div>

            {/* Bottom-anchored Accept All button */}
            {pendingChanges.length > 0 && (
              <div className="p-4 border-t border-border-subtle bg-surface select-none">
                <button
                  onClick={handleAcceptAll}
                  className="w-full btn-primary py-2 text-xs font-bold flex items-center justify-center gap-1.5 shadow"
                >
                  <span>Accept All</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- Modals & Overlays --- */}

      {/* 6.4 Revert Confirmation Modal */}
      <Modal
        isOpen={isRevertOpen}
        onClose={() => setIsRevertOpen(false)}
        title="REVERT PLAN"
        isWarning={true}
      >
        <div className="flex flex-col gap-4 select-text">
          <p className="text-sm leading-relaxed text-text-secondary">
            This will restore Version 1 and permanently remove all comments on the current version. This action cannot be undone.
          </p>
          <p className="text-sm font-semibold text-text-primary">
            You have {revertsRemaining} reverts remaining ({revertsRemaining - 1} after this).
          </p>
          <div className="flex justify-end gap-3 border-t border-border-subtle pt-4 mt-2 select-none">
            <button
              onClick={() => setIsRevertOpen(false)}
              className="btn-secondary py-1.5 px-5 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleRevertConfirm}
              className="btn-primary bg-warning text-text-inverse hover:bg-warning/80 py-1.5 px-5 text-xs font-bold flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Revert to v1</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* 6.5 Finalize & Sync Modal */}
      <Modal
        isOpen={isFinalizeOpen}
        onClose={() => setIsFinalizeOpen(false)}
        title="FINALIZE PLAN"
      >
        <div className="flex flex-col gap-4 select-text">
          <p className="text-sm leading-relaxed text-text-secondary">
            This plan will be synced to all project members. They will be notified and can comment via chat.
          </p>
          <div className="flex justify-end gap-3 border-t border-border-subtle pt-4 mt-2 select-none">
            <button
              onClick={() => setIsFinalizeOpen(false)}
              className="btn-secondary py-1.5 px-5 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleFinalizeConfirm}
              className="btn-primary py-1.5 px-5 text-xs font-bold flex items-center gap-1.5"
            >
              <span>Finalize & Sync</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Modal>

      {/* Phase Delete Modal */}
      <Modal
        isOpen={deletePhaseTarget !== null}
        onClose={() => setDeletePhaseTarget(null)}
        title="DELETE PHASE"
        isWarning={true}
      >
        <div className="flex flex-col gap-4 select-text">
          <p className="text-sm leading-relaxed text-text-secondary">
            &quot;{deletePhaseTarget?.title}&quot; contains {deletePhaseTarget?.count} tasks.
          </p>
          <p className="text-sm text-text-muted">
            Deleting this phase will permanently remove all tasks within it. This cannot be undone.
          </p>
          <div className="flex justify-end gap-3 border-t border-border-subtle pt-4 mt-2 select-none">
            <button
              onClick={() => setDeletePhaseTarget(null)}
              className="btn-secondary py-1.5 px-5 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={() => deletePhaseTarget && handleDeletePhase(deletePhaseTarget.id)}
              className="btn-primary bg-error text-text-inverse hover:bg-error/80 py-1.5 px-5 text-xs font-bold flex items-center gap-1.5"
            >
              <span>Delete Phase</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Drawer Overlay for Review Panel (Mobile/Tablet View) */}
      {isReviewDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end select-none lg:hidden">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setIsReviewDrawerOpen(false)}
          />
          <div className="relative w-80 bg-surface h-full flex flex-col shadow-2xl border-l border-border z-10 pop-in">
            {/* Close Button */}
            <div className="p-4 border-b border-border-subtle flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-text-muted font-bold">
                Review queue ({pendingChanges.length})
              </span>
              <button
                onClick={() => setIsReviewDrawerOpen(false)}
                className="text-text-muted hover:text-text-primary p-1 hover:bg-surface-raised rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Change list */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {pendingChanges.map(change => {
                return (
                  <div
                    key={change.id}
                    className="bg-background/50 border border-border rounded-md p-4 flex flex-col gap-2 select-text"
                  >
                    <div className="flex items-center justify-between select-none">
                      <span className="text-[9px] uppercase tracking-widest font-bold text-primary">
                        ◈ {change.action.toUpperCase()} TASK
                      </span>
                    </div>

                    <div className="text-xs font-bold text-text-primary select-text">
                      &quot;{change.title}&quot;
                    </div>

                    <div className="text-[10px] text-text-muted select-none">
                      {change.detail}
                    </div>

                    {change.sourceQuote && (
                      <div className="text-[10px] text-text-muted italic border-l border-border-subtle pl-2">
                        {change.sourceQuote}
                      </div>
                    )}

                    <div className="flex gap-2 mt-2 select-none">
                      <button
                        onClick={() => applyChangeState(change.id, true)}
                        className="flex-1 py-1 rounded bg-success/15 hover:bg-success text-success hover:text-text-inverse text-[10px] font-bold transition-all"
                      >
                        ✓ Accept
                      </button>
                      <button
                        onClick={() => applyChangeState(change.id, false)}
                        className="flex-1 py-1 rounded bg-error/15 hover:bg-error text-error hover:text-text-inverse text-[10px] font-bold transition-all"
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                );
              })}

              {pendingChanges.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center p-8 py-20 text-text-muted">
                  <Check className="w-8 h-8 text-success mb-2" />
                  <span className="text-xs font-semibold text-text-primary">Review complete.</span>
                </div>
              )}
            </div>

            {/* Accept All bottom action */}
            {pendingChanges.length > 0 && (
              <div className="p-4 border-t border-border-subtle bg-surface select-none">
                <button
                  onClick={() => {
                    handleAcceptAll();
                    setIsReviewDrawerOpen(false);
                  }}
                  className="w-full btn-primary py-2 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <span>✓ Accept All →</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Action Button for Review Drawer on Mobile/Tablet */}
      {pendingChanges.length > 0 && isLatestVersion && activePlan.status !== 'finalized' && isApprover && (
        <button
          onClick={() => setIsReviewDrawerOpen(true)}
          className="fixed bottom-6 right-6 lg:hidden z-40 bg-primary hover:bg-primary-hover text-text-inverse w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 animate-pulse-glow"
          title={`Review ${pendingChanges.length} changes`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 bg-warning text-text-primary font-bold text-[9px] w-5 h-5 rounded-full flex items-center justify-center border border-background shadow">
            {pendingChanges.length}
          </span>
        </button>
      )}

    </div>
  );
};

export const PlanView: React.FC<PlanViewProps> = (props) => {
  return (
    <QueryProvider>
      <PlanViewInner {...props} />
    </QueryProvider>
  );
};

export default PlanView;
