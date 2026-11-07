Phase 1: CI/CD Pipeline & Supply Chain Hardening
Implement Automated CycloneDX SBOM Generation

Integrate syft or trivy into the CI build step for all in-house applications.

Auto-export CycloneDX JSON/XML artifacts on every pipeline run.

Setup Dependency & Model Provenance Scanning

Connect SBOM output to OWASP Dependency-Track to flag vulnerable packages.

Add automated checks verifying model weight hashes (sha256) and pinned Hugging Face revision IDs for any local or hosted model weights.

Enforce Static Code Analysis for Vibe-Coded / AI-Generated Code

Add Semgrep / SonarQube blocking security gates on all pull requests.

Configure rules specifically targeting hardcoded credentials, insecure regex, dynamic code execution (eval, exec), and unsafe deserialization.

Phase 2: Runtime Guardrails & Application Boundaries [Implemented in Curator Core]
Deploy Deterministic Ingress Filters

- [x] Add schema validation (`input_schema`), input truncation (`CURATOR_MAX_PROMPT_CHARS`), control-char stripping, and regex filters to all prompt-handling endpoints prior to model invocation (`GuardrailService.inspectPromptIngress` in `curator/src/services/GuardrailService.ts`, wired into `agentNode`).

- [x] Set up prompt injection checks (`GuardrailService.validatePromptSync` with MITRE ATLAS `AML.T0051` delimiter/override signatures + pluggable `IGuardrailProvider` / `CURATOR_GUARDRAIL_URL` for Llama Guard, NeMo Guardrails, or Promptfoo evaluation suites).

Secure Agentic & Model Context Protocol (MCP) Tool Calling

- [x] Strip raw text execution permissions from all agent-callable tools (`GuardrailService.isRawExecutionTool` in `agentNode` and `createMcpPlugin`, tagged `AML.T0040`).

- [x] Enforce strict, typed JSON schemas for all tool parameters (`GuardrailService.validateToolParameters` via Ajv in `agentNode`, `toolNode`, and `createMcpPlugin`).

- [x] Isolate agent tool execution to network-restricted, timeout-bounded sandboxes (`vm.createContext` with `codeGeneration: { strings: false, wasm: false }`, `timeout: 5000`, and network disabled by default).

Implement Egress & Output Sanitization

- [x] Put automatic PII/PCI-DSS redaction (`GuardrailService.redactPiiAndPci` + `SecretService.mask` via `GuardrailService.sanitizeModelOutput`: Luhn-validated PCI-DSS PANs, SSNs, cloud keys, JWTs, PEM keys, and configurable email/phone redaction) on all model response streams and tool outputs.

- [x] Treat all model output as untrusted user input: enforce HTML/SQL/Shell escaping (`GuardrailService.escapeHtml`, `stripUnsafeHtml`, `escapeShellArg`, `escapeSqlLiteral`, `escapeSqlIdentifier`) before output touches any downstream database, frontend, or internal API.

Phase 3: Infrastructure Hardening & Least-Privilege IAM [Implemented in Curator Core & Docker]
Isolate Model Serving & Vector Infrastructure

- [x] Audit network egress for self-hosted LLM endpoints and vector stores (`GuardrailService.validateEndpointUrl` in `OpenAiCompatibleLlmProvider` and `AnthropicLlmProvider` blocking cloud metadata SSRF and enforcing `CURATOR_ALLOWED_LLM_HOSTS`); restrict network access strictly to internal bridge subnets (`internal_llm_net` with `internal: true` in `llamacpp/docker-compose.yml` and `127.0.0.1` port bindings).

- [x] Run containerized inference engines (`llamacpp/Dockerfile`, `curator-rust/Dockerfile`, `docker-compose.yml`) as non-root users (`10001:10001`) with read-only root filesystems (`read_only: true`), dropped capabilities (`cap_drop: [ALL]`), and disabled privilege escalation (`no-new-privileges:true`).

Enforce Scoped, Short-Lived Secrets for AI Agents

- [x] Remove static API keys from configuration files and code repositories (`SecretService.getMasterKey` uses `CURATOR_SECRET_KEY` or per-process CSPRNG instead of static fallback strings).

- [x] Migrate to dynamic short-lived tokens per agent session (`SecretService.registerEphemeralSecret` with TTL and agent/conversation/project scope enforcement + pluggable `ISecretVaultProvider` for HashiCorp Vault / IAM / Workload Identity Federation).

Phase 4: SOC Telemetry & MITRE ATLAS Observability
Standardize AI Tracing via OpenTelemetry / OpenInference

Instrument applications to log trace IDs across prompts, retrieved vector context chunks, tool invocations, and completions.

Ensure user PII is scrubbed before traces are written to persistent storage.

Map Security Events to MITRE ATLAS Tags

Tag security logs with ATLAS techniques (e.g., AML.T0051 for prompt injection attempts, AML.T0054 for unsafe output drops, AML.T0040 for anomalous tool invocation).

Ship structured JSON logs directly into the centralized SIEM/Elastic cluster for SOC ingestion.

Phase 5: Automated Testing & Compliance Artifacts
Add Automated Red-Teaming to Test Suites

Add promptfoo or giskard test cases to CI pipelines to evaluate prompt injection resilience and hallucination thresholds on every release.

Establish minimum pass/fail thresholds required to merge to main.

Generate Standardized SECURITY_MODEL_CARD.md Files

Commit a security and compliance card to the root of each AI-enabled repo.

Document data sources, EU AI Act risk tiers (Minimal vs. High Risk), permitted/prohibited use cases, and human-in-the-loop fallback procedures.