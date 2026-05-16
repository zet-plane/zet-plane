/// <reference types="node" />
/// node --env-file=.env --experimental-strip-types scripts/langsmith-trace-export.ts <trace-id>
/// pnpm trace-export <trace-id>
import { Client } from "langsmith";
import * as fs from "fs";

const apiKey = process.env.LANGSMITH_API_KEY;
if (!apiKey) throw new Error("LANGSMITH_API_KEY not set in .env");

const client = new Client({ apiKey });

async function listRecentRuns(projectName: string, limit = 10) {
  const runs: unknown[] = [];
  for await (const run of client.listRuns({ projectName, limit })) {
    runs.push(run);
  }
  console.log(`Recent runs in project "${projectName}":`);
  runs.forEach((r: any, i) => console.log(`  ${i + 1}. ${r.id}  [${r.name}]  ${r.status}`));
  return runs;
}

async function exportTrace(traceId: string) {
  const runs: unknown[] = [];
  for await (const run of client.listRuns({ traceId })) {
    runs.push(run);
  }

  // Sort by dotted_order so the tree reads top-down
  runs.sort((a: any, b: any) => (a.dotted_order ?? "").localeCompare(b.dotted_order ?? ""));

  const outPath = `trace_export_${traceId.slice(0, 8)}.json`;
  fs.writeFileSync(outPath, JSON.stringify(runs, null, 2));
  console.log(`Exported ${runs.length} runs → ${outPath}`);
}

const traceId = process.argv[2];
const project = process.env.LANGSMITH_PROJECT ?? "zet-plane";

if (traceId) {
  exportTrace(traceId).catch(console.error);
} else {
  console.log("No trace ID provided — listing recent runs instead.");
  listRecentRuns(project).catch(console.error);
}
