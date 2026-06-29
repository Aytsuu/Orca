import { describe, expect, it } from 'vitest';

import { filterSlashCommands, type SlashCommandOption } from './SlashCommandPicker';

const COMMANDS: SlashCommandOption[] = [
  {
    name: 'analyze',
    description: 'Run the AI pipeline for this project.',
    usage: '/analyze [optional note]',
  },
  {
    name: 'status',
    description: 'Show the current Orca agent statuses.',
    usage: '/status',
  },
];

describe('SlashCommandPicker helpers', () => {
  it('returns every command when the user only typed slash', () => {
    expect(filterSlashCommands(COMMANDS, '/')).toEqual(COMMANDS);
  });

  it('filters commands by the typed slash prefix', () => {
    expect(filterSlashCommands(COMMANDS, '/an')).toEqual([COMMANDS[0]]);
    expect(filterSlashCommands(COMMANDS, '/sta')).toEqual([COMMANDS[1]]);
  });

  it('returns no commands for non-slash input', () => {
    expect(filterSlashCommands(COMMANDS, 'status')).toEqual([]);
  });
});
