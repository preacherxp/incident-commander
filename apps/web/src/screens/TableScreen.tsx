import { useEffect, useRef, useState } from "react";
import type { VoiceCue, VoiceRequest } from "@incident-commander/contracts";
import type { PlayerView } from "@incident-commander/cards";
import type { RunSession, SessionSnapshot } from "../engine/session";
import { useSessionSnapshot } from "../engine/session";
import { jevVoice } from "../lib/api";
import { fallbackLineFor } from "../lib/voice-lines";
import { CardFace } from "../components/CardFace";
import { ThreatCard } from "../components/ThreatCard";
import { IncidentMap } from "../components/IncidentMap";
import { JevBubble } from "../components/JevBubble";
import { Meter } from "../components/Meter";

type Props = {
  session: RunSession;
  onDebrief: () => void;
  onRestart: () => void;
  onExit: () => void;
};

const SAVE_LABEL: Record<SessionSnapshot["saveStatus"], string> = {
  saved: "saved",
  saving: "saving…",
  "waiting-sync": "waiting to sync",
  error: "saved locally",
  conflict: "conflict",
};

function deriveCue(view: PlayerView, previous: PlayerView | null): VoiceCue | null {
  if (view.phase === "complete") return "victory";
  if (view.phase === "failed") return "defeat";
  if (view.phase === "draft") return "draft";
  if (!previous) return "opening";
  if (previous.threat && !view.threat) {
    return previous.threat.negated ? "threat_blocked" : "threat_resolved";
  }
  if (view.threat && view.threat.cardId !== previous.threat?.cardId) return "threat_revealed";
  if (view.stats.threatsBlocked > previous.stats.threatsBlocked) return "threat_blocked";
  if (view.stability / view.stabilityTarget >= 0.65 && previous.stability < previous.stabilityTarget * 0.65) {
    return "player_ahead";
  }
  if (view.harm / view.harmBudget >= 0.6 && previous.harm < previous.harmBudget * 0.6) return "jev_ahead";
  return null;
}

function buildVoiceRequest(view: PlayerView, session: RunSession, cue: VoiceCue): VoiceRequest {
  const lastPlayerCard = session.allInputs.filter((input) => input.type === "play_card").slice(-1)[0];
  return {
    requestId: crypto.randomUUID(),
    runId: session.id,
    cue,
    encounterTitle: view.encounterTitle,
    round: view.round,
    stability: view.stability,
    stabilityTarget: view.stabilityTarget,
    harm: view.harm,
    harmBudget: view.harmBudget,
    lastJevCard: view.lastJevCardId,
    lastPlayerCard: lastPlayerCard && lastPlayerCard.type === "play_card" ? lastPlayerCard.cardId : null,
  };
}

