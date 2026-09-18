import { $ } from "bun";

const root = new URL("..", import.meta.url).pathname;

const forbidden: Array<{ files: string[]; patterns: RegExp[]; reason: string }> = [
  {
    files: ["packages/cards", "packages/contracts", "packages/scenarios"],
    patterns: [/\bfrom\s+["'](react|three|@react-three|hono|drizzle-orm|postgres)["']/],
    reason: "Shared domain packages must not depend on React, Three.js, Hono, or PostgreSQL.",
  },
  {
    files: ["packages/cards", "packages/contracts", "packages/scenarios"],
    patterns: [/\bfrom\s+["']@incident-commander\/(db|ai)["']/],
    reason: "Server-only packages cannot be imported by shared domain packages.",
  },
  {
    files: ["packages", "apps/api"],
    patterns: [/\bfrom\s+["']@incident-commander\/web["']/],
    reason: "Shared packages and the API must not import the web application.",
  },
  {
    files: ["packages", "apps", "tests"],
    patterns: [/\bMath\.random\(\)/],
    reason: "Simulation randomness must use the deterministic xorshift32 stream.",
  },
];

const glob = new Bun.Glob("**/*.{ts,tsx}");
let failures = 0;

for (const rule of forbidden) {
  for (const dir of rule.files) {
    for await (const file of glob.scan({ cwd: `${root}${dir}`, onlyFiles: true })) {
      if (file.includes("node_modules") || file.endsWith(".d.ts")) continue;
      const path = `${dir}/${file}`;
      const text = await Bun.file(`${root}${path}`).text();
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          console.error(`lint: forbidden import in ${path}: ${rule.reason}`);
          failures += 1;
        }
      }
    }
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log("lint: import boundaries and determinism checks passed");
await $`bun run typecheck`.cwd(root);
