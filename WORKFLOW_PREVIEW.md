# Curator Multi-Modal Workflow & Architecture Preview
> **Barebones Mermaid Diagrams, CoffeeScript DSL, and Execution AST**

---

## 1. Multi-Agent Interaction Sequence Shape (Mermaid Sequence Diagram)
> *Demonstrating multi-agent coordination, turn-taking, safe secret isolation, and event broadcasting in a Texas Hold'em Poker Game in Curator.*

```mermaid
sequenceDiagram
  autonumber
  actor Human as Human Player (Seat 3)
  participant Dealer as DealerAgent (Curator Core)
  participant Vault as Secret Vault (Hole Cards)
  participant Alice as PlayerAgent_Alice (Tight-Aggressive)
  participant Bob as PlayerAgent_Bob (Bluffing)
  participant Bus as Event Bus (Table Broadcaster)

  Note over Dealer: game:new_hand (Pot: 0, Blinds: 10/20)

  Dealer->>Vault: Generate & Encrypt Hole Cards for Players
  Vault-->>Alice: Private Hole Cards (As, Ks) in Isolated Sandbox
  Vault-->>Bob: Private Hole Cards (7h, 2c) in Isolated Sandbox
  Vault-->>Human: Private Hole Cards (Qd, Qs) via Secure UI

  Dealer->>Bus: Emit "table:blinds_posted" (Small: 10, Big: 20)

  Note over Dealer,Bob: Pre-Flop Betting Round
  Dealer->>Alice: Action On Alice: Call 20 or Raise?
  Alice-->>Dealer: Action: Raise to 60
  Dealer->>Bus: Emit "player:acted" (Alice, Raise, 60, Pot: 90)

  Dealer->>Bob: Action On Bob: Call 60 or Fold?
  Bob-->>Dealer: Action: Call 60
  Dealer->>Bus: Emit "player:acted" (Bob, Call, 60, Pot: 150)

  Dealer->>Human: HumanInput: Call 60, Re-Raise, or Fold?
  Human-->>Dealer: Action: Call 60
  Dealer->>Bus: Emit "player:acted" (Human, Call, 60, Pot: 210)

  Note over Dealer: Deal Flop (Community Cards: Jh, 10c, 2d)
  Dealer->>Bus: Emit "table:flop_dealt" (Cards: [Jh, 10c, 2d])

  Note over Dealer,Bob: Post-Flop Action
  Dealer->>Alice: Action On Alice: Check or Bet?
  Alice-->>Dealer: Action: Bet 100
  Dealer->>Bus: Emit "player:acted" (Alice, Bet, 100, Pot: 310)

  Dealer->>Bob: Action On Bob: Call 100 or Fold?
  Bob-->>Dealer: Action: Fold
  Dealer->>Bus: Emit "player:folded" (Bob)

  Dealer->>Human: HumanInput: Call 100, Raise, or Fold?
  Human-->>Dealer: Action: Call 100
  Dealer->>Bus: Emit "player:acted" (Human, Call, 100, Pot: 410)

  Note over Dealer: Deal Turn & River (Community: Jh, 10c, 2d, 9s, 4h)
  Dealer->>Bus: Emit "table:showdown"

  Alice->>Dealer: Reveal Hand: Straight (A-K-Q-J-10)
  Human->>Dealer: Reveal Hand: Pair of Queens (Q-Q)
  Dealer->>Dealer: Evaluate Best 5-Card Hand (Alice Wins)
  Dealer->>Alice: Award Pot: 410 Chips
  Dealer->>Bus: Emit "game:hand_complete" (Winner: Alice, Pot: 410)
```

---

## 2. AST State Machine Shape (Mermaid State Diagram)
> *State transitions and execution lifecycle for the multi-turn poker table AST workflow.*

