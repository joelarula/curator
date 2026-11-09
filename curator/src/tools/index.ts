import { web_scraper, web_scrape } from './web_scraper.js';
import { browser_fetch } from './browser_fetch.js';
import { schedule_agent } from './schedule_agent.js';
import { cancel_scheduled_agent } from './cancel_scheduled_agent.js';
import { userSpeech } from './userSpeechTool.js';
import {
  managementTools,
  list_agents,
  upsert_agent,
  delete_agent,
  grant_agent_role,
  revoke_agent_role,
  list_scripts,
  get_script,
  upsert_script,
  promote_script_version,
  delete_script,
  list_projects,
  upsert_project,
  delete_project,
} from './management.js';
import {
  shapeTools,
  list_shapes,
  upsert_shape_entity,
  get_shape_entity,
  delete_shape_entity,
} from './shapes.js';
import {
  resourceTools,
  search_resources,
  upsert_resource,
  get_resource,
  delete_resource,
  upsert_text,
  delete_text,
  upsert_relation,
  delete_relation,
} from './resources.js';
import { interruptTools, conversation_interrupts, conversation_resume } from './interrupts.js';
import type { CuratorTool } from './CuratorTool.js';

export {
  web_scraper,
  web_scrape,
  browser_fetch,
  schedule_agent,
  cancel_scheduled_agent,
  userSpeech,
  // Management tools
  list_agents,
  upsert_agent,
  delete_agent,
  grant_agent_role,
  revoke_agent_role,
  list_scripts,
  get_script,
  upsert_script,
  promote_script_version,
  delete_script,
  list_projects,
  upsert_project,
  delete_project,
  // Shape tools
  list_shapes,
  upsert_shape_entity,
  get_shape_entity,
  delete_shape_entity,
  // Resource tools
  search_resources,
  upsert_resource,
  get_resource,
  delete_resource,
  upsert_text,
  delete_text,
  upsert_relation,
  delete_relation,
  // Interrupt tools
  conversation_interrupts,
  conversation_resume,
};

export const toolRegistry: Record<string, CuratorTool> = {
  web_scraper,
  web_scrape,
  browser_fetch,
  schedule_agent,
  cancel_scheduled_agent,
  userSpeech,
  ...(managementTools as Record<string, CuratorTool>),
  ...(shapeTools as Record<string, CuratorTool>),
  ...(resourceTools as Record<string, CuratorTool>),
  ...(interruptTools as Record<string, CuratorTool>),
};
