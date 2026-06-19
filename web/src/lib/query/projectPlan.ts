import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiFetch } from '../api/client';
import { defaultProjectRepository, mapPlan } from '../../stores/project/repository';
import { sessionId } from '../../stores/project/session';
import type {
  ApiProjectPlan,
  GapItem,
  Phase,
  ProposedChange,
  RiskItem,
  StructuredPlan,
  Task,
  TechnologyStackItem,
} from '../../stores/project/types';

const projectPlanQueryKey = (projectId: string) => ['project-plan', projectId] as const;
const projectPlanVersionsQueryKey = (projectId: string) => ['project-plan-versions', projectId] as const;
const projectPendingProposalQueryKey = (projectId: string) => ['project-plan-proposal', projectId] as const;

interface ApiEnvelope<T> {
  data: T;
}

interface ApiProposalChange {
  id: string;
  action: 'add' | 'update' | 'remove';
  section:
    | 'title'
    | 'description'
    | 'objectives'
    | 'stakeholders'
    | 'technology_stack'
    | 'tasks'
    | 'phases'
    | 'gaps'
    | 'risks'
    | 'global_risks';
  targetId?: string | null;
  title?: string;
  detail?: string;
  confidence?: 'high' | 'medium' | 'low' | null;
  sourceQuote?: string | null;
  state?: 'pending' | 'applied' | 'rejected' | 'stale' | null;
  justification?: string | null;
  source_message_ids?: string[] | null;
  content?: unknown;
}

interface ApiProposal {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'superseded';
  changes: ApiProposalChange[];
  created_at: string;
}

interface OptimisticPlanContext {
  previousPlan?: StructuredPlan;
}

interface PendingProposalView {
  proposalId: string | null;
  changes: ProposedChange[];
}

interface OptimisticProposalContext extends OptimisticPlanContext {
  previousProposal?: PendingProposalView;
}

interface ProposalChangeOverrideInput {
  changeId: string;
  content: unknown;
}

interface AcceptProposalChangeInput {
  changeId: string;
  content?: unknown;
}

function buildOptimisticId(prefix: string): string {
  return `optimistic:${prefix}:${Math.random().toString(36).slice(2, 10)}`;
}

function getNextUpdatedAt(plan: StructuredPlan, now: Date = new Date()): string {
  return plan.createdAt || plan.updatedAt ? now.toISOString() : plan.updatedAt;
}

function updateCachedPlan(
  queryClient: Pick<QueryClient, 'setQueryData'>,
  projectId: string,
  updater: (plan: StructuredPlan) => StructuredPlan
): void {
  queryClient.setQueryData<StructuredPlan>(
    projectPlanQueryKey(projectId),
    (current) => (current ? updater(current) : current)
  );
}

async function prepareOptimisticPlanUpdate(
  queryClient: Pick<QueryClient, 'cancelQueries' | 'getQueryData' | 'setQueryData'>,
  projectId: string,
  updater: (plan: StructuredPlan) => StructuredPlan
): Promise<OptimisticPlanContext> {
  await queryClient.cancelQueries({ queryKey: projectPlanQueryKey(projectId) });
  const previousPlan = queryClient.getQueryData<StructuredPlan>(projectPlanQueryKey(projectId));
  if (previousPlan) {
    updateCachedPlan(queryClient, projectId, updater);
  }
  return { previousPlan };
}

function rollbackOptimisticPlanUpdate(
  queryClient: Pick<QueryClient, 'setQueryData'>,
  projectId: string,
  context?: OptimisticPlanContext
): void {
  if (context?.previousPlan) {
    queryClient.setQueryData(projectPlanQueryKey(projectId), context.previousPlan);
  }
}

function reconcileOptimisticPlanUpdate(
  queryClient: Pick<QueryClient, 'setQueryData'>,
  projectId: string,
  persistedPlan: StructuredPlan
): void {
  queryClient.setQueryData(projectPlanQueryKey(projectId), persistedPlan);
}

