import { useEffect, useMemo, useRef, useState } from "react";
import {
  rankEncounter,
  rankRun,
  type CardCatalog,
  type GameData,
} from "@incident-commander/cards";
import type { LocalRun } from "../lib/idb";
import { writeRecordIfBest, type RunRecord } from "../lib/records";

type Props = {
  runId: string;
  local: LocalRun | null;
  data: GameData;
  onBack: () => void;
  onRetry: () => void;
};

function cardLabel(catalog: CardCatalog, cardId: string): { name: string; kind: string } {
  const card = catalog[cardId];
  if (!card) return { name: cardId, kind: "unknown" };
  return { name: card.name, kind: card.kind };
}

export function DebriefScreen({ runId, local, data, onBack, onRetry }: Props) {
  const state = local?.checkpoint.state ?? null;
  const [bestInfo, setBestInfo] = useState<{ isBest: boolean; best: RunRecord } | null>(null);
  const recordedRef = useRef(false);

  const rank = useMemo(() => (state ? rankRun(state, data) : null), [state, data]);

  useEffect(() => {
    if (recordedRef.current || !state || !rank) return;
    recordedRef.current = true;
    const startId = state.encounterIds[0] ?? "";
    const version = data.encounters[startId]?.version ?? "1.0.0";
    setBestInfo(
      writeRecordIfBest(startId, version, {
        grade: rank.grade,
        totalHarm: state.totalHarm,
        encountersCleared: state.results.filter((result) => result.outcome === "won").length,
        outcome: state.phase === "complete" ? "won" : "lost",
        at: new Date().toISOString(),
      }),
    );
  }, [state, rank, data]);

  if (!local || !state || !rank) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl">Debrief unavailable</h1>
        <p className="mt-3 text-ink-soft">
          Run {runId} is not stored on this device. The server keeps the sealed result, but the local
          move log is what makes the replay possible.
        </p>
        <button type="button" className="btn mt-6" onClick={onBack}>
          Back to shift selection
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-full pb-16">
      <header className="border-b rule">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-6 px-6 py-10 md:px-10">
          <div>
            <p className="label">Debrief · {data.encounters[state.encounterIds[0] ?? ""]?.title ?? runId}</p>
            <h1 className="mt-1 text-4xl">
              {state.phase === "complete" ? "All incidents contained" : "The outage won"}
            </h1>
            <p className="metric mt-2 text-xs text-ink-faint">
              seed {state.seed} · {state.results.length} of {state.encounterIds.length} incidents played
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Run it again
            </button>
            <button type="button" className="btn" onClick={onBack}>
              Shift selection
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:px-10 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-xl">Incidents</h2>
            <ol className="mt-4 space-y-4">
              {state.results.map((result, index) => {
                const encounter = data.encounters[result.encounterId];
                const resultRank = encounter ? rankEncounter(result, encounter) : null;
                return (
                  <li key={`${result.encounterId}-${index}`} className="rounded-lg border rule p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg">{encounter?.title ?? result.encounterId}</h3>
                      {resultRank ? (
                        <span className={`chip ${resultRank.grade === "F" ? "chip-threat" : "chip-accent"}`}>
                          {resultRank.grade} · {resultRank.headline}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-ink-soft">
                      {result.rounds} rounds · {result.harm} harm · stability {result.stability}
                    </p>
                  </li>
                );
              })}
              {state.results.length === 0 ? (
                <li className="text-sm text-ink-soft">No round was completed before the run ended.</li>
              ) : null}
            </ol>
          </div>

          <div className="panel p-5">
            <h2 className="text-xl">Final deck · {state.deck.length} cards</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {state.deck.map((cardId, index) => {
                const label = cardLabel(data.catalog, cardId);
                return (
                  <li key={`${cardId}-${index}`} className="chip">
                    {label.name}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="panel p-5 text-center">
            <p className="label">Run rank</p>
            <p
              className="metric mt-2 text-7xl leading-none"
              style={{ color: rank.grade === "F" ? "var(--color-threat)" : "var(--color-accent)" }}
            >
              {rank.grade}
            </p>
            <p className="mt-2 text-sm">{rank.headline}</p>
            <ul className="mt-4 space-y-1 text-left text-xs text-ink-soft">
              {rank.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {bestInfo ? (
              <p className={`mt-3 text-xs ${bestInfo.isBest ? "text-accent" : "text-ink-faint"}`}>
                {bestInfo.isBest
                  ? "New personal best."
                  : `Best so far: ${bestInfo.best.grade} · ${bestInfo.best.totalHarm} harm`}
              </p>
            ) : null}
          </section>

          <section className="panel p-5">
            <h2 className="text-lg">Facts</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="label">Total harm</dt>
                <dd className="metric">{state.totalHarm}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Rounds survived</dt>
                <dd className="metric">{state.results.reduce((sum, result) => sum + result.rounds, 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Cards played</dt>
                <dd className="metric">{state.battle.stats.cardsPlayed}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Threats blocked</dt>
                <dd className="metric">{state.battle.stats.threatsBlocked}</dd>
              </div>
            </dl>
          </section>

          <p className="text-xs text-ink-soft">
            Every run replays from its sealed move log, so ranks are comparable across devices.
          </p>
        </aside>
      </div>
    </main>
  );
}
