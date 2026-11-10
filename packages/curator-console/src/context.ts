import { inject, provide, type InjectionKey, type Ref, type ComputedRef } from 'vue';
import type { ChoiceItem } from './components/harness/HarnessChoices.vue';
import type { TurnHistoryEntry } from './components/harness/HarnessOutput.vue';
import type { RunTimeline } from './composables/useRunTimeline';
import type { InterruptsHandle } from './composables/useInterrupts';
import type { HarnessMessageRef, MessageActionsHandle } from './composables/useMessageActions';
import type { SurfacesHandle } from './composables/useSurfaces';
import type { CommandCatalogHandle } from './composables/useCommandCatalog';
import type { AttachmentsHandle } from './composables/useAttachments';
import type { SourcesHandle } from './composables/useSources';
import type { PromptLibraryHandle } from './composables/usePromptLibrary';
import type { ConversationsHandle } from './composables/useConversations';
import type {
  HarnessLayoutMode,
  HarnessResourceViewMode,
  HarnessResourceItem,
  HarnessUiSurface,
  HarnessUploadedFile,
} from './types';

export interface CuratorHarnessContext {
  // Catalogs & Engine
  agents: Ref<any[]>;
  tools: Ref<any[]>;
  workflowPresetItems: { title: string; value: string }[];
  isPaused: Ref<boolean>;

  // Layout & UI Surface State
  layoutMode: Ref<HarnessLayoutMode>;
  uiSurface: Ref<HarnessUiSurface | null>;
  worktableSurface: Ref<HarnessUiSurface | null>;
  resourceViewMode: Ref<HarnessResourceViewMode>;
  resourceSearchQuery: Ref<string>;
  resourceCategoryFilter: Ref<string>;
  resourceAuthorFilter: Ref<string>;
  resourcePublishedFilter: Ref<'all' | 'published' | 'draft'>;
  selectedResourceKeys: Ref<string[]>;
  activeResourceDetail: Ref<HarnessResourceItem | null>;
  customComponents: Record<string, any>;

  // File Upload State
  pendingUploadFiles: Ref<HarnessUploadedFile[]>;
  uploadingFiles: Ref<boolean>;

  // OpPrompt State
  /** The agent prompt, or the CoffeeScript editor opened from the workflow studio. */
  execMode: Ref<'agent' | 'workflow'>;
  closeWorkflowEditor: () => void;
  selectedAgent: Ref<string>;
  selectedWorkflowPreset: Ref<string>;
  promptInput: Ref<string>;
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
  /** Current (or last) turn's run, folded from `curator:progress` (see useRunTimeline). */
  runTimeline: Ref<RunTimeline | null>;
  /** Open interrupts (cards and interrupt choices); answer with `interrupts.resume(id, value)`. */
  interrupts: InterruptsHandle;
  /** Result surfaces of this session and the one the panel shows. */
  surfaces: SurfacesHandle;
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
  outputTab: Ref<'surface' | 'formatted' | 'json' | 'history'>;
  turnHistory: Ref<TurnHistoryEntry[]>;

  // Program Commands & Context Menu State
  contextMenuVisible: Ref<boolean>;
  contextMenuX: Ref<number>;
  contextMenuY: Ref<number>;

  // Resource Contextual Menu State (Close by Resource)
  resourceContextMenuVisible: Ref<boolean>;
  resourceContextMenuX: Ref<number>;
  resourceContextMenuY: Ref<number>;
  resourceContextMenuTarget: Ref<HarnessResourceItem | null>;

  // Actions
  executeOpPrompt: () => Promise<void>;
  submitChoice: () => Promise<void>;
  clearChoices: () => void;
  clearPrompt: () => void;
  navigateHistory: (direction: number) => void;
  loadTurn: (turn: TurnHistoryEntry) => void;
  openContextMenu: (e: MouseEvent) => void;
  /** Opens the context menu on a message (its message actions first). */
  openTurnMenu: (e: MouseEvent, message: HarnessMessageRef) => void;
  /** The message the context menu was opened on (null for the Commands menu). */
  contextMenuTurn: Ref<HarnessMessageRef | null>;
  messageActions: MessageActionsHandle;
  runMessageAction: (tool: any) => Promise<void>;
  /** Commands, tools, choices and agents for `/` and `@` (and the context menu). */
  commandCatalog: CommandCatalogHandle;
  /** `#` attachments: resource suggestions and the chips sent with the next turn. */
  attachments: AttachmentsHandle;
  /** Source chips of the latest answer (tool calls of its run, attached resources). */
  sources: SourcesHandle;
  /** Prompt library entries offered after `/` (saved and MCP prompts). */
  promptLibrary: PromptLibraryHandle;
  /** The caller's conversations (organisation tools). */
  conversations: ConversationsHandle;
  /** Tool waiting for its required arguments (composer form), and the form's values. */
  toolFormTarget: Ref<any | null>;
  toolFormArgs: Ref<Record<string, unknown>>;
  submitToolForm: () => Promise<void>;
  selectChoiceFromMenu: (val: string) => void;
  switchAgentFromMenu: (agentName: string) => void;
  insertToolCommand: (tool: any) => void;
  executeCommand: (cmd: string) => Promise<void>;
  focusPrompt: () => void;

  // Resource & Upload Actions
  showResourcesSurface: (filters?: Record<string, any>) => Promise<void>;
  openResourceDetail: (item: HarnessResourceItem) => Promise<void>;
  openResourceContextMenu: (e: MouseEvent, item: HarnessResourceItem) => void;
  handleResourceAction: (action: string, item: HarnessResourceItem, payload?: any) => Promise<void>;
  handleBulkResourceAction: (action: string, keys: string[], payload?: any) => Promise<void>;
  uploadFilesToStorage: (files: FileList | File[], bucket?: string) => Promise<HarnessUploadedFile[]>;
  removePendingUploadFile: (index: number) => void;
}

export const HARNESS_CONTEXT_KEY: InjectionKey<CuratorHarnessContext> = Symbol('CuratorHarnessContext');

export function provideHarnessContext(ctx: CuratorHarnessContext): void {
  provide(HARNESS_CONTEXT_KEY, ctx);
}

export function useHarnessContext(): CuratorHarnessContext | null {
  return inject(HARNESS_CONTEXT_KEY, null);
}
