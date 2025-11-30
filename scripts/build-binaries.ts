import { $ } from "bun";
import { mkdir } from "node:fs/promises";

const targets = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
] as const;

const outputNames: Record<(typeof targets)[number], string> = {
  "bun-darwin-arm64": "btca-darwin-arm64",
  "bun-darwin-x64": "btca-darwin-x64",
  "bun-linux-x64": "btca-linux-x64",
  "bun-linux-arm64": "btca-linux-arm64",
};

await mkdir("dist", { recursive: true });

for (const target of targets) {
  const outfile = `dist/${outputNames[target]}`;
  console.log(`Building ${target} -> ${outfile}`);
  await $`bun build src/index.ts --compile --target=${target} --outfile=${outfile}`;
}

console.log("Done building all targets");
