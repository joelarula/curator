import { Curator } from '../src/services/Curator.js';

console.log("Scheduling a task for 10 seconds from now...");

Curator
    .wait(10)
    .ask_llm({ prompt: "What time is it in 10 seconds?" })
    .onSuccess().upsert_resource({ uri: "scheduled:result", title: "Scheduled Result" });

console.log("Task scheduled. Run 'npx tsx src/bin/Curator.ts scripts/test_schedule.ts' to test.");
