import { defineService } from '@curator/agent-server';
import type { CuratorHost } from './types.js';

/**
 * The running host as a service: node handlers, maintenance systems and tools reach it with
 * `ctx.service(CuratorHostService)` (tools: `ctx.tryService?.(CuratorHostService)`, absent for local calls).
 */
export const CuratorHostService = defineService<CuratorHost>('curator.host');
