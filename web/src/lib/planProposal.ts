import type { ProposedChange } from '../stores/project/types';

type ProposalObject = Record<string, unknown>;

export interface ProposalTaskPreviewItem {
  title: string;
  owner?: string;
  due?: string;
  priority?: string;
  description?: string;
  acceptanceCriteria: string[];
}

export interface ProposalRiskPreviewItem {
  description: string;
  severity?: string;
  mitigation?: string;
}

export interface ProposalPhasePreviewItem {
  key: string;
  title: string;
  goal?: string;
  description?: string;
  timeframe?: string;
  sourceQuote?: string;
  change: ProposedChange;
}

function asObjectArray(value: unknown): ProposalObject[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is ProposalObject => typeof item === 'object' && item !== null);
  }
  if (typeof value === 'object' && value !== null) {
    return [value as ProposalObject];
  }
  return [];
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  return [];
}

function readFirstString(entry: ProposalObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = entry[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return undefined;
}

function normalizePhaseReference(value: string): string {
  return value.trim().toLowerCase().replaceAll('_', ' ').split(/\s+/).filter(Boolean).join(' ');
}

export function getProposalTaskPreviewItems(change: ProposedChange): ProposalTaskPreviewItem[] {
  const objectEntries = asObjectArray(change.content);
  if (objectEntries.length > 0) {
    return objectEntries.map((entry) => ({
      title: readFirstString(entry, ['title', 'name', 'description', 'detail', 'value']) || change.title || 'Proposed task',
      owner: readFirstString(entry, ['owner']),
      due: readFirstString(entry, ['due', 'due_date']),
      priority: readFirstString(entry, ['priority']),
      description: readFirstString(entry, ['description', 'detail', 'value']),
      acceptanceCriteria: [
        ...asStringArray(entry.acceptance_criteria),
        ...asStringArray(entry.acceptanceCriteria),
      ],
    }));
  }

  const stringEntries = asStringArray(change.content);
  if (stringEntries.length > 0) {
    return [
      {
        title: change.title || 'Proposed task',
        acceptanceCriteria: stringEntries,
      },
    ];
  }

  return [
    {
      title: change.title || 'Proposed task',
      acceptanceCriteria: [],
    },
  ];
}

export function getProposalRiskPreviewItems(change: ProposedChange): ProposalRiskPreviewItem[] {
  const entries = asObjectArray(change.content);
  if (entries.length === 0) {
    return [
      {
        description: change.title || 'Proposed risk',
      },
    ];
  }

  return entries.map((entry) => ({
    description: readFirstString(entry, ['description', 'title', 'value', 'detail']) || change.title || 'Proposed risk',
    severity: readFirstString(entry, ['severity']),
    mitigation: readFirstString(entry, ['mitigation', 'value']),
  }));
}

export function getProposalPhasePreviewItems(changes: ProposedChange[]): ProposalPhasePreviewItem[] {
  let previewIndex = 0;

  return changes.flatMap((change) => {
    const entries = asObjectArray(change.content);
    const fallbackEntries = entries.length > 0 ? entries : [{}];

    return fallbackEntries.map((entry) => {
      const item: ProposalPhasePreviewItem = {
        key: String(previewIndex++),
        title: readFirstString(entry, ['title']) || change.title || 'Proposed phase',
        goal: readFirstString(entry, ['goal', 'detail']),
        description: readFirstString(entry, ['description', 'value']),
        timeframe: readFirstString(entry, ['timeframe']),
        sourceQuote: change.sourceQuote || '',
        change,
      };
      return item;
    });
  });
}

export function matchesPhaseTarget(
  targetId: string,
  phase: { id?: string; title: string },
  phaseIndex?: number
): boolean {
  const normalizedTarget = normalizePhaseReference(targetId);
  return (
    targetId === phase.id ||
    normalizedTarget === normalizePhaseReference(phase.title) ||
    (typeof phaseIndex === 'number' && targetId === String(phaseIndex))
  );
}
