import { describe, expect, it } from 'vitest';

import type { ProposedChange } from '../stores/project/types';
import {
  getProposalPhasePreviewItems,
  getProposalRiskPreviewItems,
  getProposalTaskPreviewItems,
  matchesPhaseTarget,
} from './planProposal';

function createChange(overrides: Partial<ProposedChange>): ProposedChange {
  return {
    id: 'change-1',
    action: 'add',
    section: 'tasks',
    targetId: '',
    title: 'Fallback title',
    detail: '',
    sourceQuote: '',
    ...overrides,
  };
}

describe('planProposal helpers', () => {
  it('preserves distinct risk titles in multi-item global risk proposals', () => {
    const items = getProposalRiskPreviewItems(
      createChange({
        section: 'global_risks',
        title: 'Data Privacy Concerns',
        content: [
          { title: 'Data Privacy Concerns', value: 'Monitoring conversations requires consent.' },
          { title: 'AI Bias and Accuracy', value: 'Training bias can produce flawed outputs.' },
          { title: 'User Adoption and Trust', value: 'Users may resist intrusive monitoring.' },
        ],
      })
    );

    expect(items.map((item) => item.description)).toEqual([
      'Data Privacy Concerns',
      'AI Bias and Accuracy',
      'User Adoption and Trust',
    ]);
  });

  it('treats string-array task content as acceptance criteria for one preview row', () => {
    const items = getProposalTaskPreviewItems(
      createChange({
        title: 'Develop a messaging app for team productivity',
        content: [
          'Core messaging features are implemented.',
          'User authentication and profile management are in place.',
        ],
      })
    );

    expect(items).toEqual([
      {
        title: 'Develop a messaging app for team productivity',
        acceptanceCriteria: [
          'Core messaging features are implemented.',
          'User authentication and profile management are in place.',
        ],
      },
    ]);
  });

  it('matches task proposals to phases by id, normalized title, or preview index', () => {
    expect(matchesPhaseTarget('phase_1', { id: 'phase_1', title: 'Phase 1' }, 0)).toBe(true);
    expect(matchesPhaseTarget('phase 1', { id: 'phase_1', title: 'Phase_1' }, 0)).toBe(true);
    expect(matchesPhaseTarget('0', { id: 'phase_1', title: 'Phase 1' }, 0)).toBe(true);
    expect(matchesPhaseTarget('1', { id: 'phase_1', title: 'Phase 1' }, 0)).toBe(false);
  });

  it('builds preview phase keys that task changes can target by index', () => {
    const items = getProposalPhasePreviewItems([
      createChange({
        id: 'phase-change',
        section: 'phases',
        content: [
          { title: 'Phase 1: Core Messaging App Development' },
          { title: 'Phase 2: AI Integration and Feature Development' },
        ],
      }),
    ]);

    expect(items.map((item) => ({ key: item.key, title: item.title }))).toEqual([
      { key: '0', title: 'Phase 1: Core Messaging App Development' },
      { key: '1', title: 'Phase 2: AI Integration and Feature Development' },
    ]);
  });
});