```mermaid
stateDiagram-v2
  [*] --> TableInitializing: Start Hand

  state TableInitializing {
    direction TB
    [*] --> ShuffleDeck: tool shuffle_deck
    ShuffleDeck --> CollectBlinds: tool collect_blinds
    CollectBlinds --> DealPrivateCards: vault.deal_hole_cards [isolated secrets]
  }

  TableInitializing --> PreFlopBetting: Blinds & Hole Cards Dispatched

  state PreFlopBetting {
    direction TB
    [*] --> AliceAction: Agent Alice turn
    AliceAction --> BobAction: Agent Bob turn
    BobAction --> HumanAction: Human Seat 3 input
    HumanAction --> PotsEqualized <<choice>>
    PotsEqualized --> FlopDealing: Bets Settled
    PotsEqualized --> AliceAction: Bet Raised
  }

  PreFlopBetting --> FlopDealing: All Bets Matched

  state FlopDealing {
    direction TB
    [*] --> BurnCard: tool burn_card
    BurnCard --> RevealFlop: tool reveal_community (3 cards)
    RevealFlop --> BroadcastFlop: emit table:flop_dealt
  }

  FlopDealing --> PostFlopBetting: Flop on Board

  state PostFlopBetting {
    direction TB
    [*] --> MultiAgentTurnLoop
    state MultiAgentTurnLoop {
      [*] --> CheckFoldChoice <<choice>>
      CheckFoldChoice --> PlayerFolded: Player Folds
      CheckFoldChoice --> PlayerBet: Player Bets / Raises
      CheckFoldChoice --> PlayerChecked: Player Checks
    }
  }

  PostFlopBetting --> ShowdownResolution: River Dealt & Bets Called
  PostFlopBetting --> AwardRemainingPlayer: All Other Players Folded

  state ShowdownResolution {
    direction TB
    [*] --> RevealHands: Request hole cards decrypted
    RevealHands --> HandEvaluation: tool evaluate_hands
    HandEvaluation --> PayoutChips: tool award_pot (winner)
    PayoutChips --> EmitHandEnd: emit game:hand_complete
  }

  ShowdownResolution --> [*]: Hand Finalized
  AwardRemainingPlayer --> [*]: Uncontested Pot Awarded
```

---

## 3. Curator Prisma Database Schema (Mermaid ERD)
> *Core database entities and relationships backing Curator agent requests, execution ASTs, context state, and project scoping.*

```mermaid
erDiagram
  PROJECT ||--o{ REQUEST : scopes
  PROJECT ||--o{ RESPONSE : scopes
  PROJECT ||--o{ AGENT : contains
  PROJECT ||--o{ SCHEDULED_AGENT : contains
  PROJECT ||--o{ RESOURCE : groups
  PROJECT ||--o{ RELATION : groups

  USER ||--o{ PROJECT : owns
  USER ||--o{ CONVERSATION : initiates
  USER ||--o{ REQUEST : creates
  USER ||--o{ AGENT : owns

  CONVERSATION ||--o{ REQUEST : tracks
  CONVERSATION ||--o{ RESPONSE : records
  CONVERSATION ||--o{ EVENT_SUBSCRIPTION : listens

  REQUEST ||--o{ RESPONSE : generates
  REQUEST ||--o| REQUEST : "notifies / joins (notifyId)"

  AGENT ||--o{ AGENT_WORKFLOW : executes
  AGENT_WORKFLOW ||--o{ EVENT_SUBSCRIPTION : triggers
  AGENT_WORKFLOW ||--o{ SCHEDULED_AGENT : scheduled_by

  RESOURCE ||--o{ RELATION : "subject / predicate / object"
  RESOURCE ||--o{ ATTACHMENT : contains

  PROJECT {
    int id PK
    string name
    int userId FK
    boolean existent
    datetime createdAt
    datetime updatedAt
  }

  CONVERSATION {
    string id PK
    int userId FK
    json state "Turn state & active players"
    datetime createdAt
    datetime updatedAt
  }

  REQUEST {
    int id PK
    string status "NEW | RUNNING | COMPLETED | FAILED"
    string toolName
    int userId FK
    int projectId FK
    string conversationId FK
    json ast "Formal Execution AST (Sequence, Agent, Tool)"
    json context "Hydrated Context State (Late-bound Secrets)"
    int priority "Priority level (Interrupts = high)"
    string lockedBy
    datetime scheduledAt
    int retryCount
    int notifyId FK "Parent Join ID for Parallel/Fork"
    int pendingDependencies "Unresolved upstream blocker count"
  }

  RESPONSE {
    int id PK
    int requestId FK
    int projectId FK
    string conversationId FK
    int userId FK
    string content "Scrubbed Egress Response (Secrets Redacted)"
    datetime createdAt
  }

  AGENT {
    int id PK
    string name UK
    string description
    int userId FK
    int projectId FK
  }

  AGENT_WORKFLOW {
    int id PK
    string name UK
    string description
    json ast "Compiled Workflow AST"
    string sourceCode "CoffeeScript Source Code"
    int agentId FK
  }

  EVENT_SUBSCRIPTION {
    int id PK
    string eventName "e.g. table:action_on_player"
    int agentWorkflowId FK
    json workflowAst
    string conversationId FK
    boolean isActive
  }

  SCHEDULED_AGENT {
    int id PK
    string name
    string workflowName FK
    json workflowParams
    string schedule "Cron / Recurrence Syntax"
    boolean runOnce
    datetime runAt
    boolean isActive
  }

  RESOURCE {
    int id PK
    string uri UK
    string title
    string description
    int userId FK
    int projectId FK
  }

  RELATION {
    int id PK
    int subjectId FK
    int predicateId FK
    int objectId FK
    float literalValue
    datetime literalDate
  }
```

