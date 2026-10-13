/**
 * Tools.ts — re-exports the tool executor and registry for backward compatibility.
 * All tool logic has moved to ToolRegistry.ts.
 */
export {
  executeTool,
  syncToolsToDatabase,
  getRegisteredTools,
  getToolDefinition,
  isToolRequiringApproval,
  registerTool,
  registerPlugin,
} from './ToolRegistry.js';