export function TableScreen({ session, onDebrief, onRestart, onExit }: Props) {
  const snapshot = useSessionSnapshot(session);
  const view = snapshot.view;
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState("");
  const [voicePending, setVoicePending] = useState(false);
  const [voiceSource, setVoiceSource] = useState("openrouter");
  const previousRef = useRef<PlayerView | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const previous = previousRef.current;
    const cue = deriveCue(view, previous);
    previousRef.current = view;
    if (!cue) return;
    const request = buildVoiceRequest(view, session, cue);
    const seq = requestRef.current + 1;
    requestRef.current = seq;
    setVoicePending(true);
    setLine((current) => current || fallbackLineFor(request));
    setVoiceSource("fallback");
    void (async () => {
      try {
        const response = await jevVoice(request);
        if (requestRef.current !== seq) return;
        setLine(response.line);
        setVoiceSource(response.messageCode === "VOICE_READY" ? "openrouter" : "fallback");
      } catch {
        if (requestRef.current !== seq) return;
        setLine(fallbackLineFor(request));
        setVoiceSource("fallback");
      } finally {
        if (requestRef.current === seq) setVoicePending(false);
      }
    })();
  }, [view]);

  const act = async (command: Parameters<RunSession["commit"]>[0]) => {
    const result = await session.commit(command);
    if (!result.ok) {
      setError(result.message);
      window.setTimeout(() => setError(null), 2600);
    }
  };

  const yourTurn = view.phase === "battle" && view.battlePhase === "player";
  const focusPips = Array.from({ length: Math.max(3, view.focus) });

  return (
    <div className="relative flex h-full flex-col">
      <header className="z-20 border-b rule bg-raised/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[100rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div>
            <p className="label">
              Incident {view.encounterIndex + 1} of {view.encounterCount}
            </p>
            <h1 className="text-xl leading-tight">{view.encounterTitle}</h1>
          </div>
          <div className="hidden min-w-[13rem] flex-1 gap-6 sm:flex">
            <div className="flex-1">
              <Meter
                label="Stability"
                value={view.stability}
                max={view.stabilityTarget}
                tone="meter-stability"
                detail="reach the target to contain the incident"
              />
            </div>
            <div className="flex-1">
              <Meter
                label="Customer harm"
                value={view.harm}
                max={view.harmBudget}
                tone="meter-harm"
                detail={view.harm >= view.harmBudget * 0.75 ? "close to the budget" : "budget for this incident"}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip">
              round {view.round} / {view.maxRounds}
            </span>
            <span className="chip" title="Jev's cards remaining">
              Jev {view.jevDeckCount}
            </span>
            <span className="chip" title={SAVE_LABEL[snapshot.saveStatus]}>
              {SAVE_LABEL[snapshot.saveStatus]}
            </span>
            <button type="button" className="btn" onClick={onExit}>
              Shifts
            </button>
          </div>
        </div>
      </header>

      {snapshot.conflict ? (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-bad bg-threat-soft px-4 py-2 text-sm text-bad">
          <span>This run changed elsewhere. You are playing a local copy.</span>
          <button type="button" className="underline" onClick={() => session.clearConflict()}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="border-b border-threat bg-threat-soft px-4 py-2 text-sm text-threat">
          {error}
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[100rem] flex-1 gap-4 overflow-hidden px-4 py-4 lg:grid-cols-[22rem_1fr_17rem]">
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          <div className="panel p-4">
            <JevBubble line={line} pending={voicePending} source={voiceSource} />
          </div>
          <div className="flex justify-center">
            {view.threat ? (
              <ThreatCard threat={view.threat} />
            ) : (
              <div className="panel-flat flex h-[13.5rem] w-[12.5rem] items-center justify-center p-4 text-center text-xs text-ink-soft">
                No telegraphed play. Jev is drawing.
              </div>
            )}
          </div>
          {view.dots.length > 0 ? (
            <div className="panel-flat p-3">
              <p className="label">Bleeding</p>
              <ul className="mt-1 space-y-1 text-xs">
                {view.dots.map((dot) => (
                  <li key={dot.cardId} className="flex justify-between">
                    <span>{dot.name}</span>
                    <span className="metric text-threat">
                      −{dot.harm}/round · {dot.roundsLeft} left
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="panel-flat space-y-1 p-3 text-xs">
            <div className="flex justify-between">
              <span className="label">Cards played</span>
              <span className="metric">{view.stats.cardsPlayed}</span>
            </div>
            <div className="flex justify-between">
              <span className="label">Threats blocked</span>
              <span className="metric">{view.stats.threatsBlocked}</span>
            </div>
            <div className="flex justify-between">
              <span className="label">Damage prevented</span>
              <span className="metric">{view.stats.damagePrevented}</span>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col justify-end gap-3">
          <div className="min-h-[12rem] flex-1">
            <IncidentMap
              threatTag={view.threat?.tag ?? null}
              bleeds={view.dots.length}
              stability={view.stability}
              stabilityTarget={view.stabilityTarget}
            />
          </div>
          <div className="panel flex items-center justify-between gap-4 px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="label">Focus</span>
              <span className="flex items-center gap-1.5" aria-label={`Focus ${view.focus} of 3`}>
                {focusPips.map((_, index) => (
                  <span
                    key={index}
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: index < view.focus ? "var(--color-accent)" : "rgba(255,255,255,0.12)",
                      boxShadow: index < view.focus ? "0 0 12px -2px rgba(94,234,212,0.9)" : "none",
                    }}
                  />
                ))}
              </span>
              {view.focusNext > 0 ? <span className="chip chip-accent">+{view.focusNext} next</span> : null}
              {view.warRoom ? <span className="chip chip-accent">war room</span> : null}
              {view.ward > 0 ? <span className="chip">ward {view.ward}</span> : null}
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-soft">
              <span className="metric">draw {view.drawCount}</span>
              <span className="metric">discard {view.discardCount}</span>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-end justify-center gap-3 pb-1">
              {view.hand.map((card, index) => (
                <CardFace
                  key={`${card.id}-${index}`}
                  card={card}
                  index={index}
                  disabled={!yourTurn || !card.playable}
                  onPlay={() => void act({ type: "play_card", cardId: card.id, handIndex: index })}
                />
              ))}
              {view.hand.length === 0 ? (
                <p className="py-10 text-sm text-ink-soft">Empty hand. End the round to draw.</p>
              ) : null}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                className="btn btn-primary min-w-44"
                disabled={!yourTurn}
                onClick={() => void act({ type: "end_turn" })}
              >
                {yourTurn ? "End round" : view.phase === "battle" ? "Resolving…" : "Ended"}
              </button>
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="panel flex min-h-0 flex-1 flex-col p-3">
            <h2 className="text-sm">Incident log</h2>
            <ul className="mt-2 flex-1 space-y-1 overflow-y-auto pr-1">
              {[...view.log].reverse().map((entry, index) => (
                <li key={`${entry.round}-${index}-${entry.text}`} className={`log-line log-${entry.tone}`}>
                  <span className="metric shrink-0 text-ink-faint">R{entry.round}</span>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {view.phase === "draft" && view.draft ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
          <div role="dialog" aria-modal aria-label="Choose a card" className="panel max-w-3xl p-6 fade-up">
            <p className="label">Incident contained</p>
            <h2 className="mt-1 text-2xl">Choose a card for the next shift</h2>
            <p className="mt-1 text-sm text-ink-soft">
              It joins your deck for the rest of the run. Jev is already setting up the next incident.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-4">
              {view.draft.map((cardId) => {
                const definition = session.getData().catalog[cardId];
                if (!definition || definition.kind === "chaos") return null;
                return (
                  <div key={cardId} className="flex flex-col items-center gap-2">
                    <CardFace
                      card={{ ...definition, playable: true, reason: null }}
                      index={0}
                      disabled={false}
                      onPlay={() => {}}
                    />
                    <button
                      type="button"
                      className="btn btn-primary w-full"
                      onClick={() => void act({ type: "draft_pick", cardId })}
                    >
                      Take it
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {view.phase === "complete" || view.phase === "failed" ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6">
          <div role="dialog" aria-modal aria-label="Run finished" className="panel max-w-lg p-6 text-center fade-up">
            <p className="label">{view.phase === "complete" ? "All incidents contained" : "Run over"}</p>
            <h2 className="mt-1 text-3xl">
              {view.phase === "complete" ? "You held the line" : "The outage wins"}
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              Total harm: <span className="metric">{view.totalHarm}</span> · incidents cleared{" "}
              <span className="metric">
                {view.results.filter((result) => result.outcome === "won").length}/{view.encounterCount}
              </span>
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button type="button" className="btn btn-primary" onClick={onDebrief}>
                Debrief
              </button>
              <button type="button" className="btn" onClick={onRestart}>
                Run it again
              </button>
              <button type="button" className="btn" onClick={onExit}>
                Shifts
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
