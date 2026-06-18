import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { defaultProjectRepository } from '../../stores/project/repository';
import { sessionId } from '../../stores/project/session';
import type { GapItem, Phase, RiskItem, StructuredPlan, Task } from '../../stores/project/types';

const projectPlanQueryKey = (projectId: string) => ['project-plan', projectId] as const;
const projectPlanVersionsQueryKey = (projectId: string) => ['project-plan-versions', projectId] as const;

interface OptimisticPlanContext {
  previousPlan?: StructuredPlan;
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

export function useProjectPlan(projectId: string) {
  return useQuery({
    queryKey: projectPlanQueryKey(projectId),
    queryFn: () => defaultProjectRepository.fetchProjectPlan(projectId, sessionId.get()),
    enabled: Boolean(projectId),
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
