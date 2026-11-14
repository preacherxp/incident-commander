import type { ScenarioManifestEntry } from "@incident-commander/contracts";
import { ENCOUNTERS, getEncounter } from "@incident-commander/scenarios";
import type { LocalRun } from "../lib/idb";
import { readRecord } from "../lib/records";
import { isPlayableRun } from "../lib/runs";
import { IncidentMap } from "../components/IncidentMap";

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
  const judged = locals.filter(isPlayableRun);
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
      <header className="shift-hero shift-hero-3d">
        <div className="shift-brand"><span className="command-mark" aria-hidden>⌘</span><span>INCIDENT COMMANDER</span><span className="chip ml-auto">You vs. Jev</span></div>
        <div className="hero-content">
          <div>
            <p className="label text-threat"><span className="live-dot bg-threat" /> Your city. Your cards. Your move.</p>
            <h1>Out-call the AI.<br /><span>Save your weekend.</span></h1>
            <p className="hero-description">A living server city. Three focus. One very smug AI.<br className="hidden sm:block" /> Play your cards. Counter the chaos. Bring production back to life.</p>
            <button type="button" className="btn btn-primary hero-start" disabled={busy} onClick={() => onStart(options[0]?.id)}>{busy ? "Dealing…" : "Let’s play →"}</button>
            <p className="hero-caption">One shift · read the telegraph · contain checkout</p>
          </div>
          <div className="hero-visual">
            <div className="hero-versus"><span className="text-accent">YOU / COMMANDER</span><span>VS.</span><span className="text-threat">JEV / CHAOS</span></div>
            <IncidentMap threatTag="deploy" bleeds={0} stability={32} stabilityTarget={70} />
            <div className="hero-callout"><span>◈</span> “It’s Friday. What could possibly go wrong?”</div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_16rem] md:py-10 md:px-10">
        <section className="shift-options" aria-label="Incidents">
          <div className="shift-section-title"><p className="label">This week’s incident</p><h2 className="text-2xl mt-1">One shift. Contain the outage.</h2></div>
          {options.map((entry) => {
            const best = readRecord(entry.id, entry.version);
            const encounter = getEncounter(entry.id);
            return (
              <article
                key={`${entry.id}@${entry.version}`}
                className="panel shift-option fade-up overflow-hidden"
              >
                <div className="flex h-full flex-col gap-4 p-5">
                  <div className="shift-number"><span>01</span><span className="label">Friday deploy</span></div>
                  <div className="max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl">{entry.title}</h2>
                      <span className="chip">{entry.difficulty}</span>
                    </div>
                    <p className="mt-2 text-sm text-ink-soft">{entry.summary}</p>
                    <p className="metric mt-3 text-[11px] text-ink-soft">{encounter?.stabilityTarget} stability to win · {encounter?.harmBudget} harm limit · {encounter?.maxRounds} rounds</p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                    {best ? (
                      <span className="chip chip-accent">
                        best {best.grade} · {best.score}/100
                      </span>
                    ) : (
                      <span className="chip">no run yet</span>
                    )}
                    <button
                      type="button"
                      className="btn min-h-11 w-full"
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

          <div className="panel-flat shift-howto p-4 sm:p-6">
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
                Jev strikes. Keep one card if you want; the rest are discarded. Fresh focus.
              </li>
            </ol>
          </div>
        </section>

        <aside className="panel h-fit flex flex-col p-5">
          <h2 className="text-lg">Saved runs</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Pick up where you left off. Your progress saves after every move.
          </p>
          <ul className="mt-4 space-y-3">
            {judged.length === 0 ? (
              <li className="text-sm text-ink-soft">No runs on this device yet.</li>
            ) : (
              judged.map((record) => {
                  const encounter = getEncounter(record.checkpoint.state.encounterIds[0] ?? "");
                  return (
                    <li key={record.runId} className="rounded-lg border rule p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{encounter?.title ?? "Unknown shift"}</span>
                        <span className="chip">{statusLabel(record)}</span>
                      </div>
                      <p className="metric mt-1 text-[11px] text-ink-faint">
                        {record.checkpoint.state.totalHarm} damage taken · {record.inputs.length} moves
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
