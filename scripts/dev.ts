import { spawn } from "bun";

const filters = ["@incident-commander/api", "@incident-commander/web"];
const children = filters.map((filter) =>
  spawn(["bun", "run", "--filter", filter, "dev"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  }),
);

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const codes = await Promise.all(children.map((child) => child.exited));
const failed = codes.find((code) => code !== 0);
process.exit(failed ?? 0);
