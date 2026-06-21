// src/components/islands/features/PlanView.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Check,
  X,
  Plus,
  Trash2,
  Edit2,
  MoreHorizontal,
  FileText,
  ExternalLink,
  Sparkles,
  Upload
} from 'lucide-react';
import { useStore } from '@nanostores/react';
import {
  addToast,
  projectMembersByProject,
  ensureProjectMembersLoaded,
  getProjectMembers,
  sessionId,
  formatBytes,
  formatDisplayDate,
} from '../../../stores/projectStore';
import type {
  StructuredPlan,
  Phase,
  PhaseAssignedMember,
  Task,
  GapItem,
  RiskItem,
  ProposedChange,
} from '../../../stores/projectStore';
import {
  useProjectPlan,
  usePendingProjectProposal,
  useUpdateProjectPlan,
  useAcceptProjectProposalChange,
  useRejectProjectProposalChange,
  useApproveProjectProposal,
  useCreateProjectPhase,
  useUpdateProjectPhase,
  useDeleteProjectPhase,
  useCreateProjectTask,
  useUpdateProjectTask,
  useDeleteProjectTask,
  useCreateProjectRisk,
  useUpdateProjectRisk,
  useDeleteProjectRisk,
  useDismissProjectGap,
} from '../../../lib/query/projectPlan';
import {
  getProposalPhasePreviewItems,
  getProposalRiskPreviewItems,
  getProposalTaskPreviewItems,
  matchesPhaseTarget,
} from '../../../lib/planProposal';
import { QueryProvider } from '../providers/QueryProvider';
import { Modal } from '../ui/Modal';

// --- Types ---
interface PlanViewProps {
  projectId: string;
}

