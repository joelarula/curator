# Targeted Testing & Long Command Policy

Always follow these rules to maintain developer velocity and prevent unnecessary latency:

## 1. Focus on Targeted Testing Over Full Suites
- **Never run full test suites (`npm test`, multi-suite integration runners) after simple changes**: Full suites spin up multiple servers, WebSockets, background workers, and simulate full hands, taking 60–90+ seconds.
- **Fast Static Verification First**: Use fast compilation and type-checking (`tsc` / `tsc --noEmit`, taking ~2-3s) to verify contracts and syntax safety.
- **Targeted Execution**: Verify runtime behavior using targeted one-shot commands (e.g. running the specific file, invoking a specific CLI action like `node src/cli.ts seed`, or inspecting SQLite records directly in ~200ms).

## 2. Always Ask User Before Running Potentially Long Commands
- If a command, script, build, or test run is expected or likely to take more than ~15 seconds, **always ask the user first** before executing it.
- Explain what the command does and why it is suggested, allowing the user to decide whether to run it themselves in their own terminal or skip it, avoiding wasting agent execution time.
