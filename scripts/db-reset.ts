import { $ } from "bun";

console.error("This destroys the local PostgreSQL volume, including all saves.");
console.error("Re-run with CONFIRM_DB_RESET=1 to proceed.");

if (process.env.CONFIRM_DB_RESET !== "1") {
  process.exit(1);
}

await $`docker compose --env-file .env -f infra/compose.yaml down -v`;
await $`docker compose --env-file .env -f infra/compose.yaml up -d db`;
console.log("Database volume reset. Run `bun run db:migrate` and `bun run db:seed` next.");
