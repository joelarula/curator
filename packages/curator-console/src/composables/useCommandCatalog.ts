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
  { name: 'save-prompt', source: 'command', description: 'Save the prompt text to the project prompt library', icon: 'mdi-content-save-outline' },
];

/**
 * Harness verbs that need a role-controlled host action (server `allowedActions`). The others only change the
 * viewer's screen or the engine state and need none.
 */
export const HARNESS_COMMAND_ACTIONS: Readonly<Record<string, string>> = {
  status: 'db.status',
  export: 'db.export',
};

/** Harness verbs that run a tool: offered only when the user may run it (the tool list is filtered by role). */
export const HARNESS_COMMAND_TOOLS: Readonly<Record<string, string>> = {
  'save-prompt': 'prompt_save',
};

export interface CommandCatalogSources {
  tools: Ref<any[]>;
  agents: Ref<any[]>;
  choices: Ref<Array<{ label: string; value: string; action?: string }>>;
  /** Host actions the caller may perform; commands that need another one are left out (allow-list). */
  allowedActions?: Ref<string[]>;
  /** `#` suggestions: resources found for the current query (`source: 'resource'`). */
  resources?: Ref<CommandDescriptor[]>;
  /** Prompt library entries (`source: 'prompt'`), offered after `/`. */
  prompts?: Ref<CommandDescriptor[]>;
}

/**
 * Whether a harness verb may be offered: its host action (if any) is allowed, and its tool (if any) is one the user
 * may run (`toolNames`; omitted = not checked).
 */
export function isCommandAllowed(name: string, allowedActions: readonly string[], toolNames?: readonly string[]): boolean {
  const action = HARNESS_COMMAND_ACTIONS[name];
  if (action && !allowedActions.includes(action)) return false;
  const tool = HARNESS_COMMAND_TOOLS[name];
  return !tool || !toolNames || toolNames.includes(tool);
}

/**
 * One command list for the composer (`/` and `@`), the context menu and (by shape) the CLI: harness verbs, tools,
 * current choices and agents, as `CommandDescriptor`s from `@curator/host/contracts`.
 */
export function useCommandCatalog(sources: CommandCatalogSources) {
  const catalog = computed<CommandDescriptor[]>(() => [
    ...HARNESS_COMMANDS.filter((c) =>
      isCommandAllowed(c.name, sources.allowedActions?.value ?? [], sources.tools.value.map((t: any) => t?.name))
    ),
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
    ...(sources.prompts?.value ?? []),
    ...(sources.resources?.value ?? []),
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
