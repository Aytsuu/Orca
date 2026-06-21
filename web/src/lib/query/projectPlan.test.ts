import { describe, expect, it } from 'vitest';

import type { StructuredPlan } from '../../stores/project/types';
import {
  addOptimisticPhase,
  addOptimisticRisk,
  addOptimisticTask,
  applyAcceptedProposalChange,
  applyPhasePatch,
  applyPlanMetaPatch,
  applyRiskPatch,
  applyTaskPatch,
  buildOptimisticPhase,
  buildOptimisticRisk,
  buildOptimisticTask,
  dismissOptimisticGap,
  removeOptimisticPhase,
  removeOptimisticRisk,
  removeOptimisticTask,
} from './projectPlan';

function createPlanFixture(): StructuredPlan {
  return {
    id: 'plan_1',
    projectId: 'proj_1',
    title: 'Initial',
    description: 'Draft',
    status: 'draft',
    version: 1,
    createdAt: '2026-06-18T10:00:00.000Z',
    updatedAt: '2026-06-18T10:00:00.000Z',
    objectives: ['Ship MVP'],
    technologyStack: [],
    phases: [
      {
        id: 'phase_1',
        title: 'Phase 1',
        goal: 'Launch',
        description: 'High-level phase overview',
        timeframe: 'Week 1',
        assignedMembers: [],
        tasks: [
          {
            id: 'task_1',
            title: 'Existing task',
            description: 'Original',
            acceptanceCriteria: ['done'],
            owner: 'Alex',
            due: '2026-06-20',
            priority: 'medium',
            status: 'accepted',
            attachments: [],
            sourceMessageIds: [],
            confidence: 'high',
          },
        ],
        gaps: [
          {
            id: 'gap_1',
            description: 'Missing owner',
            severity: 'minor',
            sourceMessageIds: [],
          },
        ],
      },
    ],
    globalRisks: [
      {
        id: 'risk_1',
        description: 'Budget risk',
        severity: 'major',
        mitigation: 'Track weekly',
        sourceMessageIds: [],
      },
    ],
  };
}

