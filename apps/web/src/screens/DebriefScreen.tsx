import { useEffect, useMemo, useRef, useState } from "react";
import {
  rankEncounter,
  rankRun,
  type CardCatalog,
  type GameData,
} from "@incident-commander/cards";
import type { LocalRun } from "../lib/idb";
import { writeRecordIfBest, type RunRecord } from "../lib/records";
import { isPlayableRun } from "../lib/runs";

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
        score: rank.score,
        totalHarm: state.totalHarm,
        encountersCleared: state.results.filter((result) => result.outcome === "won").length,
        outcome: state.phase === "complete" ? "won" : "lost",
        at: new Date().toISOString(),
      }),
    );
  }, [state, rank, data]);

  if (!local || !isPlayableRun(local) || !state || !rank) {
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-4 py-8 sm:px-6 md:gap-6 md:py-10 md:px-10">
          <div>
            <p className="label">Debrief · {data.encounters[state.encounterIds[0] ?? ""]?.title ?? runId}</p>
            <h1 className="mt-1 text-3xl md:text-4xl">
              {state.phase === "complete" ? "Incident contained" : "The outage won"}
            </h1>
            <p className="metric mt-2 text-xs text-ink-faint">
              seed {state.seed} · {state.results.reduce((sum, result) => sum + result.rounds, 0)} rounds
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button type="button" className="btn btn-primary min-h-11 flex-1 sm:flex-none" onClick={onRetry}>
              Run it again
            </button>
            <button type="button" className="btn min-h-11 flex-1 sm:flex-none" onClick={onBack}>
              Shift selection
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 md:py-8 md:px-10 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-xl">This shift</h2>
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
                      {result.rounds} rounds · {result.stats.damageTaken} damage taken · {result.harm} final harm · {resultRank?.score}/100
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
              className="metric mt-2 text-6xl leading-none lg:text-7xl"
              style={{ color: rank.grade === "F" ? "var(--color-threat)" : "var(--color-accent)" }}
            >
              {rank.grade}
            </p>
            <p className="mt-2 text-sm">{rank.headline} · {rank.score}/100</p>
            <ul className="mt-4 space-y-1 text-left text-xs text-ink-soft">
              {rank.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {bestInfo ? (
              <p className={`mt-3 text-xs ${bestInfo.isBest ? "text-accent" : "text-ink-faint"}`}>
                {bestInfo.isBest
                  ? "New personal best."
                  : `Best so far: ${bestInfo.best.grade} · ${bestInfo.best.totalHarm} damage taken`}
              </p>
            ) : null}
          </section>

          <section className="panel p-5">
            <h2 className="text-lg">Facts</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="label">Damage taken</dt>
                <dd className="metric">{state.totalHarm}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Rounds survived</dt>
                <dd className="metric">{state.results.reduce((sum, result) => sum + result.rounds, 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Cards played</dt>
                <dd className="metric">{state.results.reduce((sum, result) => sum + result.stats.cardsPlayed, 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Threats blocked</dt>
                <dd className="metric">{state.results.reduce((sum, result) => sum + result.stats.threatsBlocked, 0)}</dd>
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
