import { computed, type Ref } from 'vue';
import { findComposerTrigger, matchCommands, toolUsage, type CommandDescriptor, type ComposerTrigger } from '@curator/host/contracts';

/** Harness verbs (handled by `executeCommand('/name')`), same vocabulary style as the CLI's commands. */
export const HARNESS_COMMANDS: readonly CommandDescriptor[] = [
  { name: 'resources', source: 'command', description: 'Show app resources (grid | list)', icon: 'mdi-view-grid-outline', aliases: ['res'] },
  { name: 'layout', source: 'command', description: 'Toggle stack / 2-column worktable', icon: 'mdi-view-split-vertical' },
  { name: 'status', source: 'command', description: 'Inspect engine and database', icon: 'mdi-information-outline' },
  { name: 'pause', source: 'command', description: 'Pause / resume the engine', icon: 'mdi-pause', aliases: ['resume'] },
  { name: 'workflow', source: 'command', description: 'CoffeeScript workflow studio', icon: 'mdi-coffee' },
  { name: 'export', source: 'command', description: 'Export the SQLite database', icon: 'mdi-download' },
  { name: 'clear', source: 'command', description: 'Clear prompt and turn output', icon: 'mdi-eraser' },
];

export interface CommandCatalogSources {
  tools: Ref<any[]>;
  agents: Ref<any[]>;
  choices: Ref<Array<{ label: string; value: string; action?: string }>>;
}

/**
 * One command list for the composer (`/` and `@`), the context menu and (by shape) the CLI: harness verbs, tools,
 * current choices and agents, as `CommandDescriptor`s from `@curator/host/contracts`.
 */
export function useCommandCatalog(sources: CommandCatalogSources) {
  const catalog = computed<CommandDescriptor[]>(() => [
    ...HARNESS_COMMANDS,
    ...sources.tools.value.map((t: any) => ({
      name: t.name,
      source: 'tool' as const,
      description: t.description,
      parameters: t.parameters,
      usage: toolUsage(t),
      icon: 'mdi-wrench-outline',
    })),
    ...sources.choices.value.map((c, i) => ({
      name: String(i + 1),
      source: 'choice' as const,
      title: c.label,
      aliases: [String(c.value).toLowerCase()],
      value: c.value,
      icon: 'mdi-checkbox-blank-circle-outline',
    })),
    ...sources.agents.value.map((a: any) => ({
      name: a.name,
      source: 'agent' as const,
      title: a.title && a.title !== a.name ? a.title : undefined,
      description: a.description,
      icon: a.icon || 'mdi-robot-outline',
    })),
  ]);

  /** The trigger at the cursor and its suggestions (empty when nothing is being typed after `/` or `@`). */
  function suggest(text: string, cursor: number, limit = 8): { trigger: ComposerTrigger | null; items: CommandDescriptor[] } {
    const trigger = findComposerTrigger(text, cursor);
    return { trigger, items: trigger ? matchCommands(catalog.value, trigger.trigger, trigger.query, limit) : [] };
  }

  const commands = computed(() => catalog.value.filter((e) => e.source === 'command'));

  return { catalog, commands, suggest };
}

export type CommandCatalogHandle = ReturnType<typeof useCommandCatalog>;
