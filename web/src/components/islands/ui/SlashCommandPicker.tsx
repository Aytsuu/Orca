import React from 'react';

export interface SlashCommandOption {
  name: string;
  description: string;
  usage: string;
}

export function filterSlashCommands(
  commands: SlashCommandOption[],
  input: string
): SlashCommandOption[] {
  const normalized = input.trimStart();
  if (!normalized.startsWith('/')) {
    return [];
  }

  const query = normalized.slice(1).toLowerCase();
  if (!query) {
    return commands;
  }

  return commands.filter((command) => command.name.toLowerCase().startsWith(query));
}

interface SlashCommandPickerProps {
  commands: SlashCommandOption[];
  query: string;
  isVisible: boolean;
  isLoading?: boolean;
  onSelect: (command: SlashCommandOption) => void;
}

export const SlashCommandPicker: React.FC<SlashCommandPickerProps> = ({
  commands,
  query,
  isVisible,
  isLoading = false,
  onSelect,
}) => {
  if (!isVisible) {
    return null;
  }

  const filteredCommands = filterSlashCommands(commands, query);

  return (
    <div className="mb-3 rounded-xl border border-border-subtle bg-surface-raised shadow-lg overflow-hidden">
      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted border-b border-border-subtle">
        Slash Commands
      </div>
      {isLoading ? (
        <div className="px-4 py-3 text-sm text-text-muted">Loading commands...</div>
      ) : filteredCommands.length === 0 ? (
        <div className="px-4 py-3 text-sm text-text-muted">No matching commands.</div>
      ) : (
        <div className="flex flex-col">
          {filteredCommands.map((command) => (
            <button
              key={command.name}
              type="button"
              onClick={() => onSelect(command)}
              className="px-4 py-3 text-left hover:bg-background/70 transition-colors border-t border-border-subtle first:border-t-0"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-text-primary">{command.usage}</span>
                <span className="text-[11px] text-text-muted">Tab to fill</span>
              </div>
              <div className="mt-1 text-xs text-text-secondary">{command.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SlashCommandPicker;
