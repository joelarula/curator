# Curator Scripting Language Reference

Curator scripts allow you to compose multi-agent interactions, tool execution pipelines, and deterministic state machines using expressive **CoffeeScript** or **TypeScript**. 

Scripts compile deterministically into a formal **Curator AST** (`CuratorAstNode`) that guarantees atomic state persistence, turn audit logging, and capability safety.

---

## 1. Flow Control & Pipeline Primitives

| Composable | Description | CoffeeScript Syntax |
| :--- | :--- | :--- |
| `seq` | Executes child steps sequentially. | `seq 'name', step1, step2` |
| `parallel` | Executes child steps concurrently. | `parallel 'name', step1, step2` |
| `if_else` | Branches execution based on context condition. | `if_else '$context.score > 50', thenStep, elseStep` |
| `while_loop` | Loops until context condition evaluates to false. | `while_loop '$context.turn <= 5', loopBody` |
| `for_each` | Iterates over an array in `$context`. | `for_each '$context.items', (item) -> process(item)` |
| `set_state` | Updates variables in `$context` and commits to DB. | `set_state turn: '$context.turn + 1', score: 100` |
| `assign` | Sets a single key in `$context`. | `assign 'activeUser', '$context.author'` |
| `tool` | Calls a registered tool by name with arguments. | `tool 'fetch_profile', userId: 42` |
| `prompt` | Halts workflow to request human-in-the-loop input. | `prompt 'Approve invoice?', 'choices', ['Yes', 'No']` |

---

## 2. Universal Speech Acts (Illocutionary Pragmatics)

Curator models communication using formal Speech Act theory. Every communication turn produces an audited `agent:message` event with a typed illocutionary force:

```coffeescript
# 1. QUERY: Ask an agent a question and wait for the reply
ask to: '@role:analyst', query: 'What is the projected ARR?', as: 'arr_result'

# 2. PROPOSE: Submit a proposal or patch to a forum or agent
propose in_forum: 'rfc_room', topic: 'RFC-42', patch: { diff: 'fix' }

# 3. INFORM: Share factual state without requiring an action
inform to: 'monitoring_dashboard', topic: 'telemetry:cpu', payload: { load: 0.82 }

# 4. VOTE: Cast a formal vote on an active proposal
vote in_forum: 'rfc_room', topic: 'RFC-42', choice: 'ACCEPT'

# 5. SYNTHESIZE: Conciliate debate or summarize quorum decision
synthesize in_forum: 'rfc_room', topic: 'RFC-42', summary: 'Approved unanimously'

# 6. ASSERT: Assert a factual claim or valuation about private state
claim declaration: 'three_aces', rank: 'A', count: 3

# 7. BROADCAST: Publish to all listeners on a public topic
broadcast topic: 'system:shutdown_warning', minutesRemaining: 5
```

---

## 3. Discourse Topologies & Governance

### Bilateral Dialogue (1:1)
Managed via `dialog(targetUri)` for back-and-forth conversational exchanges:
```coffeescript
dialog('@role:architect')
  .say('Can we review the data migration script?')
  .wait_reply('architect_reply')
  .say('Thanks, applying the suggested indexes now.')
```

### Multilateral Forum (M:N)
Managed via `forum(roomUri)` for group deliberation, proposal submission, voting, and consensus:
```coffeescript
forum('architecture_committee')
  .as_role('engineer')
  .say('Submitting proposal for microservices split.')
  .propose(topic: 'split_v2', service: 'billing')
  .as_role('lead')
  .call_vote(topic: 'split_v2', quorum: 0.66)
  .vote(as_role: 'engineer', choice: 'ACCEPT')
  .vote(as_role: 'lead', choice: 'ACCEPT')
  .synthesize(as_role: 'lead', summary: 'Billing service extraction approved')
```

---

## 4. Classical Discourse Forms

For advanced multi-agent patterns, Curator provides first-class discourse structures:

| Pattern | Communicative Nature | Example Syntax |
| :--- | :--- | :--- |
| `soliloquy` | Internal monologue/reflection (hidden from peers) | `soliloquy 'I suspect agent Bob is bluffing with two high cards.'` |
| `monologue` | Narrative broadcast to all observers | `monologue 'quarterly_report', 'Q3 results exceeded revenue targets.'` |
| `trialogue` | Tripartite debate between three specific agents | `trialogue 'agentA', 'agentB', 'Should we migrate to MariaDB?'` |
| `catechism` | Structured Socratic question-and-answer cycle | `catechism '@role:tutor', question: 'What is a B-Tree?'` |
| `dialectic` | Thesis vs. Antithesis synthesis loop | `dialectic thesis: 'Monolith first', antithesis: 'Microservices'` |
| `apostrophe` | Addressed to an absent or abstract entity | `apostrophe 'LegacyV1System', 'You served us well, but retirement is nigh.'` |