// --- Constants & Stubs ---
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
    detail: 'Priority changed: Low ? High · Owner @jan',
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
  // --- States & React Query Hooks ---
  const teammates = useStore(projectMembersByProject)[projectId] || getProjectMembers(projectId);
  const activeSessionId = useStore(sessionId);

  useEffect(() => {
    void ensureProjectMembersLoaded(projectId);
  }, [projectId]);

  const currentUserMember = teammates.find(t => t.sessionId === activeSessionId);
  const isApprover = currentUserMember ? currentUserMember.role === 'APPROVER' : true;

  // Query plan data and versions
  const { data: activePlan, isLoading: isPlanLoading } = useProjectPlan(projectId);
  const { data: pendingProposal } = usePendingProjectProposal(projectId);

  // Derived properties
  const showReviewPanel = true;

  // Mutations
  const updateProjectPlanMutation = useUpdateProjectPlan(projectId);
  const acceptProjectProposalChangeMutation = useAcceptProjectProposalChange(projectId);
  const rejectProjectProposalChangeMutation = useRejectProjectProposalChange(projectId);
  const approveProjectProposalMutation = useApproveProjectProposal(projectId);
  const createProjectPhaseMutation = useCreateProjectPhase(projectId);
  const updateProjectPhaseMutation = useUpdateProjectPhase(projectId);
  const deleteProjectPhaseMutation = useDeleteProjectPhase(projectId);
  const createProjectTaskMutation = useCreateProjectTask(projectId);
  const updateProjectTaskMutation = useUpdateProjectTask(projectId);
  const deleteProjectTaskMutation = useDeleteProjectTask(projectId);
  const createProjectRiskMutation = useCreateProjectRisk(projectId);
  const updateProjectRiskMutation = useUpdateProjectRisk(projectId);
  const deleteProjectRiskMutation = useDeleteProjectRisk(projectId);
  const dismissProjectGapMutation = useDismissProjectGap(projectId);

  // Local UI States
  const [deletePhaseTarget, setDeletePhaseTarget] = useState<{ id: string; title: string; count: number } | null>(null);

  // UI Interactive States
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);

  // Manual Add Form states
  const [isAddingPhase, setIsAddingPhase] = useState(false);
  const [newPhaseForm, setNewPhaseForm] = useState({ title: '', goal: '', description: '', timeframe: '' });

  const [addingTaskPhaseId, setAddingTaskPhaseId] = useState<string | null>(null);
  const [newTaskForm, setNewTaskForm] = useState({ title: '', owner: '', due: '', priority: 'medium' as any });

  const [isAddingRisk, setIsAddingRisk] = useState(false);
  const [newRiskForm, setNewRiskForm] = useState({ description: '', severity: 'minor' as any, mitigation: '' });

  // Field Edit States (Click to Edit)
  const [editingField, setEditingField] = useState<{
    type: string;
    id?: string;
    index?: number;
    subIndex?: number;
    field?: string;
    value: string;
    subValue?: string;
  } | null>(null);

  // Gap Notices confirmation popups
  const [gapDismissConfirmId, setGapDismissConfirmId] = useState<string | null>(null);
  const [taskDeleteConfirmId, setTaskDeleteConfirmId] = useState<string | null>(null);

  // Dropdown menu state
  const [activePhaseMenuId, setActivePhaseMenuId] = useState<string | null>(null);
  const [activePhaseAssigneePickerId, setActivePhaseAssigneePickerId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside phase menu handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActivePhaseMenuId(null);
      }
      const target = event.target as HTMLElement | null;
      if (
        activePhaseAssigneePickerId &&
        target &&
        !target.closest('[data-phase-assignee-trigger]') &&
        !target.closest('[data-phase-assignee-popover]')
      ) {
        setActivePhaseAssigneePickerId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activePhaseAssigneePickerId]);

  const pendingChanges: ProposedChange[] = pendingProposal?.changes || [];

  if (isPlanLoading || !activePlan) {
    return (
      <div className="flex-grow flex items-center justify-center bg-background text-text-muted text-sm py-16">
        Loading project plan...
      </div>
    );
  }

  // Calculate gaps count for controls bar (only gaps that aren't dismissed)
  const currentGapCount = activePlan.phases.reduce((sum, phase) => {
    const taskGaps = phase.tasks.filter(t => t.status === 'gap').length;
    const phaseGaps = phase.gaps.length;
    return sum + taskGaps + phaseGaps;
  }, 0);
  const hasNoPlanBody =
    activePlan.objectives.length === 0 &&
    activePlan.technologyStack.length === 0 &&
    activePlan.phases.length === 0 &&
    activePlan.globalRisks.length === 0;

  const persistPlanMeta = async (
    nextValues: Partial<Pick<StructuredPlan, 'title' | 'description' | 'objectives'>>,
    successMessage: string
  ) => {
    try {
      await updateProjectPlanMutation.mutateAsync(nextValues);
      addToast('success', successMessage);
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to update plan.');
    }
  };

  const findTaskById = (taskId: string): { phase: Phase; task: Task } | null => {
    for (const phase of activePlan.phases) {
      const task = phase.tasks.find((item) => item.id === taskId);
      if (task) return { phase, task };
    }
    return null;
  };

  const updatePhaseViaApi = async (
    phaseId: string,
    updates: Partial<Pick<Phase, 'title' | 'goal' | 'description' | 'timeframe' | 'assignedMembers'>>,
    successMessage: string
  ) => {
    const phase = activePlan.phases.find((item) => item.id === phaseId);
    if (!phase) {
      addToast('error', 'Phase not found.');
      return;
    }
    try {
      await updateProjectPhaseMutation.mutateAsync({
        phaseId,
        title: updates.title ?? phase.title,
        goal: updates.goal ?? phase.goal,
        description: updates.description ?? (phase.description || ''),
        timeframe: updates.timeframe ?? phase.timeframe,
        assignedMembers: updates.assignedMembers ?? phase.assignedMembers,
      });
      addToast('success', successMessage);
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to update phase.');
    }
  };

  const togglePhaseAssignedMember = async (phase: Phase, teammate: typeof teammates[number]) => {
    const alreadyAssigned = phase.assignedMembers.some((member) => member.sessionId === teammate.sessionId);
    const nextAssignedMembers: PhaseAssignedMember[] = alreadyAssigned
      ? phase.assignedMembers.filter((member) => member.sessionId !== teammate.sessionId)
      : [
        ...phase.assignedMembers,
        {
          sessionId: teammate.sessionId,
          name: teammate.name,
          initials: teammate.initials,
          role: teammate.role,
        },
      ];
    await updatePhaseViaApi(phase.id, { assignedMembers: nextAssignedMembers }, 'Phase assignments updated.');
  };

  const updateTaskViaApi = async (
    taskId: string,
    updates: Partial<Pick<Task, 'title' | 'description' | 'owner' | 'due' | 'priority' | 'acceptanceCriteria'>>,
    successMessage: string
  ) => {
    const taskContext = findTaskById(taskId);
    if (!taskContext) {
      addToast('error', 'Task not found.');
      return;
    }
    try {
      await updateProjectTaskMutation.mutateAsync({
        phaseId: taskContext.phase.id,
        taskId,
        updates
      });
      addToast('success', successMessage);
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to update task.');
    }
  };

  const updateRiskViaApi = async (
    riskId: string,
    updates: Partial<Pick<RiskItem, 'description' | 'severity' | 'mitigation'>>,
    successMessage: string
  ) => {
    const risk = activePlan.globalRisks.find((item) => item.id === riskId);
    if (!risk) {
      addToast('error', 'Risk not found.');
      return;
    }
    try {
      await updateProjectRiskMutation.mutateAsync({
        riskId,
        updates
      });
      addToast('success', successMessage);
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to update risk.');
    }
  };

  // --- Handlers for Review Panel Action ---
  const applyChangeState = async (changeId: string, accept: boolean) => {
    const change = pendingChanges.find(c => c.id === changeId);
    if (!change) return;
    try {
      if (accept) {
        await acceptProjectProposalChangeMutation.mutateAsync({ changeId });
        addToast('success', `"${change.title}" accepted.`);
      } else {
        await rejectProjectProposalChangeMutation.mutateAsync(changeId);
        addToast('success', `"${change.title}" rejected.`);
      }
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to review change.');
    }
  };

  const handleAcceptAll = async () => {
    if (pendingChanges.length === 0) return;
    try {
      await approveProjectProposalMutation.mutateAsync({
        changeIds: pendingChanges.map((change) => change.id),
      });
      addToast('success', 'All pending changes accepted.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to accept all changes.');
    }
  };

  // --- Inline Edit Committing ---
  const commitFieldEdit = async () => {
    if (!editingField) return;
    const currentEdit = editingField;
    const { type, id, index, subIndex, value, subValue } = currentEdit;

    if (value.trim() === '' && type !== 'task-desc' && type !== 'phase-goal' && type !== 'phase-description' && type !== 'risk-mitigation') {
      addToast('error', 'Title/text field cannot be blank.');
      return;
    }

    // Close the inline editor immediately so optimistic cache updates are visible at once.
    setEditingField(null);

    try {
      if (type === 'plan-title') {
        await persistPlanMeta({ title: value }, 'Field updated.');
      } else if (type === 'plan-desc') {
        await persistPlanMeta({ description: value }, 'Field updated.');
      } else if (type === 'objective' && typeof index === 'number') {
        const nextObjectives = activePlan.objectives.map((objective, objectiveIndex) =>
          objectiveIndex === index ? value : objective
        );
        await persistPlanMeta({ objectives: nextObjectives }, 'Field updated.');
      } else if (type === 'phase-title' && id) {
        const phase = activePlan.phases.find((item) => item.id === id);
        if (!phase) return;
        await updateProjectPhaseMutation.mutateAsync({
          phaseId: id,
          title: value,
          goal: phase.goal,
          description: phase.description || '',
          timeframe: phase.timeframe,
          assignedMembers: phase.assignedMembers,
        });
        addToast('success', 'Field updated.');
      } else if (type === 'phase-goal' && id) {
        const phase = activePlan.phases.find((item) => item.id === id);
        if (!phase) return;
        await updateProjectPhaseMutation.mutateAsync({
          phaseId: id,
          title: phase.title,
          goal: value,
          description: phase.description || '',
          timeframe: phase.timeframe,
          assignedMembers: phase.assignedMembers,
        });
        addToast('success', 'Field updated.');
      } else if (type === 'phase-description' && id) {
        const phase = activePlan.phases.find((item) => item.id === id);
        if (!phase) return;
        await updateProjectPhaseMutation.mutateAsync({
          phaseId: id,
          title: phase.title,
          goal: phase.goal,
          description: value,
          timeframe: phase.timeframe,
          assignedMembers: phase.assignedMembers,
        });
        addToast('success', 'Field updated.');
      } else if (type === 'phase-timeframe' && id) {
        const phase = activePlan.phases.find((item) => item.id === id);
        if (!phase) return;
        await updateProjectPhaseMutation.mutateAsync({
          phaseId: id,
          title: phase.title,
          goal: phase.goal,
          description: phase.description || '',
          timeframe: value,
          assignedMembers: phase.assignedMembers,
        });
        addToast('success', 'Field updated.');
      } else if (type === 'task-title' && id) {
        await updateTaskViaApi(id, { title: value }, 'Field updated.');
      } else if (type === 'task-desc' && id) {
        await updateTaskViaApi(id, { description: value }, 'Field updated.');
      } else if (type === 'task-owner' && id) {
        await updateTaskViaApi(id, { owner: value }, 'Field updated.');
      } else if (type === 'task-due' && id) {
        await updateTaskViaApi(id, { due: value }, 'Field updated.');
      } else if (type === 'task-priority' && id) {
        await updateTaskViaApi(id, { priority: value as Task['priority'] }, 'Field updated.');
      } else if (type === 'task-criteria' && id && typeof index === 'number') {
        const taskContext = findTaskById(id);
        if (!taskContext) return;
        const nextCriteria = [...(taskContext.task.acceptanceCriteria || [])];
        nextCriteria[index] = value;
        await updateTaskViaApi(id, { acceptanceCriteria: nextCriteria }, 'Field updated.');
      } else if (type === 'risk-desc' && id) {
        await updateRiskViaApi(id, { description: value }, 'Field updated.');
      } else if (type === 'risk-mitigation' && id) {
        await updateRiskViaApi(id, { mitigation: value }, 'Field updated.');
      } else if (type === 'risk-severity' && id) {
        await updateRiskViaApi(id, { severity: value as RiskItem['severity'] }, 'Field updated.');
      }
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to update field.');
    }
  };

  // --- Manual Actions: Adding Entities ---
  const handleAddPhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhaseForm.title.trim()) return;
    try {
      await createProjectPhaseMutation.mutateAsync({
        title: newPhaseForm.title,
        goal: newPhaseForm.goal,
        description: newPhaseForm.description,
        timeframe: newPhaseForm.timeframe,
        assignedMembers: []
      });
      setIsAddingPhase(false);
      setNewPhaseForm({ title: '', goal: '', description: '', timeframe: '' });
      addToast('success', 'New phase added successfully.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to add phase.');
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskForm.title.trim() || !addingTaskPhaseId) return;
    try {
      await createProjectTaskMutation.mutateAsync({
        phaseId: addingTaskPhaseId,
        title: newTaskForm.title,
        owner: newTaskForm.owner,
        due: newTaskForm.due,
        priority: newTaskForm.priority
      });
      setAddingTaskPhaseId(null);
      setNewTaskForm({ title: '', owner: '', due: '', priority: 'medium' as any });
      addToast('success', 'Task created. Click on it to expand and edit details.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to create task.');
    }
  };

  const handleAddRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRiskForm.description.trim()) return;
    try {
      await createProjectRiskMutation.mutateAsync({
        description: newRiskForm.description,
        severity: newRiskForm.severity,
        mitigation: newRiskForm.mitigation
      });
      setIsAddingRisk(false);
      setNewRiskForm({ description: '', severity: 'minor' as any, mitigation: '' });
      addToast('success', 'New risk item created.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to create risk.');
    }
  };

  // --- Deletion Actions ---
  const handleRemoveObjective = async (index: number) => {
    try {
      await persistPlanMeta(
        { objectives: activePlan.objectives.filter((_, objectiveIndex) => objectiveIndex !== index) },
        'Objective removed.'
      );
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to remove objective.');
    }
  };

  const handleAddObjectiveBullet = async () => {
    try {
      await persistPlanMeta(
        { objectives: [...activePlan.objectives, 'New objective bullet...'] },
        'Objective bullet added. Click to edit.'
      );
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to add objective.');
    }
  };

  const handleDeletePhase = async (phaseId: string) => {
    try {
      await deleteProjectPhaseMutation.mutateAsync(phaseId);
      setDeletePhaseTarget(null);
      addToast('success', 'Phase and all tasks inside deleted.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to delete phase.');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const taskContext = findTaskById(taskId);
    if (!taskContext) {
      addToast('error', 'Task not found.');
      return;
    }
    try {
      await deleteProjectTaskMutation.mutateAsync({
        phaseId: taskContext.phase.id,
        taskId
      });
      setTaskDeleteConfirmId(null);
      if (expandedTaskId === taskId) {
        setExpandedTaskId(null);
      }
      addToast('success', 'Task deleted.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to delete task.');
    }
  };

  const handleDeleteRisk = async (riskId: string) => {
    try {
      await deleteProjectRiskMutation.mutateAsync(riskId);
      addToast('success', 'Risk item deleted.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to delete risk.');
    }
  };

  const handleDismissGap = async (phaseId: string, gapId: string) => {
    try {
      await dismissProjectGapMutation.mutateAsync({
        phaseId,
        gapId
      });
      setGapDismissConfirmId(null);
      addToast('success', 'Gap notice dismissed.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to dismiss gap.');
    }
  };

  // --- Task Detail Specific Controls ---
  const handleAddCriteria = async (taskId: string) => {
    const taskContext = findTaskById(taskId);
    if (!taskContext) {
      addToast('error', 'Task not found.');
      return;
    }
    try {
      await updateTaskViaApi(
        taskId,
        { acceptanceCriteria: [...(taskContext.task.acceptanceCriteria || []), 'New acceptance criterion...'] },
        'Acceptance criterion added.'
      );
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to add criterion.');
    }
  };

  const handleRemoveCriteria = async (taskId: string, criteriaIndex: number) => {
    const taskContext = findTaskById(taskId);
    if (!taskContext) {
      addToast('error', 'Task not found.');
      return;
    }
    try {
      await updateTaskViaApi(
        taskId,
        {
          acceptanceCriteria: (taskContext.task.acceptanceCriteria || []).filter((_, index) => index !== criteriaIndex)
        },
        'Acceptance criterion removed.'
      );
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to remove criterion.');
    }
  };

  const handleSimulateAttachFile = (taskId: string) => {
    void taskId;
    addToast('info', 'Attachment uploads are not wired in PlanView yet.');
  };

  // --- Render Inline Edit Component Helper ---
  const getEditablePlaceholder = (
    type: string,
    field?: string,
    fallback = 'Enter content for this field...'
  ) => {
    if (type === 'plan-title') return 'Enter the project or initiative name...';
    if (type === 'plan-desc') return 'Summarize the project scope, goals, and constraints...';
    if (type === 'objective') return 'Enter a specific business or delivery objective...';
    if (type === 'phase-title') return 'Enter the phase name, such as Discovery or Launch...';
    if (type === 'phase-goal') return 'Describe the outcome this phase should achieve...';
    if (type === 'phase-description') return 'Summarize the phase at a high level without repeating task titles...';
    if (type === 'phase-timeframe') return 'Enter a timeframe such as Week 2 or Q3 2026...';
    if (type === 'task-title') return 'Enter a concrete task title...';
    if (type === 'task-desc') return 'Describe the task, expected output, and any constraints...';
    if (type === 'task-owner') return 'Enter the owner responsible for this task...';
    if (type === 'task-due') return 'Enter a due date or milestone such as Jun 30 or Sprint 4...';
    if (type === 'task-priority') return 'Enter a priority such as high, medium, or low...';
    if (type === 'task-criteria') return 'Enter an acceptance criterion that defines done...';
    if (type === 'risk-desc') return 'Describe the risk, blocker, or issue to watch...';
    if (type === 'risk-mitigation') return 'Describe how the team should reduce or respond to this risk...';
    if (type === 'risk-severity') return 'Enter a severity such as critical, major, or minor...';
    return fallback;
  };

  const renderEditableText = (
    text: string,
    type: string,
    id?: string,
    index?: number,
    field?: string,
    isTextArea = false,
    className = "",
    placeholder?: string
  ) => {
    const resolvedPlaceholder = placeholder || getEditablePlaceholder(type, field);
    const isEditing =
      editingField &&
      editingField.type === type &&
      editingField.id === id &&
      editingField.index === index &&
      editingField.field === field;

    if (!isApprover) {
      return (
        <span className={`${className} ${!text ? 'italic text-text-muted text-xs' : ''}`}>
          {text || resolvedPlaceholder}
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
          {text || resolvedPlaceholder}
        </span>
        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary transition-opacity shrink-0 ml-1" />
      </div>
    );
  };

  const getChangesForSection = (...sections: ProposedChange['section'][]) =>
    pendingChanges.filter((change) => sections.includes(change.section));

  const getChangesForTarget = (sections: ProposedChange['section'][], targetId: string) =>
    pendingChanges.filter((change) => sections.includes(change.section) && change.targetId === targetId);

  const getTaskChangesForPhase = (phase: Phase, phaseIndex?: number) =>
    pendingChanges.filter(
      (change) =>
        change.section === 'tasks' &&
        change.action === 'add' &&
        matchesPhaseTarget(change.targetId, phase, phaseIndex)
    );

  const getAddedChangesForSection = (...sections: ProposedChange['section'][]) =>
    pendingChanges.filter((change) => sections.includes(change.section) && change.action === 'add');

  const getSectionActionLabel = (change: ProposedChange): string => {
    if (change.action === 'add') return `Add ${change.section.replace('_', ' ')}`;
    if (change.action === 'remove') return `Remove ${change.section.replace('_', ' ')}`;
    return `Update ${change.section.replace('_', ' ')}`;
  };

  const getProposalCardClasses = (change: ProposedChange): string => {
    if (change.action === 'remove') {
      return 'border-error/20 bg-error/5';
    }
    if (change.action === 'add') {
      return 'border-primary/20 bg-primary-muted/10';
    }
    return 'border-warning/20 bg-warning/5';
  };

  const getProposalLabelClasses = (change: ProposedChange): string => {
    if (change.action === 'remove') return 'text-error';
    if (change.action === 'add') return 'text-primary';
    return 'text-warning';
  };

  const asArray = (value: unknown): Record<string, any>[] => {
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, any> => typeof item === 'object' && item !== null);
    }
    if (typeof value === 'object' && value !== null) {
      return [value as Record<string, any>];
    }
    return [];
  };

  const renderProposalCards = (
    changes: ProposedChange[],
    className = 'mt-3'
  ) => {
    if (changes.length === 0) return null;

    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {changes.map((change) => (
          <div
            key={change.id}
            className={`rounded-xl border p-3 transition-all ${getProposalCardClasses(change)}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${getProposalLabelClasses(change)}`}>
                {getSectionActionLabel(change)}
              </span>
              {change.confidence && (
                <span className="text-[10px] text-text-muted uppercase tracking-wider">
                  {change.confidence}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs font-semibold text-text-primary leading-snug">
              {change.title}
            </div>
            {change.detail && (
              <div className="mt-1 text-[11px] text-text-muted leading-relaxed">
                {change.detail}
              </div>
            )}
            {change.sourceQuote && (
              <div className="mt-2 border-l border-border-subtle pl-2 text-[10px] italic text-text-muted leading-normal">
                {change.sourceQuote}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderPendingReviewCard = (change: ProposedChange) => {
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

        {isApprover ? (
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
        ) : (
          <div className="mt-1.5 rounded-lg border border-border-subtle bg-surface-raised/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted select-none">
            View only
          </div>
        )}
      </div>
    );
  };

  const _renderProposedTaskRowsLegacy = (phase: Phase) => {
    const proposedTaskChanges = getTaskChangesForPhase(phase);
    if (proposedTaskChanges.length === 0) return null;

    return proposedTaskChanges.map((change) => {
      const proposedTasks = asArray(change.content);
      const fallbackTask = proposedTasks.length === 0 ? [{}] : proposedTasks;

      return fallbackTask.map((task, index) => (
        <div
          key={`${change.id}-${index}`}
          className="flex items-start gap-4 transition-all duration-200 p-2 -mx-2 rounded-xl border border-primary/15 bg-primary-muted/10"
        >
          <span className="font-mono text-xs text-text-muted mt-1 select-none w-6 text-right shrink-0">
            ++
          </span>
          <div className="flex-grow min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-bold text-text-primary text-sm tracking-tight truncate max-w-full">
                {String(task.title || change.title || 'Proposed task')}
              </div>
              <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">
                NEW
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-text-muted">
              <span>Owner:</span>
              <span className="font-semibold text-text-secondary">{String(task.owner || '—')}</span>
              <span>·</span>
              <span>Due:</span>
              <span className="font-semibold text-text-secondary">{String(task.due || '—')}</span>
              <span>·</span>
              <span className="font-semibold text-text-secondary capitalize">{String(task.priority || 'medium')}</span>
            </div>
            {change.detail && (
              <div className="mt-2 text-[11px] text-text-muted leading-relaxed">
                {change.detail}
              </div>
            )}
            {task.description && (
              <div className="mt-2 text-xs text-text-secondary leading-relaxed">
                {String(task.description)}
              </div>
            )}
            {Array.isArray(task.acceptance_criteria) && task.acceptance_criteria.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Done When</span>
                <ul className="list-disc pl-4 text-[11px] text-text-secondary leading-relaxed">
                  {task.acceptance_criteria.map((criterion, criterionIndex) => (
                    <li key={`${change.id}-${index}-${criterionIndex}`}>{criterion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ));
    });
  };

  const _renderProposedPhaseBlocksLegacy = () => {
    const proposedPhaseChanges = getAddedChangesForSection('phases');
    if (proposedPhaseChanges.length === 0) return null;

    return proposedPhaseChanges.map((change) => {
      const proposedPhases = asArray(change.content);
      const fallbackPhases = proposedPhases.length === 0 ? [{}] : proposedPhases;

      return fallbackPhases.map((phase, index) => (
        <div key={`${change.id}-${index}`} className="flex flex-col gap-4 relative rounded-xl border border-primary/15 bg-primary-muted/10 p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-text-primary tracking-tight">
                  {String(phase.title || change.title || 'Proposed phase')}
                </span>
                {phase.timeframe && (
                  <span className="category-badge badge--viewer text-[11px] py-0.5 px-2 font-semibold bg-surface-raised border border-border">
                    {String(phase.timeframe)}
                  </span>
                )}
                <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">
                  NEW
                </span>
              </div>
              {(phase.goal || change.detail) && (
                <span className="text-sm text-text-secondary italic">
                  {String(phase.goal || change.detail)}
                </span>
              )}
              {phase.description && (
                <span className="text-sm text-text-muted leading-relaxed">
                  {String(phase.description)}
                </span>
              )}
            </div>
          </div>
          {change.sourceQuote && (
            <div className="border-l border-border-subtle pl-2 text-[10px] italic text-text-muted leading-normal">
              {change.sourceQuote}
            </div>
          )}
        </div>
      ));
    });
  };

  const _renderProposedRiskRowsLegacy = () => {
    const proposedRiskChanges = getChangesForSection('risks', 'global_risks').filter((change) => change.action === 'add');
    if (proposedRiskChanges.length === 0) return null;

    return proposedRiskChanges.map((change) => {
      const proposedRisks = asArray(change.content);
      const fallbackRisks = proposedRisks.length === 0 ? [{}] : proposedRisks;

      return fallbackRisks.map((risk, index) => (
        <div
          key={`${change.id}-${index}`}
          className="group/risk flex flex-col gap-1.5 relative border-l border-primary/30 pl-4 py-0.5 bg-primary-muted/10 rounded-r-lg"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0 bg-warning" />
            <span className="text-xs font-bold uppercase tracking-widest shrink-0 text-warning">
              {String(risk.severity || 'proposed')}
            </span>
            <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">
              NEW
            </span>
          </div>
          <div className="text-sm text-text-secondary leading-relaxed">
            {String(risk.description || change.title || 'Proposed risk')}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted select-text mt-1">
            <span className="font-semibold select-none text-[11px] uppercase tracking-wider">Mitigation:</span>
            <span className="italic text-text-secondary text-xs">
              {String(risk.mitigation || 'No mitigation defined.')}
            </span>
          </div>
          {change.detail && (
            <div className="text-[11px] text-text-muted leading-relaxed">
              {change.detail}
            </div>
          )}
        </div>
      ));
    });
  };

  const renderProposedTaskRows = (phase: Phase, phaseIndex?: number) => {
    const proposedTaskChanges = getTaskChangesForPhase(phase, phaseIndex);
    if (proposedTaskChanges.length === 0) return null;

    return proposedTaskChanges.flatMap((change) =>
      getProposalTaskPreviewItems(change).map((task, index) => (
        <div
          key={`${change.id}-${index}`}
          className="flex items-start gap-4 transition-all duration-200 p-2 -mx-2 rounded-xl border border-primary/15 bg-primary-muted/10"
        >
          <span className="font-mono text-xs text-text-muted mt-1 select-none w-6 text-right shrink-0">
            ++
          </span>
          <div className="flex-grow min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-bold text-text-primary text-sm tracking-tight truncate max-w-full">
                {task.title}
              </div>
              <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">
                NEW
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-text-muted">
              <span>Owner:</span>
              <span className="font-semibold text-text-secondary">{task.owner || '—'}</span>
              <span>·</span>
              <span>Due:</span>
              <span className="font-semibold text-text-secondary">{task.due || '—'}</span>
              <span>·</span>
              <span className="font-semibold text-text-secondary capitalize">{task.priority || 'medium'}</span>
            </div>
            {change.detail && (
              <div className="mt-2 text-[11px] text-text-muted leading-relaxed">
                {change.detail}
              </div>
            )}
            {task.description && (
              <div className="mt-2 text-xs text-text-secondary leading-relaxed">
                {task.description}
              </div>
            )}
            {task.acceptanceCriteria.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Done When</span>
                <ul className="list-disc pl-4 text-[11px] text-text-secondary leading-relaxed">
                  {task.acceptanceCriteria.map((criterion, criterionIndex) => (
                    <li key={`${change.id}-${index}-${criterionIndex}`}>{criterion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ))
    );
  };

  const renderProposedPhaseBlocks = () => {
    const proposedPhases = getProposalPhasePreviewItems(getAddedChangesForSection('phases'));
    if (proposedPhases.length === 0) return null;

    return proposedPhases.map((phase) => {
      const proposedTaskChanges = pendingChanges.filter(
        (change) =>
          change.section === 'tasks' &&
          change.action === 'add' &&
          matchesPhaseTarget(change.targetId, { title: phase.title }, Number(phase.key))
      );

      return (
        <div key={phase.key} className="flex flex-col gap-4 relative rounded-xl border border-primary/15 bg-primary-muted/10 p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-text-primary tracking-tight">
                  {phase.title}
                </span>
                {phase.timeframe && (
                  <span className="category-badge badge--viewer text-[11px] py-0.5 px-2 font-semibold bg-surface-raised border border-border">
                    {phase.timeframe}
                  </span>
                )}
                <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">
                  NEW
                </span>
              </div>
              {(phase.goal || phase.change.detail) && (
                <span className="text-sm text-text-secondary italic">
                  {phase.goal || phase.change.detail}
                </span>
              )}
              {phase.description && (
                <span className="text-sm text-text-muted leading-relaxed">
                  {phase.description}
                </span>
              )}
            </div>
          </div>
          {phase.sourceQuote && (
            <div className="border-l border-border-subtle pl-2 text-[10px] italic text-text-muted leading-normal">
              {phase.sourceQuote}
            </div>
          )}
          {proposedTaskChanges.length > 0 && (
            <div className="flex flex-col gap-4 pl-6 ml-3 select-none">
              {proposedTaskChanges.flatMap((change) =>
                getProposalTaskPreviewItems(change).map((task, index) => (
                  <div
                    key={`${phase.key}-${change.id}-${index}`}
                    className="flex items-start gap-4 transition-all duration-200 p-2 -mx-2 rounded-xl border border-primary/15 bg-background/40"
                  >
                    <span className="font-mono text-xs text-text-muted mt-1 select-none w-6 text-right shrink-0">
                      ++
                    </span>
                    <div className="flex-grow min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-bold text-text-primary text-sm tracking-tight truncate max-w-full">
                          {task.title}
                        </div>
                        <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">
                          NEW
                        </span>
                      </div>
                      {task.acceptanceCriteria.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Done When</span>
                          <ul className="list-disc pl-4 text-[11px] text-text-secondary leading-relaxed">
                            {task.acceptanceCriteria.map((criterion, criterionIndex) => (
                              <li key={`${phase.key}-${change.id}-${index}-${criterionIndex}`}>{criterion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      );
    });
  };

  const renderProposedRiskRows = () => {
    const proposedRiskChanges = getChangesForSection('risks', 'global_risks').filter((change) => change.action === 'add');
    if (proposedRiskChanges.length === 0) return null;

    return proposedRiskChanges.flatMap((change) =>
      getProposalRiskPreviewItems(change).map((risk, index) => (
        <div
          key={`${change.id}-${index}`}
          className="group/risk flex flex-col gap-1.5 relative border-l border-primary/30 pl-4 py-0.5 bg-primary-muted/10 rounded-r-lg"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0 bg-warning" />
            <span className="text-xs font-bold uppercase tracking-widest shrink-0 text-warning">
              {risk.severity || 'proposed'}
            </span>
            <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">
              NEW
            </span>
          </div>
          <div className="text-sm text-text-secondary leading-relaxed">
            {risk.description}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted select-text mt-1">
            <span className="font-semibold select-none text-[11px] uppercase tracking-wider">Mitigation:</span>
            <span className="italic text-text-secondary text-xs">
              {risk.mitigation || 'No mitigation defined.'}
            </span>
          </div>
          {change.detail && (
            <div className="text-[11px] text-text-muted leading-relaxed">
              {change.detail}
            </div>
          )}
        </div>
      ))
    );
  };

  return (
    <div className="flex-grow flex flex-col bg-background h-[calc(100vh-112px)] overflow-hidden font-body select-none">

      {/* Main Content Layout */}
      <div className="flex-grow flex flex-col lg:flex-row relative overflow-hidden lg:p-4 lg:gap-4">

        {/* Timeline Column (Center/Left) */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-border lg:border-0 lg:rounded-xl lg:overflow-hidden bg-surface relative overflow-hidden shadow-sm">

          {/* Plan Controls Bar */}
          <div className="h-[52px] px-8 bg-surface border-b border-border-subtle flex items-center justify-between shrink-0">
            <div className="text-sm text-text-primary font-semibold select-text">
              Project plan
            </div>

            <div className="flex items-center gap-3">
              {currentGapCount > 0 && (
                <span className="category-badge badge--editor text-xs py-1 px-3 flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{currentGapCount} gaps flagged</span>
                </span>
              )}

              {pendingChanges.length > 0 && isApprover && (
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

          {/* Timeline Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-12 flex justify-center">
            <div className="max-w-[760px] w-full flex flex-col gap-8">

              {/* 3.1 Plan Header */}
              <div className="flex flex-col gap-3 select-text">
                {renderEditableText(
                  activePlan.title,
                  'plan-title',
                  undefined,
                  undefined,
                  undefined,
                  false,
                  "text-display-sm font-bold text-text-primary tracking-tight md:text-3xl",
                  "Untitled project plan"
                )}
                {renderProposalCards(getChangesForSection('title'), 'mt-1')}

                {renderEditableText(
                  activePlan.description,
                  'plan-desc',
                  undefined,
                  undefined,
                  undefined,
                  true,
                  "text-sm text-text-secondary leading-relaxed",
                  "Summarize the project scope, goals, and constraints..."
                )}
                {renderProposalCards(getChangesForSection('description'), 'mt-1')}

                {/* Meta chip row */}
                <div className="flex flex-wrap gap-2 mt-2 select-none">
                  <span className="category-badge badge--viewer text-xs py-0.5 px-2 font-semibold bg-surface-raised text-text-muted">
                    {formatDisplayDate(activePlan.updatedAt || activePlan.createdAt)}
                  </span>
                  <span className="category-badge text-xs py-0.5 px-2 font-semibold bg-text-muted/10 text-text-muted border border-text-muted/20">
                    Live
                  </span>
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
                    {renderProposalCards(getChangesForSection('objectives'), 'mb-1')}
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
                      <span className="text-xs text-text-muted italic">
                        {hasNoPlanBody ? 'No plan yet, start your brainstorming conversation.' : 'No objectives defined.'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest text-text-muted font-bold">
                      Technology Stack
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 pl-1">
                    {renderProposalCards(getChangesForSection('technology_stack'), 'mb-1')}
                    {activePlan.technologyStack.map((item, index) => (
                      <div
                        key={`${item.title}-${item.value}-${index}`}
                        className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-raised/20 px-3 py-2"
                      >
                        <span className="text-sm font-semibold text-text-primary">{item.title}</span>
                        <span className="text-xs uppercase tracking-wider text-text-muted">{item.value}</span>
                      </div>
                    ))}
                    {activePlan.technologyStack.length === 0 && (
                      <span className="text-xs text-text-muted italic">
                        {hasNoPlanBody ? 'No plan yet, start your brainstorming conversation.' : 'No technology stack defined.'}
                      </span>
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
                  const phaseChanges = getChangesForTarget(['phases'], phase.id);

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

                          {renderEditableText(
                            phase.description || '',
                            'phase-description',
                            phase.id,
                            undefined,
                            undefined,
                            true,
                            "text-sm text-text-muted leading-relaxed"
                          )}

                          <div className="relative mt-1">
                            <button
                              type="button"
                              data-phase-assignee-trigger
                              onClick={() => setActivePhaseAssigneePickerId((current) => current === phase.id ? null : phase.id)}
                              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-primary hover:border-primary/40 transition-colors"
                            >
                              <span>Assigned</span>
                              <span className="text-text-primary">{phase.assignedMembers.length}</span>
                            </button>

                            {phase.assignedMembers.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {phase.assignedMembers.map((member) => (
                                  <span
                                    key={`${phase.id}-${member.sessionId}`}
                                    className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-raised/30 px-2.5 py-1 text-xs text-text-secondary"
                                  >
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                                      {member.initials}
                                    </span>
                                    <span>{member.name}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            {activePhaseAssigneePickerId === phase.id && (
                              <div
                                data-phase-assignee-popover
                                className="absolute left-0 top-full z-20 mt-3 w-full max-w-sm rounded-xl border border-border bg-surface p-3 shadow-2xl"
                              >
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-[11px] font-bold uppercase tracking-widest text-text-primary">
                                    Assign Members
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActivePhaseAssigneePickerId(null)}
                                    className="text-text-muted hover:text-text-primary"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <p className="mb-3 text-xs leading-relaxed text-text-muted">
                                  Select project members responsible for this phase.
                                </p>
                                <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
                                  {teammates.map((member) => {
                                    const isAssigned = phase.assignedMembers.some((assigned) => assigned.sessionId === member.sessionId);
                                    return (
                                      <button
                                        key={`${phase.id}-${member.sessionId}`}
                                        type="button"
                                        onClick={() => {
                                          void togglePhaseAssignedMember(phase, member);
                                        }}
                                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${isAssigned
                                            ? 'border-primary/40 bg-primary/10 text-text-primary'
                                            : 'border-border-subtle bg-background text-text-secondary hover:border-border hover:text-text-primary'
                                          }`}
                                      >
                                        <span className="flex items-center gap-2">
                                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-[11px] font-bold text-text-primary">
                                            {member.initials}
                                          </span>
                                          <span className="flex flex-col">
                                            <span className="text-sm font-semibold">{member.name}</span>
                                            <span className="text-[11px] uppercase tracking-wider text-text-muted">{member.role}</span>
                                          </span>
                                        </span>
                                        {isAssigned && <Check className="w-4 h-4 text-primary" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
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
                                    setEditingField({ type: 'phase-description', id: phase.id, value: phase.description || '' });
                                    setActivePhaseMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-primary-muted transition-colors flex items-center gap-2"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-primary" />
                                  <span>Edit Description</span>
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

                      {renderProposalCards(phaseChanges, 'mt-0')}

                      {/* 3.4 Tasks in Phase */}
                      <div className="flex flex-col gap-4 pl-6 ml-3 select-none">
                        {renderProposedTaskRows(phase, pIdx)}
                        {phase.tasks.map((task: Task, tIdx: number) => {
                          const stepNum = String(tIdx + 1).padStart(2, '0');
                          const isExpanded = expandedTaskId === task.id;
                          const taskChanges = getChangesForTarget(['tasks'], task.id);

                          // Left Border & Bg matrix styles based on status
                          let rowStyle = 'border-l-2 border-transparent hover:bg-surface-raised/40';
                          let badge = null;

                          if (task.isRemoved) {
                            rowStyle = 'border-l-2 border-transparent bg-error/5 opacity-50 hover:bg-error/10';
                            badge = (
                              <span className="category-badge text-[9px] py-0.5 px-1.5 font-bold bg-error/10 text-error border border-error/20">
                                ? Removed
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
                                <span>? Missing Owner</span>
                              </span>
                            );
                          } else if (task.status === 'rejected') {
                            rowStyle = 'border-l-2 border-transparent hover:bg-surface-raised/40 opacity-40';
                            badge = (
                              <span className="category-badge text-[9px] py-0.5 px-1.5 font-bold bg-error/10 text-error border border-error/20">
                                ? Rejected
                              </span>
                            );
                          }
                          if (taskChanges.length > 0) {
                            rowStyle = `${rowStyle} ring-1 ring-primary/20 rounded-xl`;
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
                                            void updateTaskViaApi(task.id, { priority: e.target.value as Task['priority'] }, `Priority changed to ${e.target.value}.`);
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
                                    {isExpanded ? '[? Hide]' : <span className="opacity-0 group-hover/task-row:opacity-100 font-mono">[? Expand]</span>}
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
                                  {renderProposalCards(taskChanges, 'mt-0')}
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
                                      "Describe the task, expected output, and any constraints..."
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

                {renderProposedPhaseBlocks()}

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
                      <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Description (high-level overview)</label>
                      <textarea
                        placeholder="Describe the phase scope and intended outcome without listing tasks..."
                        className="bg-background border border-border rounded-md p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary w-full min-h-[90px]"
                        value={newPhaseForm.description}
                        onChange={(e) => setNewPhaseForm({ ...newPhaseForm, description: e.target.value })}
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
                    <h2 className="text-lg font-bold text-text-primary mb-2">No plan yet</h2>
                    <p className="text-sm text-text-secondary max-w-[400px] mb-6 leading-relaxed">
                      Start your brainstorming conversation with the team to shape the project plan.
                    </p>
                    <a href={`/project/${projectId}/chat`} className="btn-primary flex items-center gap-2">
                      <span>Go to Chat</span>
                    </a>
                  </div>
                )}
              </div>

              {/* 3.9 Risk Summary Block */}
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
                  {renderProposalCards(
                    getChangesForSection('risks', 'global_risks').filter((change) => change.action !== 'add' && !change.targetId),
                    'mb-0'
                  )}
                  {renderProposedRiskRows()}
                  {activePlan.globalRisks.map((risk) => {
                    const riskChanges = getChangesForTarget(['risks', 'global_risks'], risk.id);
                    // Severity colors map
                    const dotClassMap = {
                      critical: 'bg-error',
                      major: 'bg-warning',
                      minor: 'bg-text-muted'
                    };
                    const dotColor = dotClassMap[risk.severity] || 'bg-text-muted';

                    return (
                      <div
                        key={risk.id}
                        className={`group/risk flex flex-col gap-1.5 relative border-l border-border-subtle pl-4 py-0.5 ${riskChanges.length > 0 ? 'rounded-r-lg bg-warning/5 pr-3' : ''}`}
                      >

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
                                void updateRiskViaApi(risk.id, { severity: e.target.value as RiskItem['severity'] }, 'Field updated.');
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
                            "Describe how the team should reduce or respond to this risk..."
                          )}
                        </div>

                        {renderProposalCards(riskChanges, 'mt-1')}
                      </div>
                    );
                  })}

                  {activePlan.globalRisks.length === 0 && (
                    <span className="text-xs text-text-muted italic pl-1">
                      {hasNoPlanBody ? 'No plan yet, start your brainstorming conversation.' : 'No risk flags registered.'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Review Panel (Right Sidebar, Approver Only) */}
        {showReviewPanel && (
          <div className="hidden lg:flex w-full lg:w-[28%] lg:min-w-[280px] lg:max-w-[340px] border-l border-border lg:border-0 lg:rounded-xl lg:overflow-hidden bg-surface flex-col shrink-0 shadow-sm">
            {/* Review Panel Header */}
            <div className="p-5 border-b border-border-subtle flex flex-col gap-1.5 shrink-0 select-none">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted font-bold">
                  Pending Changes
                </span>
                <span className={`category-badge text-[10px] py-0.5 px-2 font-bold ${isApprover ? 'badge--approver' : 'badge--viewer'}`}>
                  {pendingChanges.length}
                </span>
              </div>
              {!isApprover && (
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Read-only preview
                </span>
              )}
            </div>

            {/* Scrollable list of cards */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {pendingChanges.map(renderPendingReviewCard)}

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
            {pendingChanges.length > 0 && isApprover && (
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
              {pendingChanges.map(renderPendingReviewCard)}

              {pendingChanges.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center p-8 py-20 text-text-muted">
                  <Check className="w-8 h-8 text-success mb-2" />
                  <span className="text-xs font-semibold text-text-primary">Review complete.</span>
                </div>
              )}
            </div>

            {/* Accept All bottom action */}
            {pendingChanges.length > 0 && isApprover && (
              <div className="p-4 border-t border-border-subtle bg-surface select-none">
                <button
                  onClick={() => {
                    handleAcceptAll();
                    setIsReviewDrawerOpen(false);
                  }}
                  className="w-full btn-primary py-2 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <span>? Accept All ?</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Action Button for Review Drawer on Mobile/Tablet */}
      {pendingChanges.length > 0 && isApprover && (
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