describe('projectPlan optimistic helpers', () => {
  it('applies a plan meta patch immutably', () => {
    const plan = createPlanFixture();

    const updated = applyPlanMetaPatch(plan, { title: 'Orca', description: 'Updated' });

    expect(updated.title).toBe('Orca');
    expect(updated.description).toBe('Updated');
    expect(updated.objectives).toEqual(plan.objectives);
    expect(updated).not.toBe(plan);
  });

  it('builds and adds an optimistic phase', () => {
    const plan = createPlanFixture();
    const phase = buildOptimisticPhase('Phase 2', 'High-level delivery overview', 'Scale', 'Week 2', []);

    const updated = addOptimisticPhase(plan, phase);

    expect(phase.id).toMatch(/^optimistic:phase:/);
    expect(updated.phases.at(-1)).toEqual(phase);
    expect(updated.phases).toHaveLength(2);
  });

  it('updates and removes a phase immutably', () => {
    const plan = createPlanFixture();

    const patched = applyPhasePatch(plan, {
      phaseId: 'phase_1',
      title: 'Phase One',
      description: 'Updated overview',
      goal: 'Ship',
      timeframe: 'Week 3',
      assignedMembers: [{ sessionId: 'sam', name: 'Sam', initials: 'S', role: 'VIEWER' }],
    });
    const removed = removeOptimisticPhase(plan, 'phase_1');

    expect(patched.phases[0]).toMatchObject({
      id: 'phase_1',
      title: 'Phase One',
      description: 'Updated overview',
      goal: 'Ship',
      timeframe: 'Week 3',
      assignedMembers: [{ sessionId: 'sam', name: 'Sam', initials: 'S', role: 'VIEWER' }],
    });
    expect(removed.phases).toEqual([]);
  });

  it('builds, adds, updates, and removes an optimistic task', () => {
    const plan = createPlanFixture();
    const task = buildOptimisticTask({
      title: 'New task',
      owner: 'Sam',
      due: '2026-06-22',
      priority: 'high',
    });

    const added = addOptimisticTask(plan, 'phase_1', task);
    const updated = applyTaskPatch(added, {
      phaseId: 'phase_1',
      taskId: task.id,
      updates: { title: 'Retitled', acceptanceCriteria: ['a', 'b'] },
    });
    const removed = removeOptimisticTask(added, { phaseId: 'phase_1', taskId: task.id });

    expect(task.id).toMatch(/^optimistic:task:/);
    expect(added.phases[0].tasks.at(-1)).toMatchObject({
      title: 'New task',
      owner: 'Sam',
      priority: 'high',
      isNew: true,
    });
    expect(updated.phases[0].tasks.at(-1)).toMatchObject({
      title: 'Retitled',
      acceptanceCriteria: ['a', 'b'],
      isModified: true,
    });
    expect(removed.phases[0].tasks).toHaveLength(1);
  });

  it('builds, adds, updates, and removes an optimistic risk', () => {
    const plan = createPlanFixture();
    const risk = buildOptimisticRisk({
      description: 'New risk',
      severity: 'critical',
      mitigation: 'Escalate',
    });

    const added = addOptimisticRisk(plan, risk);
    const updated = applyRiskPatch(added, {
      riskId: risk.id,
      updates: { mitigation: 'Mitigated' },
    });
    const removed = removeOptimisticRisk(added, risk.id);

    expect(risk.id).toMatch(/^optimistic:risk:/);
    expect(added.globalRisks.at(-1)).toMatchObject({
      description: 'New risk',
      severity: 'critical',
    });
    expect(updated.globalRisks.at(-1)?.mitigation).toBe('Mitigated');
    expect(removed.globalRisks).toHaveLength(1);
  });

  it('dismisses a gap from the targeted phase only', () => {
    const plan = createPlanFixture();

    const updated = dismissOptimisticGap(plan, { phaseId: 'phase_1', gapId: 'gap_1' });

    expect(updated.phases[0].gaps).toEqual([]);
    expect(plan.phases[0].gaps).toHaveLength(1);
  });

  it('optimistically applies accepted proposal meta changes', () => {
    const plan = createPlanFixture();

    const updatedObjectives = applyAcceptedProposalChange(plan, {
      id: 'change_1',
      action: 'update',
      section: 'objectives',
      targetId: '',
      title: 'Updated objectives',
      detail: '',
      sourceQuote: '',
      content: ['Expand into bakery'],
    });
    const updatedDescription = applyAcceptedProposalChange(plan, {
      id: 'change_2',
      action: 'update',
      section: 'description',
      targetId: '',
      title: 'Updated description',
      detail: '',
      sourceQuote: '',
      content: 'New project description',
    });

    expect(updatedObjectives.objectives).toEqual(['Expand into bakery']);
    expect(updatedDescription.description).toBe('New project description');
  });

  it('coerces object-style objective proposal content into strings', () => {
    const plan = createPlanFixture();

    const updated = applyAcceptedProposalChange(plan, {
      id: 'change_objective_goal',
      action: 'add',
      section: 'objectives',
      targetId: '',
      title: 'Objective update',
      detail: '',
      sourceQuote: '',
      content: [
        {
          goal: 'Enhance team productivity through intelligent conversation monitoring and structured plan generation.',
        },
      ],
    });

    expect(updated.objectives).toEqual([
      'Ship MVP',
      'Enhance team productivity through intelligent conversation monitoring and structured plan generation.',
    ]);
  });

  it('optimistically applies accepted technology stack changes', () => {
    const plan = createPlanFixture();

    const updated = applyAcceptedProposalChange(plan, {
      id: 'change_2b',
      action: 'add',
      section: 'technology_stack',
      targetId: '',
      title: 'Technology Stack',
      detail: '',
      sourceQuote: '',
      content: [
        { title: 'Astro + React', value: 'Frontend' },
        { title: 'FastAPI', value: 'Backend' },
      ],
    });

    expect(updated.technologyStack).toEqual([
      { title: 'Astro + React', value: 'Frontend' },
      { title: 'FastAPI', value: 'Backend' },
    ]);
  });

  it('optimistically applies accepted proposal structural changes', () => {
    const plan = createPlanFixture();

    const phaseAdded = applyAcceptedProposalChange(plan, {
      id: 'change_3',
      action: 'add',
      section: 'phases',
      targetId: '',
      title: 'Phase 2',
      detail: '',
      sourceQuote: '',
      content: [{ title: 'Phase 2', goal: 'Scale', timeframe: 'Week 2' }],
    });

    const taskAdded = applyAcceptedProposalChange(plan, {
      id: 'change_4',
      action: 'add',
      section: 'tasks',
      targetId: 'phase_1',
      title: 'New task',
      detail: '',
      sourceQuote: '',
      content: [{ title: 'New task', owner: 'Sam', priority: 'high' }],
    });

    const riskAdded = applyAcceptedProposalChange(plan, {
      id: 'change_5',
      action: 'add',
      section: 'global_risks',
      targetId: '',
      title: 'Supply risk',
      detail: '',
      sourceQuote: '',
      content: [{ title: 'Supply risk', severity: 'major' }],
    });

    expect(phaseAdded.phases).toHaveLength(2);
    expect(phaseAdded.phases[1]).toMatchObject({ title: 'Phase 2', goal: 'Scale', assignedMembers: [] });
    expect(taskAdded.phases[0].tasks).toHaveLength(2);
    expect(taskAdded.phases[0].tasks[1]).toMatchObject({ title: 'New task', owner: 'Sam' });
    expect(riskAdded.globalRisks).toHaveLength(2);
    expect(riskAdded.globalRisks[1]).toMatchObject({ description: 'Supply risk', severity: 'major' });
  });

  it('applies task additions when the proposal targets a phase title path', () => {
    const plan = {
      ...createPlanFixture(),
      phases: [
        {
          ...createPlanFixture().phases[0],
          id: 'phase_1',
          title: 'Discovery',
          tasks: [],
        },
      ],
    };

    const updated = applyAcceptedProposalChange(plan, {
      id: 'change_6',
      action: 'add',
      section: 'tasks',
      targetId: 'Discovery',
      title: 'Setup environment',
      detail: '',
      sourceQuote: '',
      content: [{ title: 'Setup environment', owner: 'Sam', priority: 'high' }],
    });

    expect(updated.phases[0].tasks).toHaveLength(1);
    expect(updated.phases[0].tasks[0]).toMatchObject({ title: 'Setup environment' });
  });

  it('maps task value to description if description is not set when applying proposal task additions', () => {
    const plan = createPlanFixture();
    const updated = applyAcceptedProposalChange(plan, {
      id: 'change_value_test',
      action: 'add',
      section: 'tasks',
      targetId: 'phase_1',
      title: 'New task with value',
      detail: '',
      sourceQuote: '',
      content: [{ title: 'New task with value', value: 'Task description from value attribute' }],
    });

    expect(updated.phases[0].tasks).toHaveLength(2);
    expect(updated.phases[0].tasks[1].description).toBe('Task description from value attribute');
  });

  it('maps phase value to description if description is not set when applying proposal phase additions', () => {
    const plan = createPlanFixture();
    const updated = applyAcceptedProposalChange(plan, {
      id: 'change_phase_value_test',
      action: 'add',
      section: 'phases',
      targetId: '',
      title: 'New phase with value',
      detail: '',
      sourceQuote: '',
      content: [{ title: 'New phase with value', value: 'Phase description from value attribute' }],
    });

    expect(updated.phases).toHaveLength(2);
    expect(updated.phases[1].description).toBe('Phase description from value attribute');
  });
});