function updateCachedProposal(
  queryClient: Pick<QueryClient, 'setQueryData'>,
  projectId: string,
  updater: (proposal: PendingProposalView) => PendingProposalView | undefined
): void {
  queryClient.setQueryData<PendingProposalView | undefined>(
    projectPendingProposalQueryKey(projectId),
    (current) => (current ? updater(current) : current)
  );
}

function rollbackOptimisticProposalUpdate(
  queryClient: Pick<QueryClient, 'setQueryData'>,
  projectId: string,
  context?: OptimisticProposalContext
): void {
  if (context?.previousProposal) {
    queryClient.setQueryData(projectPendingProposalQueryKey(projectId), context.previousProposal);
  }
}

export function applyPlanMetaPatch(
  plan: StructuredPlan,
  patch: Partial<Pick<StructuredPlan, 'title' | 'description' | 'objectives' | 'stakeholders'>>
): StructuredPlan {
  return {
    ...plan,
    ...patch,
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function buildOptimisticPhase(
  title: string,
  goal: string,
  timeframe: string
): Phase {
  return {
    id: buildOptimisticId('phase'),
    title,
    goal,
    timeframe,
    tasks: [],
    gaps: [],
  };
}

export function addOptimisticPhase(plan: StructuredPlan, phase: Phase): StructuredPlan {
  return {
    ...plan,
    phases: [...plan.phases, phase],
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function applyPhasePatch(
  plan: StructuredPlan,
  variables: { phaseId: string; title: string; goal: string; timeframe: string }
): StructuredPlan {
  return {
    ...plan,
    phases: plan.phases.map((phase) =>
      phase.id === variables.phaseId
        ? {
          ...phase,
          title: variables.title,
          goal: variables.goal,
          timeframe: variables.timeframe,
        }
        : phase
    ),
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function removeOptimisticPhase(plan: StructuredPlan, phaseId: string): StructuredPlan {
  return {
    ...plan,
    phases: plan.phases.filter((phase) => phase.id !== phaseId),
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function buildOptimisticTask(
  variables: { title: string; owner: string; due: string; priority: string }
): Task {
  return {
    id: buildOptimisticId('task'),
    title: variables.title,
    description: '',
    acceptanceCriteria: [],
    owner: variables.owner || undefined,
    due: variables.due || undefined,
    priority: variables.priority as Task['priority'],
    status: 'accepted',
    attachments: [],
    sourceMessageIds: [],
    confidence: 'high',
    isNew: true,
  };
}

export function addOptimisticTask(
  plan: StructuredPlan,
  phaseId: string,
  task: Task
): StructuredPlan {
  return {
    ...plan,
    phases: plan.phases.map((phase) =>
      phase.id === phaseId
        ? {
          ...phase,
          tasks: [...phase.tasks, task],
        }
        : phase
    ),
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function applyTaskPatch(
  plan: StructuredPlan,
  variables: {
    phaseId: string;
    taskId: string;
    updates: Partial<Pick<Task, 'title' | 'description' | 'owner' | 'due' | 'priority' | 'acceptanceCriteria'>>;
  }
): StructuredPlan {
  return {
    ...plan,
    phases: plan.phases.map((phase) =>
      phase.id === variables.phaseId
        ? {
          ...phase,
          tasks: phase.tasks.map((task) =>
            task.id === variables.taskId
              ? {
                ...task,
                ...variables.updates,
                isModified: true,
              }
              : task
          ),
        }
        : phase
    ),
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function removeOptimisticTask(
  plan: StructuredPlan,
  variables: { phaseId: string; taskId: string }
): StructuredPlan {
  return {
    ...plan,
    phases: plan.phases.map((phase) =>
      phase.id === variables.phaseId
        ? {
          ...phase,
          tasks: phase.tasks.filter((task) => task.id !== variables.taskId),
        }
        : phase
    ),
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function buildOptimisticRisk(
  variables: { description: string; severity: string; mitigation: string }
): RiskItem {
  return {
    id: buildOptimisticId('risk'),
    description: variables.description,
    severity: variables.severity as RiskItem['severity'],
    mitigation: variables.mitigation || undefined,
    sourceMessageIds: [],
  };
}

export function addOptimisticRisk(plan: StructuredPlan, risk: RiskItem): StructuredPlan {
  return {
    ...plan,
    globalRisks: [...plan.globalRisks, risk],
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function applyRiskPatch(
  plan: StructuredPlan,
  variables: {
    riskId: string;
    updates: Partial<Pick<RiskItem, 'description' | 'severity' | 'mitigation'>>;
  }
): StructuredPlan {
  return {
    ...plan,
    globalRisks: plan.globalRisks.map((risk) =>
      risk.id === variables.riskId
        ? {
          ...risk,
          ...variables.updates,
        }
        : risk
    ),
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function removeOptimisticRisk(plan: StructuredPlan, riskId: string): StructuredPlan {
  return {
    ...plan,
    globalRisks: plan.globalRisks.filter((risk) => risk.id !== riskId),
    updatedAt: getNextUpdatedAt(plan),
  };
}

export function dismissOptimisticGap(
  plan: StructuredPlan,
  variables: { phaseId: string; gapId: string }
): StructuredPlan {
  return {
    ...plan,
    phases: plan.phases.map((phase) =>
      phase.id === variables.phaseId
        ? {
          ...phase,
          gaps: phase.gaps.filter((gap) => gap.id !== variables.gapId),
        }
        : phase
    ),
    updatedAt: getNextUpdatedAt(plan),
  };
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  }
  if (typeof value === 'object' && value !== null) {
    return [value as Record<string, unknown>];
  }
  return [];
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
}

function toOptimisticStakeholder(entry: Record<string, unknown>) {
  return {
    userId: String(entry.user_id || entry.userId || buildOptimisticId('stakeholder')),
    name: typeof entry.name === 'string' ? entry.name : typeof entry.title === 'string' ? entry.title : 'Proposed stakeholder',
    role: typeof entry.role === 'string' ? entry.role : '',
    initials:
      typeof entry.initials === 'string'
        ? entry.initials
        : typeof entry.name === 'string'
          ? entry.name.slice(0, 2).toUpperCase()
          : typeof entry.title === 'string'
            ? entry.title.slice(0, 2).toUpperCase()
            : 'PR',
  };
}

function toOptimisticPhase(entry: Record<string, unknown>): Phase {
  return {
    id: typeof entry.id === 'string' ? entry.id : buildOptimisticId('phase'),
    title: typeof entry.title === 'string' ? entry.title : 'Proposed phase',
    goal: typeof entry.goal === 'string' ? entry.goal : '',
    timeframe: typeof entry.timeframe === 'string' ? entry.timeframe : '',
    tasks: [],
    gaps: [],
  };
}

function toOptimisticTask(entry: Record<string, unknown>): Task {
  const acceptanceCriteria = Array.isArray(entry.acceptance_criteria)
    ? entry.acceptance_criteria.filter((item): item is string => typeof item === 'string')
    : Array.isArray(entry.acceptanceCriteria)
      ? entry.acceptanceCriteria.filter((item): item is string => typeof item === 'string')
      : [];

  return {
    id: typeof entry.id === 'string' ? entry.id : buildOptimisticId('task'),
    title: typeof entry.title === 'string' ? entry.title : 'Proposed task',
    description: typeof entry.description === 'string' ? entry.description : '',
    acceptanceCriteria,
    owner: typeof entry.owner === 'string' ? entry.owner : undefined,
    due: typeof entry.due === 'string' ? entry.due : typeof entry.due_date === 'string' ? entry.due_date : undefined,
    priority:
      entry.priority === 'critical' || entry.priority === 'high' || entry.priority === 'medium' || entry.priority === 'low'
        ? entry.priority
        : 'medium',
    status: 'accepted',
    attachments: [],
    sourceMessageIds: [],
    confidence: 'high',
    isNew: true,
  };
}

function toOptimisticGap(entry: Record<string, unknown>): GapItem {
  return {
    id: typeof entry.id === 'string' ? entry.id : buildOptimisticId('gap'),
    description:
      typeof entry.description === 'string'
        ? entry.description
        : typeof entry.title === 'string'
          ? entry.title
          : 'Proposed gap',
    severity:
      entry.severity === 'critical' || entry.severity === 'major' || entry.severity === 'minor'
        ? entry.severity
        : 'minor',
    sourceMessageIds: [],
  };
}

function toOptimisticRisk(entry: Record<string, unknown>): RiskItem {
  return {
    id: typeof entry.id === 'string' ? entry.id : buildOptimisticId('risk'),
    description:
      typeof entry.description === 'string'
        ? entry.description
        : typeof entry.title === 'string'
          ? entry.title
          : 'Proposed risk',
    severity:
      entry.severity === 'critical' || entry.severity === 'major' || entry.severity === 'minor'
        ? entry.severity
        : 'minor',
    mitigation: typeof entry.mitigation === 'string' ? entry.mitigation : undefined,
    sourceMessageIds: [],
  };
}

function toOptimisticTechnologyStackItem(entry: Record<string, unknown>): TechnologyStackItem {
  return {
    title:
      typeof entry.title === 'string'
        ? entry.title
        : typeof entry.name === 'string'
          ? entry.name
          : 'Proposed technology',
    value:
      typeof entry.value === 'string'
        ? entry.value
        : typeof entry.detail === 'string'
          ? entry.detail
          : '',
  };
}

function normalizePhaseReference(value: string): string {
  return value.trim().toLowerCase().replaceAll('_', ' ').split(/\s+/).filter(Boolean).join(' ');
}

function resolvePhaseId(plan: StructuredPlan, phaseReference: string): string | undefined {
  const normalizedTarget = normalizePhaseReference(phaseReference);
  const matchedPhase = plan.phases.find(
    (phase) => phase.id === phaseReference || normalizePhaseReference(phase.title) === normalizedTarget
  );
  return matchedPhase?.id;
}

export function applyAcceptedProposalChange(plan: StructuredPlan, change: ProposedChange): StructuredPlan {
  if (change.section === 'title') {
    const nextTitle =
      typeof change.content === 'string'
        ? change.content
        : toStringList(change.content)[0] || change.title || plan.title;
    return applyPlanMetaPatch(plan, { title: nextTitle });
  }

  if (change.section === 'description') {
    const nextDescription =
      typeof change.content === 'string'
        ? change.content
        : toStringList(change.content)[0] || change.title || plan.description;
    return applyPlanMetaPatch(plan, { description: nextDescription });
  }

  if (change.section === 'objectives') {
    const objectives = toStringList(change.content);
    if (change.action === 'remove') {
      return applyPlanMetaPatch(plan, {
        objectives: plan.objectives.filter((objective) => !objectives.includes(objective)),
      });
    }
    return applyPlanMetaPatch(plan, {
      objectives: change.action === 'add' ? [...plan.objectives, ...objectives] : objectives,
    });
  }

  if (change.section === 'stakeholders') {
    const stakeholders = asObjectArray(change.content).map(toOptimisticStakeholder);
    if (change.action === 'remove') {
      const namesToRemove = new Set(stakeholders.map((stakeholder) => stakeholder.name));
      return applyPlanMetaPatch(plan, {
        stakeholders: plan.stakeholders.filter((stakeholder) => !namesToRemove.has(stakeholder.name)),
      });
    }
    return applyPlanMetaPatch(plan, {
      stakeholders: change.action === 'add' ? [...plan.stakeholders, ...stakeholders] : stakeholders,
    });
  }

  if (change.section === 'technology_stack') {
    const items = asObjectArray(change.content).map(toOptimisticTechnologyStackItem);
    if (change.action === 'remove') {
      const titlesToRemove = new Set(items.map((item) => item.title));
    return {
      ...plan,
      technologyStack: (plan.technologyStack || []).filter((item) => !titlesToRemove.has(item.title)),
      updatedAt: getNextUpdatedAt(plan),
    };
  }
  return {
    ...plan,
    technologyStack: change.action === 'add' ? [...(plan.technologyStack || []), ...items] : items,
    updatedAt: getNextUpdatedAt(plan),
  };
}

  if (change.section === 'phases') {
    const phases = asObjectArray(change.content).map(toOptimisticPhase);
    if (change.action === 'add') {
      return {
        ...plan,
        phases: [...plan.phases, ...phases],
        updatedAt: getNextUpdatedAt(plan),
      };
    }
    if (change.action === 'remove') {
      const phaseId = change.targetId;
      return phaseId ? removeOptimisticPhase(plan, phaseId) : plan;
    }
    if (change.action === 'update' && change.targetId && phases[0]) {
      return applyPhasePatch(plan, {
        phaseId: change.targetId,
        title: phases[0].title,
        goal: phases[0].goal,
        timeframe: phases[0].timeframe,
      });
    }
  }

  if (change.section === 'tasks') {
    if (change.action === 'add' && change.targetId) {
      const tasks = asObjectArray(change.content).map(toOptimisticTask);
      const resolvedPhaseId = resolvePhaseId(plan, change.targetId);
      return resolvedPhaseId
        ? tasks.reduce((nextPlan, task) => addOptimisticTask(nextPlan, resolvedPhaseId, task), plan)
        : plan;
    }
    if (change.action === 'remove' && change.targetId) {
      const taskContext = plan.phases.find((phase) => phase.tasks.some((task) => task.id === change.targetId));
      return taskContext ? removeOptimisticTask(plan, { phaseId: taskContext.id, taskId: change.targetId }) : plan;
    }
    if (change.action === 'update' && change.targetId) {
      const taskContext = plan.phases.find((phase) => phase.tasks.some((task) => task.id === change.targetId));
      const nextTask = asObjectArray(change.content)[0];
      if (!taskContext || !nextTask) return plan;
      return applyTaskPatch(plan, {
        phaseId: taskContext.id,
        taskId: change.targetId,
        updates: {
          title: typeof nextTask.title === 'string' ? nextTask.title : undefined,
          description: typeof nextTask.description === 'string' ? nextTask.description : undefined,
          owner: typeof nextTask.owner === 'string' ? nextTask.owner : undefined,
          due:
            typeof nextTask.due === 'string'
              ? nextTask.due
              : typeof nextTask.due_date === 'string'
                ? nextTask.due_date
                : undefined,
          priority:
            nextTask.priority === 'critical' || nextTask.priority === 'high' || nextTask.priority === 'medium' || nextTask.priority === 'low'
              ? nextTask.priority
              : undefined,
          acceptanceCriteria: Array.isArray(nextTask.acceptance_criteria)
            ? nextTask.acceptance_criteria.filter((item): item is string => typeof item === 'string')
            : undefined,
        },
      });
    }
  }

  if (change.section === 'gaps') {
    if (change.action === 'add' && change.targetId) {
      const gaps = asObjectArray(change.content).map(toOptimisticGap);
      return {
        ...plan,
        phases: plan.phases.map((phase) =>
          phase.id === change.targetId
            ? {
              ...phase,
              gaps: [...phase.gaps, ...gaps],
            }
            : phase
        ),
        updatedAt: getNextUpdatedAt(plan),
      };
    }
    if (change.action === 'remove' && change.targetId) {
      const gapContext = plan.phases.find((phase) => phase.gaps.some((gap) => gap.id === change.targetId));
      return gapContext ? dismissOptimisticGap(plan, { phaseId: gapContext.id, gapId: change.targetId }) : plan;
    }
  }

  if (change.section === 'risks' || change.section === 'global_risks') {
    const risks = asObjectArray(change.content).map(toOptimisticRisk);
    if (change.action === 'add') {
      return risks.reduce((nextPlan, risk) => addOptimisticRisk(nextPlan, risk), plan);
    }
    if (change.action === 'remove' && change.targetId) {
      return removeOptimisticRisk(plan, change.targetId);
    }
    if (change.action === 'update' && change.targetId && risks[0]) {
      return applyRiskPatch(plan, {
        riskId: change.targetId,
        updates: {
          description: risks[0].description,
          severity: risks[0].severity,
          mitigation: risks[0].mitigation,
        },
      });
    }
  }

  return plan;
}

export function useProjectPlan(projectId: string) {
  return useQuery({
    queryKey: projectPlanQueryKey(projectId),
    queryFn: () => defaultProjectRepository.fetchProjectPlan(projectId, sessionId.get()),
    enabled: Boolean(projectId),
  });
}

function mapProposalChange(change: ApiProposalChange): ProposedChange {
  return {
    id: change.id,
    action: change.action,
    section: change.section,
    targetId: change.targetId || '',
    title: change.title || deriveProposalTitle(change),
    detail: change.detail || change.justification || '',
    confidence: change.confidence || undefined,
    sourceQuote: change.sourceQuote || '',
    state: change.state || undefined,
    justification: change.justification || undefined,
    sourceMessageIds: change.source_message_ids || undefined,
    content: change.content,
  };
}

function withProposalChangeContent(change: ProposedChange, content: unknown): ProposedChange {
  return {
    ...change,
    content,
    title: typeof content === 'string' && content.trim() ? content : change.title,
  };
}

function deriveProposalTitle(change: ApiProposalChange): string {
  if (typeof change.content === 'string' && change.content.trim()) {
    return change.content;
  }

  if (Array.isArray(change.content) && change.content.length > 0) {
    const first = change.content[0];
    if (typeof first === 'string' && first.trim()) {
      return first;
    }
    if (first && typeof first === 'object') {
      for (const key of ['title', 'name', 'description', 'detail', 'value', 'role'] as const) {
        const derived = first[key as keyof typeof first];
        if (typeof derived === 'string' && derived.trim()) {
          return derived;
        }
      }
    }
  }

  return `${change.action} ${change.section}`.replace('_', ' ');
}

export function usePendingProjectProposal(projectId: string) {
  return useQuery({
    queryKey: projectPendingProposalQueryKey(projectId),
    queryFn: async () => {
      const response = await apiFetch<ApiEnvelope<ApiProposal | null>>(
        `/api/projects/${projectId}/plan/proposal`,
        sessionId.get()
      );
      return response.data;
    },
    enabled: Boolean(projectId),
    refetchInterval: 3000,
    select: (proposal) => ({
      proposalId: proposal?.id || null,
      changes: (proposal?.changes || []).map(mapProposalChange),
    }),
  });
}

export function useProjectPlanVersions(projectId: string) {
  return useQuery({
    queryKey: projectPlanVersionsQueryKey(projectId),
    queryFn: () => defaultProjectRepository.fetchProjectPlanVersions(projectId, sessionId.get()),
    enabled: Boolean(projectId),
  });
}

export function useUpdateProjectPlan(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planPatch: Partial<Pick<StructuredPlan, 'title' | 'description' | 'objectives' | 'stakeholders'>>) =>
      defaultProjectRepository.updateProjectPlan(projectId, planPatch, sessionId.get()),
    onMutate: (planPatch) =>
      prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => applyPlanMetaPatch(plan, planPatch)),
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSuccess: (plan) => {
      reconcileOptimisticPlanUpdate(queryClient, projectId, plan);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useAcceptProjectProposalChange(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ changeId, content }: AcceptProposalChangeInput) => {
      const response = await apiFetch<ApiEnvelope<ApiProjectPlan>>(
        `/api/projects/${projectId}/plan/proposal/changes/${changeId}/accept`,
        sessionId.get(),
        {
          method: 'PATCH',
          body: JSON.stringify({ content: content ?? null }),
        }
      );
      return mapPlan(response.data, projectId);
    },
    onMutate: async ({ changeId, content }) => {
      await queryClient.cancelQueries({ queryKey: projectPendingProposalQueryKey(projectId) });
      await queryClient.cancelQueries({ queryKey: projectPlanQueryKey(projectId) });
      const previousProposal = queryClient.getQueryData<PendingProposalView>(projectPendingProposalQueryKey(projectId));
      const previousPlan = queryClient.getQueryData<StructuredPlan>(projectPlanQueryKey(projectId));
      const acceptedChange = previousProposal?.changes.find((change) => change.id === changeId);

      if (previousProposal) {
        updateCachedProposal(queryClient, projectId, (proposal) => ({
          ...proposal,
          changes: proposal.changes.filter((change) => change.id !== changeId),
        }));
      }

      if (previousPlan && acceptedChange) {
        const nextAcceptedChange = content !== undefined
          ? withProposalChangeContent(acceptedChange, content)
          : acceptedChange;
        updateCachedPlan(queryClient, projectId, (plan) => applyAcceptedProposalChange(plan, nextAcceptedChange));
      }

      return { previousPlan, previousProposal };
    },
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
      rollbackOptimisticProposalUpdate(queryClient, projectId, context);
    },
    onSuccess: (plan) => {
      reconcileOptimisticPlanUpdate(queryClient, projectId, plan);
      void queryClient.invalidateQueries({ queryKey: projectPendingProposalQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project-ai-activity', projectId] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useRejectProjectProposalChange(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changeId: string) => {
      const response = await apiFetch<ApiEnvelope<ApiProposal>>(
        `/api/projects/${projectId}/plan/proposal/changes/${changeId}/reject`,
        sessionId.get(),
        {
          method: 'PATCH',
        }
      );
      return response.data;
    },
    onMutate: async (changeId) => {
      await queryClient.cancelQueries({ queryKey: projectPendingProposalQueryKey(projectId) });
      const previousProposal = queryClient.getQueryData<PendingProposalView>(projectPendingProposalQueryKey(projectId));

      if (previousProposal) {
        updateCachedProposal(queryClient, projectId, (proposal) => ({
          ...proposal,
          changes: proposal.changes.filter((change) => change.id !== changeId),
        }));
      }

      return { previousProposal };
    },
    onError: (_error, _variables, context) => {
      rollbackOptimisticProposalUpdate(queryClient, projectId, context);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectPendingProposalQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project-ai-activity', projectId] });
    },
  });
}

export function useApproveProjectProposal(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { changeIds: string[]; changeOverrides?: ProposalChangeOverrideInput[] }) => {
      const response = await apiFetch<ApiEnvelope<ApiProjectPlan>>(
        `/api/projects/${projectId}/plan/approve`,
        sessionId.get(),
        {
          method: 'POST',
          body: JSON.stringify({
            change_ids: payload.changeIds,
            change_overrides: payload.changeOverrides?.map((item) => ({
              change_id: item.changeId,
              content: item.content,
            })),
          }),
        }
      );
      return mapPlan(response.data, projectId);
    },
    onMutate: async ({ changeIds, changeOverrides }) => {
      await queryClient.cancelQueries({ queryKey: projectPendingProposalQueryKey(projectId) });
      await queryClient.cancelQueries({ queryKey: projectPlanQueryKey(projectId) });
      const previousProposal = queryClient.getQueryData<PendingProposalView>(projectPendingProposalQueryKey(projectId));
      const previousPlan = queryClient.getQueryData<StructuredPlan>(projectPlanQueryKey(projectId));
      const acceptedChanges = previousProposal?.changes.filter((change) => changeIds.includes(change.id)) || [];
      const overrideById = new Map((changeOverrides || []).map((item) => [item.changeId, item.content]));

      if (previousProposal) {
        const selectedIds = new Set(changeIds);
        updateCachedProposal(queryClient, projectId, (proposal) => ({
          ...proposal,
          changes: proposal.changes.filter((change) => !selectedIds.has(change.id)),
        }));
      }

      if (previousPlan && acceptedChanges.length > 0) {
        updateCachedPlan(queryClient, projectId, (plan) =>
          acceptedChanges.reduce((nextPlan, change) => {
            const overrideContent = overrideById.get(change.id);
            const nextChange = overrideContent !== undefined
              ? withProposalChangeContent(change, overrideContent)
              : change;
            return applyAcceptedProposalChange(nextPlan, nextChange);
          }, plan)
        );
      }

      return { previousPlan, previousProposal };
    },
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
      rollbackOptimisticProposalUpdate(queryClient, projectId, context);
    },
    onSuccess: (plan) => {
      reconcileOptimisticPlanUpdate(queryClient, projectId, plan);
      void queryClient.invalidateQueries({ queryKey: projectPendingProposalQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project-ai-activity', projectId] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useRevertProjectPlan(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => defaultProjectRepository.revertProjectPlan(projectId, sessionId.get()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectPlanVersionsQueryKey(projectId) });
    },
  });
}

export function useCreateProjectPhase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { title: string; goal: string; timeframe: string }) =>
      defaultProjectRepository.createProjectPhase(projectId, variables.title, variables.goal, variables.timeframe, sessionId.get()),
    onMutate: (variables) => {
      const optimisticPhase = buildOptimisticPhase(variables.title, variables.goal, variables.timeframe);
      return prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => addOptimisticPhase(plan, optimisticPhase));
    },
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useUpdateProjectPhase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { phaseId: string; title: string; goal: string; timeframe: string }) =>
      defaultProjectRepository.updateProjectPhase(projectId, variables.phaseId, variables.title, variables.goal, variables.timeframe, sessionId.get()),
    onMutate: (variables) =>
      prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => applyPhasePatch(plan, variables)),
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useDeleteProjectPhase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (phaseId: string) =>
      defaultProjectRepository.deleteProjectPhase(projectId, phaseId, sessionId.get()),
    onMutate: (phaseId) =>
      prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => removeOptimisticPhase(plan, phaseId)),
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useCreateProjectTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { phaseId: string; title: string; owner: string; due: string; priority: string }) =>
      defaultProjectRepository.createProjectTask(
        projectId,
        variables.phaseId,
        variables.title,
        variables.owner,
        variables.due,
        variables.priority,
        sessionId.get()
      ),
    onMutate: (variables) => {
      const optimisticTask = buildOptimisticTask(variables);
      return prepareOptimisticPlanUpdate(queryClient, projectId, (plan) =>
        addOptimisticTask(plan, variables.phaseId, optimisticTask)
      );
    },
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useUpdateProjectTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: {
      phaseId: string;
      taskId: string;
      updates: Partial<Pick<Task, 'title' | 'description' | 'owner' | 'due' | 'priority' | 'acceptanceCriteria'>>;
    }) =>
      defaultProjectRepository.updateProjectTask(
        projectId,
        variables.phaseId,
        variables.taskId,
        variables.updates,
        sessionId.get()
      ),
    onMutate: (variables) =>
      prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => applyTaskPatch(plan, variables)),
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useDeleteProjectTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { phaseId: string; taskId: string }) =>
      defaultProjectRepository.deleteProjectTask(projectId, variables.phaseId, variables.taskId, sessionId.get()),
    onMutate: (variables) =>
      prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => removeOptimisticTask(plan, variables)),
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useCreateProjectRisk(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { description: string; severity: string; mitigation: string }) =>
      defaultProjectRepository.createProjectRisk(
        projectId,
        variables.description,
        variables.severity,
        variables.mitigation,
        sessionId.get()
      ),
    onMutate: (variables) => {
      const optimisticRisk = buildOptimisticRisk(variables);
      return prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => addOptimisticRisk(plan, optimisticRisk));
    },
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useUpdateProjectRisk(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: {
      riskId: string;
      updates: Partial<Pick<RiskItem, 'description' | 'severity' | 'mitigation'>>;
    }) =>
      defaultProjectRepository.updateProjectRisk(projectId, variables.riskId, variables.updates, sessionId.get()),
    onMutate: (variables) =>
      prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => applyRiskPatch(plan, variables)),
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useDeleteProjectRisk(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (riskId: string) =>
      defaultProjectRepository.deleteProjectRisk(projectId, riskId, sessionId.get()),
    onMutate: (riskId) =>
      prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => removeOptimisticRisk(plan, riskId)),
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}

export function useDismissProjectGap(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { phaseId: string; gapId: string }) =>
      defaultProjectRepository.dismissProjectGap(projectId, variables.phaseId, variables.gapId, sessionId.get()),
    onMutate: (variables) =>
      prepareOptimisticPlanUpdate(queryClient, projectId, (plan) => dismissOptimisticGap(plan, variables)),
    onError: (_error, _variables, context) => {
      rollbackOptimisticPlanUpdate(queryClient, projectId, context);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectPlanQueryKey(projectId) });
    },
  });
}
