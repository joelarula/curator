import CuratorConsole from './CuratorConsole.vue';
import CuratorHarness from './CuratorHarness.vue';

export { CuratorConsole, CuratorHarness };
export default CuratorConsole;
export * from './types';
export * from './context';
export * from './graphqlOperations';
export * from './components';
export {
  useRunTimeline,
  applyProgressEvent,
  createRunTimeline,
  summarizeRun,
  isRunDone,
  runDurationMs,
  type RunTimeline,
  type RunStep,
  type RunStepState,
  type RunToolCall,
  type RunTimelineHandle,
  type ProgressSubscribe,
} from './composables/useRunTimeline';
export { useInterrupts, type InterruptsHandle, type HarnessToolRunner } from './composables/useInterrupts';
export { useChoices, type ChoicesHandle, type ChoiceSource, type SetChoicesOptions } from './composables/useChoices';
export {
  useMessageActions,
  messageActionArgs,
  type MessageActionsHandle,
  type HarnessMessageRef,
  type MessageActionTool,
} from './composables/useMessageActions';
export {
  schemaField,
  schemaFields,
  isFormSchema,
  formatFieldValue,
  parseFieldInput,
  type SchemaField,
  type SchemaFieldKind,
} from './composables/useSchemaForm';
export {
  usePluginConfig,
  type PluginConfigHandle,
  type ConfigNamespaceView,
  type ConfigKeyView,
  type ConfigScope,
} from './composables/usePluginConfig';
export { useSurfaces, type SurfacesHandle, type SurfaceEntry, type ShowSurfaceOptions } from './composables/useSurfaces';
export { renderMarkdown, renderMermaid, isAllowedImageSource, sandboxDocument } from './composables/richText';