---

## 4. Pipeline Topology Shape (Mermaid Flowchart)
> *Topology of concurrent scanners, automated reasoning agent, and conditional release gate.*

```mermaid
flowchart TD
  assign_1["state.auditStatus = 'INITIALIZING'"]
  tool_2["fetch_repo (repo, token)"]
  fork_3{{"Fork: ConcurrentScanners"}}
  join_4{{"Join"}}

  tool_5["sast_security_scan (engine)"]
  fork_3 --> tool_5
  tool_5 --> join_4

  tool_6["dependency_audit (failOn)"]
  fork_3 --> tool_6
  tool_6 --> join_4

  tool_7["license_compliance (policy)"]
  fork_3 --> tool_7
  tool_7 --> join_4

  agent_8(["SecurityAuditorAgent (gemini-1.5-pro)"])
  if_9{"context.audit.hasCriticalVulns"}

  tool_10["create_security_incident (severity)"]
  emit_11[">Emit: incident:critical_found"]
  tool_10 --> emit_11
  if_9 -->|then| tool_10

  human_12[/"Human: Approve deployment to production cluster?"/]
  if_13{"context.humanApproved == true"}

  tool_14["deploy_production (cluster, token)"]
  emit_15[">Emit: deploy:success"]
  while_16{"while: context.healthCheckRetries < 3"}
  tool_17["ping_health_endpoint (url)"]
  while_16 -->|loop| tool_17
  tool_17 -.->|repeat| while_16
  while_16 -->|done| done_18((Done))

  tool_14 --> emit_15
  emit_15 --> while_16
  if_13 -->|then| tool_14

  tool_19["notify_aborted (reason)"]
  if_13 -->|else| tool_19

  human_12 --> if_13
  if_9 -->|else| human_12
  assign_1 --> tool_2
  tool_2 --> fork_3
  join_4 --> agent_8
  agent_8 --> if_9
```

---

## 5. Declarative Code Shape (CoffeeScript DSL)
> *Exemplifying late-binding secret verbs, multi-agent turns, human-in-the-loop gates, and event emitters.*

