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
  // LLM client calls. Guard the shape — a future SDK rename would silently
  // produce `{ openai: null }` without this.
  const { tools } = await chooseTools({ provider });
  if (!Array.isArray(tools)) {
    throw new Error(`chooseTools({ provider: "${provider}" }) did not return a tools array — SDK shape may have changed`);
  }
  out[provider] = tools;
}

const outPath = path.resolve(__dirname, "..", "src", "superdoc-tool-definitions.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath}`);
