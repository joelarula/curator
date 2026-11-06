import { inject, provide, type InjectionKey, type Ref, type ComputedRef } from 'vue';
import type { ChoiceItem } from './components/harness/HarnessChoices.vue';
import type { TurnHistoryEntry } from './components/harness/HarnessOutput.vue';

export interface CuratorHarnessContext {
  // Catalogs & Engine
  agents: Ref<any[]>;
  tools: Ref<any[]>;
  workflowPresetItems: { title: string; value: string }[];
  isPaused: Ref<boolean>;

  // OpPrompt State
  execMode: Ref<'agent' | 'tool' | 'workflow'>;
  selectedAgent: Ref<string>;
  selectedTool: Ref<string>;
  selectedWorkflowPreset: Ref<string>;
  promptInput: Ref<string>;
  toolArgsInput: Ref<string>;
  workflowInput: Ref<string>;
  userContextName: Ref<string>;
  conversationContextId: Ref<string>;
  promptHistory: Ref<string[]>;
  promptHistoryIndex: Ref<number>;

  // Dynamic AST Workflow Choices State
  choicesDisplayMode: Ref<'radio' | 'checkbox' | 'chips'>;
  selectedRadioChoice: Ref<string | null>;
  selectedCheckboxes: Ref<string[]>;
  selectedChipChoice: Ref<string | null>;
  availableChoices: Ref<ChoiceItem[]>;
  workflowChoicePrompt: Ref<string>;
  workflowWaitingRequestId: Ref<string | null>;
  activeChoiceValue: ComputedRef<any>;

  // Execution & Live Output State
  executing: Ref<boolean>;
  liveStepMessage: Ref<string | null>;
  lastExecChoice: Ref<any | null>;
  lastExecStatus: Ref<string | null>;
  lastExecDuration: Ref<number | null>;
  lastExecRequestId: Ref<string | null>;
  lastExecTarget: Ref<string | null>;
  lastExecMode: Ref<string | null>;
  lastExecOutput: Ref<string | null>;
  lastExecResponses: Ref<Array<{ content: string }>>;
  lastExecRaw: Ref<any | null>;
  lastExecError: Ref<string | null>;
  outputTab: Ref<'formatted' | 'json' | 'history'>;
  turnHistory: Ref<TurnHistoryEntry[]>;

  // Program Commands & Context Menu State
  contextMenuVisible: Ref<boolean>;
  contextMenuX: Ref<number>;
  contextMenuY: Ref<number>;

  // Actions
  executeOpPrompt: () => Promise<void>;
  submitChoice: () => Promise<void>;
  clearChoices: () => void;
  clearPrompt: () => void;
  navigateHistory: (direction: number) => void;
  loadTurn: (turn: TurnHistoryEntry) => void;
  openContextMenu: (e: MouseEvent) => void;
  selectChoiceFromMenu: (val: string) => void;
  switchAgentFromMenu: (agentName: string) => void;
  insertToolCommand: (tool: any) => void;
  executeCommand: (cmd: string) => Promise<void>;
  focusPrompt: () => void;
}

export const HARNESS_CONTEXT_KEY: InjectionKey<CuratorHarnessContext> = Symbol('CuratorHarnessContext');

export function provideHarnessContext(ctx: CuratorHarnessContext): void {
  provide(HARNESS_CONTEXT_KEY, ctx);
}

export function useHarnessContext(): CuratorHarnessContext | null {
  return inject(HARNESS_CONTEXT_KEY, null);
}

