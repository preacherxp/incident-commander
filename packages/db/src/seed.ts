import { and, eq } from "drizzle-orm";
import { ENCOUNTERS, encounterContentHash, validateEncounter } from "@incident-commander/scenarios";
import { createDatabase } from "./client";
import { scenarioVersions } from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required to seed incidents.");
  process.exit(1);
}

const { db, close } = createDatabase(url, { max: 1 });
try {
  for (const encounter of ENCOUNTERS) {
    const validation = validateEncounter(encounter);
    if (!validation.ok) {
      throw new Error(`Encounter ${encounter.id} is invalid: ${validation.errors.join(" ")}`);
    }
    const contentHash = await encounterContentHash(encounter);
    const existing = await db
      .select()
      .from(scenarioVersions)
      .where(and(eq(scenarioVersions.id, encounter.id), eq(scenarioVersions.version, encounter.version)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(scenarioVersions).values({
        id: encounter.id,
        version: encounter.version,
        contentHash,
        definition: encounter,
      });
      console.log(`Registered ${encounter.id}@${encounter.version} (${contentHash.slice(0, 12)}).`);
      continue;
    }
    if (existing[0]?.contentHash !== contentHash) {
      throw new Error(
        `Encounter ${encounter.id}@${encounter.version} already exists with a different content hash. ` +
          "Increment the encounter version instead of mutating published definitions.",
      );
    }
    console.log(`No change for ${encounter.id}@${encounter.version}.`);
  }
} finally {
  await close();
}
