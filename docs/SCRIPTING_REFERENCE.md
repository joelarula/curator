# Curator Scripting Language Reference & Tutorial

Curator scripts allow you to compose multi-agent interactions, tool execution pipelines, and deterministic state machines using expressive **CoffeeScript** or **TypeScript**. 

Scripts compile deterministically into a formal **Curator AST** (`CuratorAstNode`) that guarantees atomic state persistence, turn audit logging, and capability safety.

---

## Table of Contents
1. [Flow Control & Pipeline Primitives](#1-flow-control--pipeline-primitives)
2. [Universal Speech Acts (Illocutionary Pragmatics)](#2-universal-speech-acts-illocutionary-pragmatics)
3. [Discourse Topologies & Governance (Bilateral & Multilateral)](#3-discourse-topologies--governance)
4. [Classical Discourse Forms (Soliloquy, Monologue, Dialectic, Catechism)](#4-classical-discourse-forms)
5. [Conversational Roles vs. Permission Roles (`as_role`)](#5-conversational-roles-as_role)
6. [Dynamic Capability Leases](#6-dynamic-capability-leases)
7. [Tabletop & Card Game State Machine DSL (Universal 5-Phase Matrix)](#7-tabletop--card-game-state-machine-dsl)
8. [Extending Vocabulary in Plugins & MiniApps](#8-extending-vocabulary-in-plugins--miniapps)
9. [Ritual, Drama & Swarm Agency: Making Swarms Act](#9-ritual-drama--swarm-agency-making-swarms-act)

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

### Multilateral Forum (M:N): Real-Time Dynamic Deliberation

In real-world multi-agent systems, agents generate speech acts asynchronously in real time. The canonical Curator expression defines the **governance protocol, decision gates, and voting quorum**, while querying autonomous agents dynamically via `ask`:

```coffeescript
seq 'engineering_rfc_deliberation',
  # 1. Proposer drafts the proposal dynamically
  ask to: '@role:proposer', query: 'Draft RFC-101 for vector indexing', as: 'proposal'
  propose in_forum: 'engineering_rfc_room', topic: 'RFC-101', patch: '$context.proposal'

  # 2. Critic reviews and responds in real-time
  ask to: '@role:critic', query: 'Critique proposal: $context.proposal', as: 'critique'
  inform in_forum: 'engineering_rfc_room', payload: '$context.critique'

  # 3. Conditional rebuttal: if Critic raised concerns, allow Proposer 1 revision
  if_else '$context.critique.hasObjections',
    seq 'revision_round',
      ask to: '@role:proposer', query: 'Address critique: $context.critique', as: 'revision'
      inform in_forum: 'engineering_rfc_room', payload: '$context.revision'

  # 4. Solicit votes concurrently from the committee
  parallel 'voting_round',
    ask to: '@role:critic', query: 'Cast vote on RFC-101: $context.proposal', as: 'vote_critic'
    ask to: '@role:proposer', query: 'Cast vote on RFC-101: $context.proposal', as: 'vote_proposer'

  # 5. Chair synthesizes the outcome from actual votes
  ask to: '@role:chair', query: 'Synthesize consensus from $context.vote_critic and $context.vote_proposer', as: 'verdict'
  synthesize in_forum: 'engineering_rfc_room', summary: '$context.verdict'
```

For test fixtures, room governance setup, or replaying deterministic transcripts:
```coffeescript
forum('architecture_committee')
  .join(role: 'engineer')
  .propose(title: 'Adopt OPFS SQLite', body: { threads: 1 })
  .await_quorum(targetVotes: 2)
  .synthesize(summary: 'Approved unanimously')
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

---

## 9. Ritual, Drama & Swarm Agency: Making Swarms Act

In Curator, the boundary between **communication**, **acting**, and **ritual** is the core architectural engine that allows an autonomous multi-agent swarm to execute real-world force without collapsing into chaos or hallucination:

```
      [ COMMUNICATION ]
     (Locutionary Bits)
    "The data, the text"
            ▲
            │ 
            │ Encapsulated by Speech Acts
            ▼
        [ ACTING ] ─────────────────────────► [ RITUAL ]
   (Illocutionary Deeds)                    (Sacred Invariant Order)
  "To speak is to mutate"               "The rules of the magic circle"
  (PROPOSE, VOTE, ASSERT)                (AST, Phases, Quorum, Collapse)
```

### The 4 Convergence Points in Curator Core

1. **The Room as the Magic Circle (Spatial Boundary)**:
   Outside a ritual room, saying *"I bet 100"* or *"I approve RFC-101"* is noise. Inside `forum('engineering_rfc_room')` or `game('table_01')`, the utterance is bounded by the room: visibility is partitioned, turns are audited in the ledger, and legitimate peers are bound.
2. **Roles as Masks / *Dramatis Personae* (Actor Boundary)**:
   Curator strictly decouples RBAC identity from conversational roles (`as_role 'critic'`). An agent dons a mask within the ritual space. The role dictates floor rights, obligations, and valid speech acts.
3. **Speech Acts as Illocutionary Invocations (Linguistic Boundary)**:
   Agents never emit unconstrained strings. Every utterance is an illocutionary deed (`PROPOSE`, `VOTE`, `ASSERT`, `SYNTHESIZE`) that mutates the shared environment.
4. **The Execution AST as Liturgy (Temporal Invariant Boundary)**:
   The AST (`seq`, `while_loop`, `if_else`, `wait_event`) guarantees the invariant order of operations. Agents improvise *what* they say (cognition), but the AST strictly dictates *when* they say it and *how* consensus collapses into action.

### The Formula for Swarm Agency

$$\text{Swarm Agency} = \text{The Room (Magic Circle)} + \text{Roles (Personae)} + \text{Speech Acts (Illocutionary Force)} + \text{The Execution AST (Liturgy)}$$

---

### The Three Swarm Liturgical Archetypes

#### 1. Archetype A: The Agora (Deliberative Quorum Ritual)
*Best for: Architecture councils, security triage, code reviews, multi-agent governance.*

```coffeescript
seq 'swarm_rfc_ritual',
  # Step 1: Evocation of the Proposal
  ask to: '@role:author', query: 'Formulate proposal for vector indexing', as: 'proposal'
  propose in_forum: 'council_chamber', topic: 'ARCH-42', patch: '$context.proposal'

  # Step 2: The Ordeal / Trial (Concurrent Cross-Role Scrutiny)
  parallel 'swarm_scrutiny',
    ask to: '@role:security_auditor', query: 'Attack surface audit of $context.proposal', as: 'critique_sec'
    ask to: '@role:perf_engineer', query: 'Benchmark scalability of $context.proposal', as: 'critique_perf'
    ask to: '@role:finance_officer', query: 'Audit infrastructure cost of $context.proposal', as: 'critique_cost'

  # Step 3: The Gathering of Ballots
  parallel 'ballot_casting',
    for_each '$context.council_members', (agent) ->
      ask to: agent, query: 'Cast ACCEPT or REJECT on ARCH-42 with rationale', as: 'ballot'

  # Step 4: The Sacred Collapse (Synthesis & Execution)
  synthesize in_forum: 'council_chamber', summary: '$context.ballots'
  
  if_else '$context.ballots.accepted == true',
    tool 'deploy_infrastructure', patch: '$context.proposal'
```

#### 2. Archetype B: The Magic Circle (The Market / Auction Swarm)
*Best for: Dynamic task allocation, resource pricing, contractor bidding.*

```coffeescript
seq 'swarm_task_auction',
  # Phase 1: Ante (Escrow stakes to enter task arena)
  for_each '$context.worker_swarm', (worker) ->
    tool 'escrow_stake', agent: worker, amount: 10

  # Phase 2: Allocation (Secret sealed bid submission)
  parallel 'collect_sealed_bids',
    for_each '$context.worker_swarm', (worker) ->
      ask to: worker, query: 'Submit secret cost and latency bid', as: 'sealed_bid'

  # Phase 3 & 4: Verification (Showdown & Deterministic Evaluation)
  tool 'eval_vickrey_auction', bids: '$context.sealed_bids', as: 'auction_result'

  # Phase 5: Settlement & Dynamic Lease Bestowal
  grant_lease tool: 'execute_heavy_job', to: '$context.auction_result.winner', duration: '1h'
  tool 'refund_losing_stakes', losers: '$context.auction_result.losers'
```

#### 3. Archetype C: The Dialectic (Truth-Seeking Synthesis)
*Best for: Fact-checking, thesis reconciliation, intelligence synthesis.*

```coffeescript
seq 'dialectic_truth_ritual',
  # Thesis
  ask to: '@role:thesis_advocate', query: 'Argue proposition X', as: 'thesis'
  
  # Antithesis
  ask to: '@role:antithesis_advocate', query: 'Refute proposition X given $context.thesis', as: 'antithesis'
  
  # Synthesis
  ask to: '@role:hegelian_arbiter', 
    query: 'Reconcile tension between $context.thesis and $context.antithesis into a higher synthesis', 
    as: 'synthesis'
    
  inform to: 'public_knowledge_base', payload: '$context.synthesis'
```
