import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chooseTools } from "@superdoc-dev/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const providers = ["openai", "anthropic"] as const;
const out: Record<string, unknown> = {};

for (const provider of providers) {
  // chooseTools is async and returns { tools, meta }; we persist just the
  // provider-native tool array so consumers can paste it straight into their
  // LLM client calls.
  const { tools } = await chooseTools({ provider });
  out[provider] = tools;
}

const outPath = path.resolve(__dirname, "..", "src", "superdoc-tool-definitions.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath}`);