---

## 5. Conversational Roles (`as_role`)

Curator strictly separates **conversational roles** from **database permission roles (RBAC)**:
- RBAC roles (`admin`, `agent`, `guest`) govern database and tool execution boundaries.
- Conversational roles (`proposer`, `critic`, `dealer`, `player`) are scoped dynamically to the interaction room $G$:

```coffeescript
as_role 'proposer', ->
  propose topic: 'RFC-42', patch: { diff: 'fix' }

as_role 'critic', ->
  say 'The implementation lacks unit test coverage.'

as_role 'proposer', ->
  say 'Added 3 unit tests in packages/host/test/.'
```

---

## 6. Dynamic Capability Leases

Agents can dynamically grant and revoke tool execution permissions during runtime:

```coffeescript
# Grant temporary permission to run the payment tool for 10 minutes
grant_lease tool: 'process_payment', to: 'agent_checkout', duration: '10m', maxCalls: 5

# Revoke lease immediately upon task completion
revoke_lease tool: 'process_payment', from: 'agent_checkout'
```

---

## 7. Tabletop & Card Game State Machine DSL

When using the `@curator/plugin-tabletop` plugin, you gain access to the **Universal Game Phase Matrix**, which formalizes gameplay across card, board, and social deduction games into 5 universal communicative phases:

| Phase | Fundamental Question | Player Agency | Typical Communicative Turn | Canonical Speech Acts |
| :--- | :--- | :--- | :--- | :--- |
| **1. Initialization** | *"Who is in, and at what cost?"* | **Binary / Contractual** | Commit stake, make bid, post blinds, declare intent | `REQUEST`, `PROPOSE` |
| **2. Allocation** | *"What hand did fate deal?"* | **Passive reception** | Receive private / public state, turn up starter card | `INFORM` |
| **3. Interaction** | *"How do I leverage, bluff, or optimize?"* | **High strategic choice** | Bet, Fold, Hit, Stand, Swap, Lead, Play card, Challenge | `REQUEST`, `PROPOSE`, `ASSERT`, `VOTE` |
| **4. Verification** | *"Whose assertion was valid?"* | **Revealing truth** | Show cards, challenge claim, evaluate hand rankings | `SYNTHESIZE`, `INFORM` |
| **5. Settlement** | *"Who owns the consequences?"* | **Passive accounting** | Award pot, tally points, check elimination, rotate roles | `INFORM` |

### Scripting with the Universal Matrix
```coffeescript
# Phase 1: Initialization ("Who is in, and at what cost?")
# Phase 2: Allocation ("What hand did fate deal?")
# Phase 3: Interaction ("How do I leverage, bluff, or optimize?")
# Phase 4: Verification ("Whose assertion was valid?")
# Phase 5: Settlement ("Who owns the consequences?")

game('high_stakes_poker')
  .ante(blinds: { sb: 10, bb: 20 })
  .deal_private(to_role: 'sb', count: 2)
  .deal_private(to_role: 'bb', count: 2)
  .wager(as_role: 'sb', action: 'raise', amount: 50)
  .call(as_role: 'bb')
  .deal_public(count: 3, cards: ['Kh', 'Qd', '10s'])
  .wager(as_role: 'bb', action: 'check')
  .showdown(evaluator: 'eval_poker')
  .settlement(winner: 'sb', pot: 120, rotateDealer: true)
```

---

## 8. Extending Vocabulary in Plugins & MiniApps

MiniApps can register their own custom CoffeeScript verbs without touching Curator Core:

```typescript
import { extendCoffeeAstVerbs, vocabularyRegistry } from '@curator/agent-server';

// Register custom domain verbs
vocabularyRegistry.registerMany({
  launch_satellite: (satelliteId: string) => ({
    type: 'Curator_Tool',
    toolName: 'launch_satellite_tool',
    toolArgs: { satelliteId },
  }),
});
```
Then in scripts:
```coffeescript
seq 'space_mission',
  launch_satellite 'Hubble-2'
  wait_event 'orbit_stabilized'
```
