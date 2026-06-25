import type { CuratorSequentialNode, CuratorInterruptNode } from '../src/engine/CuratorAst.js';

/**
 * Demonstrates Play / Pause / Stop interrupt patterns.
 * 
 * The workflow:
 *   1. Start a long 3-step sequence (each step scheduled 2s apart)
 *   2. At t=0, immediately inject a PAUSE interrupt — the sequence freezes
 *   3. The pause handler runs a "status check" agent
 *   4. After the handler, inject a PLAY to resume — all 3 steps continue
 */
export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Play-Pause-Stop Demo',
    subAgents: [
      // ── Normal workflow: 3 steps, spaced 2s apart ──────────────────────
      {
        type: 'Curator_Agent',
        prompt: 'Step 1: Count to 3.',
        priority: 0
      },
      {
        type: 'Curator_Agent',
        prompt: 'Step 2: Describe the color blue in one sentence.',
        priority: 0,
        scheduledAt: 'in 2 seconds'
      },
      {
        type: 'Curator_Agent',
        prompt: 'Step 3: Say goodbye.',
        priority: 0,
        scheduledAt: 'in 4 seconds'
      },

      // ── PAUSE interrupt fires immediately (priority 50) ─────────────────
      // This suspends steps 2 & 3 (they are still NEW/pending with priority 0)
      {
        type: 'Curator_Interrupt',
        mode: 'pause',
        priority: 50,
        cancelBelowPriority: 50,
        handler: {
          type: 'Curator_Agent',
          prompt: 'PAUSED: Perform a quick status check. Say "Status OK, resuming..."',
          priority: 50,
          exclude_from_history: true
        }
        // After the handler completes, steps 2 & 3 are still PAUSED.
        // A subsequent PLAY interrupt (or external API call) can resume them.
      } as CuratorInterruptNode
    ]
  };
}
