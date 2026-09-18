import type { ScenarioManifestEntry } from "@incident-commander/contracts";
import { ENCOUNTERS, getEncounter } from "@incident-commander/scenarios";
import type { LocalRun } from "../lib/idb";
import { readRecord } from "../lib/records";

type Props = {
  scenarios: ScenarioManifestEntry[];
  locals: LocalRun[];
  busy: boolean;
  error: string | null;
  onStart: (scenarioId?: string) => void;
  onResume: (runId: string) => void;
};

function statusLabel(record: LocalRun): string {
  const phase = record.checkpoint.state.phase;
  if (phase === "complete") return "Contained";
  if (phase === "failed") return "Run over";
  if (phase === "draft") return "Choosing a card";
  return `Round ${record.checkpoint.state.battle.round}`;
}

export function ShiftSelection({ scenarios, locals, busy, error, onStart, onResume }: Props) {
  const playable = scenarios.filter((entry) => getEncounter(entry.id, entry.version) !== undefined);
  const options =
    playable.length > 0
      ? playable
      : ENCOUNTERS.map((encounter) => ({
          id: encounter.id,
          version: encounter.version,
          engineVersion: encounter.engineVersion,
          contentHash: "local",
          title: encounter.title,
          summary: encounter.summary,
          difficulty: encounter.difficulty,
          playable: true,
        }));

  return (
    <main className="min-h-full pb-16">
      <header className="border-b rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 md:flex-row md:items-end md:justify-between md:px-10">
          <div>
            <p className="label">Incident Commander</p>
            <h1 className="mt-2 text-5xl leading-[1.05] md:text-6xl">
              Out-call the AI
              <br />
              that owns the outage.
            </h1>
            <p className="mt-4 max-w-xl text-ink-soft">
              A deck-building incident game. Jev is the adversary: it telegraphs its next play, and you
              counter with the cards in your hand. Clear three shifts without burning the harm budget.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="chip">turn based</span>
            <span className="chip chip-accent">deterministic replay</span>
            <span className="chip chip-threat">3 incidents</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 md:grid-cols-[1fr_20rem] md:px-10">
        <section className="space-y-4" aria-label="Incidents">
          {options.map((entry, index) => {
            const best = readRecord(entry.id, entry.version);
            return (
              <article
                key={`${entry.id}@${entry.version}`}
                className="panel fade-up overflow-hidden"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                  <div className="max-w-xl">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl">{entry.title}</h2>
                      <span className="chip">{entry.difficulty}</span>
                    </div>
                    <p className="mt-2 text-sm text-ink-soft">{entry.summary}</p>
                    <p className="metric mt-3 text-[11px] text-ink-faint">
                      {entry.id}@{entry.version}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                    {best ? (
                      <span className="chip chip-accent">
                        best {best.grade} · {best.totalHarm} harm
                      </span>
                    ) : (
                      <span className="chip">no run yet</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary min-w-40"
                      disabled={busy}
                      onClick={() => onStart(entry.id)}
                    >
                      {busy ? "Scheduling…" : "Take the shift"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {error ? (
            <p role="alert" className="panel-flat px-4 py-3 text-sm text-threat">
              {error}
            </p>
          ) : null}

          <div className="panel-flat p-6">
            <h2 className="text-lg">How a shift plays</h2>
            <ol className="mt-3 grid gap-2 text-sm text-ink-soft md:grid-cols-3">
              <li className="rounded-lg border rule p-3">
                <span className="label block">1 · Read</span>
                Jev reveals its next play before it lands. Tags tell you what counters it.
              </li>
              <li className="rounded-lg border rule p-3">
                <span className="label block">2 · Play</span>
                Spend focus on cards: contain the incident, communicate, or block the hit.
              </li>
              <li className="rounded-lg border rule p-3">
                <span className="label block">3 · End the round</span>
                Whatever you blocked does not land. Whatever you missed, does.
              </li>
            </ol>
          </div>
        </section>

        <aside className="panel flex flex-col p-5">
          <h2 className="text-lg">Saved runs</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Stored in this browser, tied to this guest. Reload-safe at every card.
          </p>
          <ul className="mt-4 space-y-3">
            {locals.length === 0 ? (
              <li className="text-sm text-ink-soft">No runs on this device yet.</li>
            ) : (
              locals.map((record) => {
                const encounter = getEncounter(record.checkpoint.state.encounterIds[0] ?? "");
                return (
                  <li key={record.runId} className="rounded-lg border rule p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{encounter?.title ?? "Unknown shift"}</span>
                      <span className="chip">{statusLabel(record)}</span>
                    </div>
                    <p className="metric mt-1 text-[11px] text-ink-faint">
                      {record.checkpoint.state.totalHarm} harm · {record.inputs.length} moves
                    </p>
                    <button
                      type="button"
                      className="btn mt-3 w-full"
                      disabled={busy}
                      onClick={() => onResume(record.runId)}
                    >
                      Resume
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>
      </div>
    </main>
  );
}