```coffeescript
seq "EnterpriseSecurityPipeline",
  assign "state.auditStatus", "'INITIALIZING'"

  tool "fetch_repo",
    repo: "joelarula/curator"
    token: secret "GITHUB_TOKEN"

  parallel "ConcurrentScanners",
    tool("sast_security_scan", engine: "semgrep"),
    tool("dependency_audit", failOn: "high"),
    tool("license_compliance", policy: "apache_or_mit")

  agent
    agentName: "SecurityAuditorAgent"
    model: "gemini-1.5-pro"
    prompt: "Synthesize scanner findings and assign threat level"

  if_else "context.audit.hasCriticalVulns",
    seq "IncidentHandling",
      tool("create_security_incident", severity: "P1"),
      emit_event("incident:critical_found", incidentId: "SEC-101")

    seq "ReleaseGate",
      humanInput("Approve deployment to production cluster?", "choices", ["approve", "reject"]),
      if_else "context.humanApproved == true",
        seq "ProductionRollout",
          tool("deploy_production", cluster: "us-east-prod", token: secret "KUBE_TOKEN"),
          emit_event("deploy:success"),
          while_loop "context.healthCheckRetries < 3",
            tool("ping_health_endpoint", url: "https://api.curator.arula.dev/healthz")
        tool("notify_aborted", reason: "User rejected release")
```

---

## 6. Formal Execution AST JSON
> *The exact AST persisted in the `Request.ast` column and executed recursively by `CuratorRequestProcessor`.*

```json
{
  "type": "Curator_Sequential",
  "name": "EnterpriseSecurityPipeline",
  "subAgents": [
    {
      "type": "Curator_Assign",
      "key": "state.auditStatus",
      "expression": "'INITIALIZING'"
    },
    {
      "type": "Curator_Tool",
      "toolName": "fetch_repo",
      "args": {
        "repo": "joelarula/curator",
        "token": "$secret:GITHUB_TOKEN"
      }
    },
    {
      "type": "Curator_Parallel",
      "name": "ConcurrentScanners",
      "subAgents": [
        { "type": "Curator_Tool", "toolName": "sast_security_scan", "args": { "engine": "semgrep" } },
        { "type": "Curator_Tool", "toolName": "dependency_audit", "args": { "failOn": "high" } },
        { "type": "Curator_Tool", "toolName": "license_compliance", "args": { "policy": "apache_or_mit" } }
      ]
    },
    {
      "type": "Curator_Agent",
      "agentName": "SecurityAuditorAgent",
      "model": "gemini-1.5-pro",
      "prompt": "Synthesize scanner findings and assign threat level"
    },
    {
      "type": "Curator_IfElse",
      "condition": "context.audit.hasCriticalVulns",
      "thenBranch": {
        "type": "Curator_Sequential",
        "name": "IncidentHandling",
        "subAgents": [
          { "type": "Curator_Tool", "toolName": "create_security_incident", "args": { "severity": "P1" } },
          { "type": "Curator_EmitEvent", "eventName": "incident:critical_found", "payload": { "incidentId": "SEC-101" } }
        ]
      },
      "elseBranch": {
        "type": "Curator_Sequential",
        "name": "ReleaseGate",
        "subAgents": [
          {
            "type": "Curator_HumanInput",
            "prompt": "Approve deployment to production cluster?",
            "inputType": "choices",
            "choices": ["approve", "reject"]
          },
          {
            "type": "Curator_IfElse",
            "condition": "context.humanApproved == true",
            "thenBranch": {
              "type": "Curator_Sequential",
              "name": "ProductionRollout",
              "subAgents": [
                {
                  "type": "Curator_Tool",
                  "toolName": "deploy_production",
                  "args": { "cluster": "us-east-prod", "token": "$secret:KUBE_TOKEN" }
                },
                { "type": "Curator_EmitEvent", "eventName": "deploy:success" },
                {
                  "type": "Curator_While",
                  "condition": "context.healthCheckRetries < 3",
                  "body": {
                    "type": "Curator_Tool",
                    "toolName": "ping_health_endpoint",
                    "args": { "url": "https://api.curator.arula.dev/healthz" }
                  }
                }
              ]
            },
            "elseBranch": {
              "type": "Curator_Tool",
              "toolName": "notify_aborted",
              "args": { "reason": "User rejected release" }
            }
          }
        ]
      }
    }
  ]
}
```
