import { describe, expect, it } from 'vitest';

import { mapActivitySuggestion } from './projectAiActivity';

describe('mapActivitySuggestion', () => {
  it('marks proposal change task suggestions as non-actionable in AI activity', () => {
    const suggestion = mapActivitySuggestion({
      id: 'planner-change-1',
      artifact_id: 'artifact-1',
      agent: 'planner',
      kind: 'proposal_change',
      title: 'Add rollout phase',
      detail: 'Create a rollout phase covering deployment and validation.',
      actionable: true,
      created_at: '2026-06-20T00:00:00Z',
    });

    expect(suggestion).toEqual({
      id: 'planner-change-1',
      type: 'TASK',
      content: 'Create a rollout phase covering deployment and validation.',
      actionable: false,
      agent: 'planner',
    });
  });
});
