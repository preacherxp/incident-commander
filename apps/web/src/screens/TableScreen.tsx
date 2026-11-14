import { playSound, type SoundCue } from "../lib/sound";
import { useEffect, useRef, useState } from "react";
import type { VoiceCue, VoiceRequest } from "@incident-commander/contracts";
import { rankEncounter, rankRun, type PlayerView } from "@incident-commander/cards";
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
  error: "local save failed",
  conflict: "conflict",
};

function deriveCue(view: PlayerView, previous: PlayerView | null): VoiceCue | null {
  if (view.phase === "complete") return previous?.phase === "complete" ? null : "victory";
  if (view.phase === "failed") return previous?.phase === "failed" ? null : "defeat";
  if (view.phase === "draft") return previous?.phase === "draft" ? null : "draft";
  if (!previous || previous.encounterId !== view.encounterId) return "opening";
  const turnAdvanced = previous.round !== view.round;
  if (previous.threat && (turnAdvanced || !view.threat || view.threat.cardId !== previous.threat.cardId)) {
    const blocked =
      previous.threat.negated || view.stats.threatsBlocked > previous.stats.threatsBlocked;
    return blocked ? "threat_blocked" : "threat_resolved";
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

function FocusPips({ view }: { view: PlayerView }) {
  const pips = Math.max(3, view.focus);
  return (
    <span className="flex items-center gap-1.5" aria-label={`Focus ${view.focus} of ${pips}`}>
      {Array.from({ length: pips }).map((_, index) => (
        <span
          key={index}
          className="h-3 w-3 rounded-full lg:h-2.5 lg:w-2.5"
          style={{
            background: index < view.focus ? "var(--color-accent)" : "rgba(255,255,255,0.12)",
            boxShadow: index < view.focus ? "0 0 12px -2px rgba(94,234,212,0.9)" : "none",
          }}
        />
      ))}
    </span>
  );
}

function Hand({
  view,
  hand,
  onPlay,
  hold,
  onHold,
  className,
}: {
  view: PlayerView;
  hand: "desktop" | "mobile";
  onPlay: (cardId: string, handIndex: number) => void;
  hold: { cardId: string; handIndex: number } | null;
  onHold: (cardId: string, handIndex: number) => void;
  className?: string;
}) {
  const [selection, setSelection] = useState(0);
  const selectedIndex = Math.min(selection, view.hand.length - 1);
  const selected = view.hand[selectedIndex];
  const yourTurn = view.phase === "battle" && view.battlePhase === "player";
  if (view.hand.length === 0) {
    return <p className="py-8 text-sm text-ink-soft">Empty hand. End the round to draw.</p>;
  }
  if (hand === "mobile" && selected) return (
    <div data-hand="mobile" className="mobile-hand compact-hand">
      <div className="hand-overview" role="group" aria-label="Inspect your hand">
        {view.hand.map((card, index) => <button type="button" key={`${card.id}-${index}`}
          className={`hand-mini card-${card.kind} ${view.threat && card.negateTag === view.threat.tag && !view.threat.negated ? "mini-counter" : ""} ${hold?.handIndex === index ? "mini-held" : ""}`}
          aria-label={`Inspect ${card.name}`} aria-pressed={index === selectedIndex}
          onClick={() => setSelection(index)}>
          <span className="mini-cost">{card.cost}</span><strong>{card.name}</strong>
          <span>{hold?.handIndex === index ? "Holding" : !card.playable ? card.reason : view.threat && card.negateTag === view.threat.tag && !view.threat.negated ? "Counter ready" : card.kind}</span>
        </button>)}
      </div>
      <div className="selected-card">
        <p><strong>{selected.name}</strong> {selected.text}
          {selected.kind === "contain" && !selected.warRoom && view.warRoom ? <em> +4 from war room.</em> : null}
          {selected.kind === "contain" && !selected.warRoom && view.nextContainBonus > 0 ? <em> +{view.nextContainBonus} setup bonus.</em> : null}
          {selected.kind === "contain" && !selected.warRoom && (view.threat?.recoveryPenalty ?? 0) > 0 && selected.negateTag !== view.threat?.tag ? <em> −{view.threat?.recoveryPenalty} while disrupted.</em> : null}
        </p>
        <div className="selected-card-actions">
          <button type="button" className="btn btn-primary" disabled={!selected.playable}
            aria-label={`Play ${selected.name} — ${selected.cost} focus`}
            onClick={() => onPlay(selected.id, selectedIndex)}>Play · {selected.cost} focus</button>
          <button type="button" className="btn" disabled={!yourTurn} aria-pressed={hold?.handIndex === selectedIndex}
            aria-label={hold?.handIndex === selectedIndex ? `Stop holding ${selected.name}` : `Keep ${selected.name} for next round`}
            onClick={() => onHold(selected.id, selectedIndex)}>{hold?.handIndex === selectedIndex ? "Holding" : "Keep"}</button>
        </div>
      </div>
    </div>
  );
  return (
    <div data-hand={hand} className={className}>
      {view.hand.map((card, index) => (
        <div key={`${view.round}-${card.id}-${index}`} className={`snap-start shrink-0 card-slot ${hold?.handIndex === index ? "card-held" : ""}`}>
          <CardFace
            card={card}
            index={index}
            disabled={!yourTurn || !card.playable}
            onPlay={() => onPlay(card.id, index)}
            threat={view.threat}
            warRoom={view.warRoom}
            nextContainBonus={view.nextContainBonus}
          />
          {yourTurn ? (
            <button type="button" className="hold-toggle" aria-pressed={hold?.handIndex === index}
              aria-label={hold?.handIndex === index ? `Stop holding ${card.name}` : `Keep ${card.name} for next round`}
              onClick={() => onHold(card.id, index)}>
              {hold?.handIndex === index ? "Holding" : "Keep"}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LogList({ view }: { view: PlayerView }) {
  return (
    <ul className="space-y-1">
      {[...view.log].reverse().map((entry, index) => (
        <li key={`${entry.round}-${index}-${entry.text}`} className={`log-line log-${entry.tone}`}>
          <span className="metric shrink-0 text-ink-faint">R{entry.round}</span>
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Stats({ view }: { view: PlayerView }) {
  return (
    <dl className="space-y-1 text-xs">
      <div className="flex justify-between">
        <dt className="label">Cards played</dt>
        <dd className="metric">{view.stats.cardsPlayed}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="label">Threats blocked</dt>
        <dd className="metric">{view.stats.threatsBlocked}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="label">Damage prevented</dt>
        <dd className="metric">{view.stats.damagePrevented}</dd>
      </div>
    </dl>
  );
}

export function TableScreen({ session, onDebrief, onRestart, onExit }: Props) {
  const snapshot = useSessionSnapshot(session);
  const view = snapshot.view;
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState("");
  const [voicePending, setVoicePending] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; detail: string; id: number; cue: SoundCue } | null>(null);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem("ic:sound") === "on"; } catch { return false; } });
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => () => { void audioRef.current?.close(); }, []);
  const cueSound = (cue: SoundCue, enabled = sound) => {
    if (!enabled) return;
    try {
      const context = audioRef.current ??= new AudioContext();
      void context.resume().then(() => { if (context.state === "running") playSound(context, cue); }).catch(() => {});
    } catch { /* Audio is optional on browsers without Web Audio. */ }
  };
  const actionRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const briefingRef = useRef<HTMLDialogElement>(null);
  const previousRef = useRef<PlayerView | null>(null);
  const requestRef = useRef(0);
  const [hold, setHold] = useState<{ cardId: string; handIndex: number } | null>(null);
  const [briefingDismissed, setBriefingDismissed] = useState<string | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    const cue = deriveCue(view, previous);
    previousRef.current = view;
    if (!cue) return;
    const request = buildVoiceRequest(view, session, cue);
    const seq = requestRef.current + 1;
    requestRef.current = seq;
    setVoicePending(true);
    setLine(fallbackLineFor(request));
    void (async () => {
      try {
        const response = await jevVoice(request);
        if (requestRef.current !== seq) return;
        setLine(response.line);
      } catch {
        if (requestRef.current !== seq) return;
        setLine(fallbackLineFor(request));
      } finally {
        if (requestRef.current === seq) setVoicePending(false);
      }
    })();
  }, [view, session]);

  const modalOpen = view.phase !== "battle";
  const showBriefing =
    view.phase === "battle" &&
    view.battlePhase === "player" &&
    view.round === 1 &&
    view.stats.cardsPlayed === 0 &&
    briefingDismissed !== view.encounterId;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (modalOpen && dialog && !dialog.open) dialog.showModal();
    if (!modalOpen && dialog?.open) dialog.close();
  }, [modalOpen]);
  useEffect(() => {
    const dialog = briefingRef.current;
    if (showBriefing && dialog && !dialog.open) dialog.showModal();
    if (!showBriefing && dialog?.open) dialog.close();
  }, [showBriefing]);
  useEffect(() => {
    setHold(null);
  }, [view.round, view.encounterId, view.hand.length]);

  const act = async (command: Parameters<RunSession["commit"]>[0]) => {
    const before = session.getSnapshot().view;
    const pending = session.commit(command);
    const after = session.getSnapshot().view;
    const card = command.type === "play_card" ? session.getData().catalog[command.cardId] : null;
    if (before === after) { const result = await pending; if (!result.ok) setError(result.message); return; }
    if (command.type !== "draft_pick") {
      const changes = [
        after.stability !== before.stability ? `${after.stability > before.stability ? "+" : ""}${after.stability - before.stability} stability` : "",
        after.harm !== before.harm ? `${after.harm > before.harm ? "+" : ""}${after.harm - before.harm} harm` : "",
        after.threat?.negated && !before.threat?.negated ? "Threat countered" : "",
        card && card.kind !== "chaos" && card.draw ? `Drew ${Math.max(0, after.hand.length - before.hand.length + 1)} cards` : "",
        card && card.kind !== "chaos" && card.shield ? (before.threat?.pierce ? "Shields cannot stop this hit" : `+${card.shield} shield`) : "",
        card && card.kind !== "chaos" && card.focusNext ? `+${card.focusNext} focus next round` : "",
        card && card.kind !== "chaos" && card.warRoom ? "Contain cards now gain +4 stability" : "",
        card && card.kind !== "chaos" && card.prepareStability ? `Next contain +${after.nextContainBonus} this round` : "",
        before.nextContainBonus > 0 && after.nextContainBonus === 0 && command.type === "play_card" ? `Combo! +${before.nextContainBonus} setup` : "",
      ].filter(Boolean);
      const cue: SoundCue = after.phase === "draft" || after.phase === "complete" ? "victory"
        : after.stats.threatsBlocked > before.stats.threatsBlocked ? "counter"
        : after.harm > before.harm ? "damage"
        : card && card.kind !== "chaos" && card.shield ? "shield"
        : card && card.kind !== "chaos" && (card.kind === "recover" || card.kind === "communicate") ? "recover" : "contain";
      cueSound(cue);
      setFeedback({ title: cue === "counter" ? `Perfect counter · ${card?.name}` : card?.name ?? `Round ${after.round} resolved`, detail: command.type === "end_turn" && after.resolution.length
        ? after.resolution.map((hit) => `${hit.name}: ${hit.countered ? "countered" : `+${hit.harm} harm${hit.stabilityDamage ? ` / −${hit.stabilityDamage} stability` : ""}`}`).join(" · ")
        : changes.join(" · ") || "Fresh hand. Your move.", id: ++actionRef.current, cue });
    } else setFeedback(null);
    const result = await pending;
    if (!result.ok) setError(result.message);
    else setError(null);
  };

  const yourTurn = view.phase === "battle" && view.battlePhase === "player";
  const playCard = (cardId: string, handIndex: number) => {
    setHold(null);
    void act({ type: "play_card", cardId, handIndex });
  };
  const toggleHold = (cardId: string, handIndex: number) => {
    setHold((current) => (current?.handIndex === handIndex && current.cardId === cardId ? null : { cardId, handIndex }));
  };
  const endRound = () => {
    const command =
      hold && view.hand[hold.handIndex]?.id === hold.cardId
        ? { type: "end_turn" as const, holdCardId: hold.cardId, holdIndex: hold.handIndex }
        : { type: "end_turn" as const };
    setHold(null);
    void act(command);
  };
  const knownHarm = (view.threat?.projectedHarm ?? 0) + view.dots.reduce((sum, dot) => sum + dot.harm, 0);
  const knownLoss = (view.threat?.projectedStability ?? 0) + view.dots.reduce((sum, dot) => sum + dot.stabilityDamage, 0);
  const surpriseHarm = view.surpriseRisk?.harm ?? 0;
  const surpriseLoss = view.surpriseRisk?.stabilityDamage ?? 0;
  const incomingHarm = knownHarm + surpriseHarm;
  const incomingLoss = knownLoss + surpriseLoss;
  const lethal = view.harm + incomingHarm >= view.harmBudget;
  const emptyTelegraph = !view.threat && surpriseHarm > 0;
  const playable = view.hand.filter((card) => card.playable).length;
  const encounter = session.getData().encounters[view.encounterId];
  const lastResult = view.results.at(-1);
  const grade = lastResult && encounter ? rankEncounter(lastResult, encounter) : null;
  const runRank = rankRun(session.currentState, session.getData());

  return (
    <div className="game-shell game-3d">
      <header className="game-header">
        <div className="flex min-w-0 items-center gap-4">
          <span className="command-mark" aria-hidden>⌘</span>
          <div className="min-w-0">
            <p className="label">{view.encounterCount > 1 ? `Incident ${view.encounterIndex + 1} of ${view.encounterCount} · ` : ""}round {view.round} / {view.maxRounds}</p>
            <h1 className="truncate text-lg sm:text-2xl">{view.encounterTitle}</h1>
          </div>
        </div>
        {view.encounterCount > 1 ? (
        <ol className="campaign-track" aria-label="Campaign progress">
          {session.currentState.encounterIds.map((id, index) => (
            <li key={id} className={index < view.encounterIndex ? "cleared" : index === view.encounterIndex ? "current" : ""}
              aria-current={index === view.encounterIndex ? "step" : undefined}>
              <span>{index < view.encounterIndex ? "✓" : String(index + 1).padStart(2, "0")}</span>
              {session.getData().encounters[id]?.title.split(",")[0]}
            </li>
          ))}
        </ol>
        ) : null}
        <div className="header-actions">
          <button type="button" className="scene-button" aria-pressed={sound} onClick={() => {
            const enabled = !sound; setSound(enabled);
            try { localStorage.setItem("ic:sound", enabled ? "on" : "off"); } catch { /* Preference can remain in memory. */ }
            if (enabled) cueSound("recover", true);
            else void audioRef.current?.suspend();
          }}>Sound {sound ? "on" : "off"}</button>
          <button type="button" className="btn min-h-11" onClick={onExit}>Shifts</button>
        </div>
      </header>

      {snapshot.conflict ? <div role="alert" className="px-4 py-2 text-bad">
        This run changed elsewhere. You are playing a local copy.
        <button type="button" className="ml-3 underline" onClick={() => session.clearConflict()}>Dismiss</button>
      </div> : null}
      {error ? <div role="alert" className="px-4 py-2 text-threat">{error}</div> : null}

      <div className="game-meters">
        <Meter label="Stability" value={view.stability} max={view.stabilityTarget} tone="meter-stability" />
        <Meter label="Customer harm" value={view.harm} max={view.harmBudget} tone="meter-harm" />
        <div className={`round-clock ${view.maxRounds - view.round <= 2 ? "text-threat" : ""}`}>
          <span className="label">SLA window</span>
          <strong className="metric">{view.maxRounds - view.round + 1}<small> rounds left</small></strong>
        </div>
      </div>

      <main className="battle-stage">
        <div className="battle-world">
          <IncidentMap threatTag={view.threat?.tag ?? null} bleeds={view.dots.length}
            stability={view.stability} stabilityTarget={view.stabilityTarget} harm={view.harm}
            shield={(view.threat?.mitigated ?? 0) + view.ward} countered={view.threat?.negated ?? false}
            round={view.round} cardsPlayed={view.stats.cardsPlayed} />
        </div>
        <section className="adversary-panel">
          <JevBubble line={line} pending={voicePending} />
          {view.surpriseRisk ? <p className="surprise-risk"><strong>Surprise risk</strong> Up to +{view.surpriseRisk.harm} harm{view.surpriseRisk.stabilityDamage ? ` / −${view.surpriseRisk.stabilityDamage} stability` : ""} is already in the forecast. Shields you play with no telegraph cover it; counters cannot.</p> : null}
          {view.threat ? <ThreatCard threat={view.threat} /> : <div className={`quiet-threat panel-flat ${emptyTelegraph ? "quiet-defend" : ""}`}>
            <span className={`text-3xl ${emptyTelegraph ? "text-warn" : "text-accent"}`} aria-hidden>{emptyTelegraph ? "!" : "◈"}</span>
            <h2>{emptyTelegraph ? "No telegraph — defend now" : "No telegraphed threat"}</h2>
            <p>{emptyTelegraph ? "A surprise can still land this round. Shields you play now cover it. Hold a counter for the next telegraph." : "Nothing is incoming. Spend the round on recovery."}</p>
          </div>}
          {view.dots.length > 0 ? <div className="bleed-list">
            <p className="label text-threat">Active bleeds · bypass shields</p>
            {view.dots.map((dot, index) => <p key={`${dot.cardId}-${index}`}>
              <span>{dot.name}</span><span className="metric">+{dot.harm} harm · {dot.roundsLeft}r</span>
            </p>)}
          </div> : null}
        </section>

        <section className="command-stage">
          <div className="stage-title"><span className="label">Live incident / {view.encounterDifficulty.split(" · ")[0]}</span>
            <span className="chip chip-accent">{view.warRoom ? "War room active · +4 contain" : "Your move"}</span></div>

        </section>

        <aside className="battle-intel">
          <div className="panel-flat p-4"><p className="label mb-3">Your response</p><Stats view={view} /></div>
          <div className={`round-forecast ${lethal ? "forecast-danger" : view.threat?.negated && !surpriseHarm ? "forecast-safe" : emptyTelegraph ? "forecast-danger" : ""}`}>
            <div><p className="label">If you end the round</p>
              <strong>{lethal ? "This hit can end the run" : view.round === view.maxRounds ? "Last chance to contain the incident" : view.threat?.negated && surpriseHarm ? "Counter locked in. Surprise can still land." : view.threat?.negated ? "Counter locked in" : emptyTelegraph ? "No telegraph. Defend now." : incomingHarm === 0 && incomingLoss === 0 ? "Room to make your move" : "Incoming impact"}</strong>
              <p>{surpriseHarm ? `Includes +${knownHarm} known and up to +${surpriseHarm} surprise.` : "Includes all active bleeds."}</p>
            </div>
            <div className="forecast-values"><span className={incomingHarm ? "text-threat" : "text-accent"}>+{incomingHarm}<small>{surpriseHarm ? "up to harm" : "harm"}</small></span>
              <span className={incomingLoss ? "text-warn" : "text-ink-soft"}>−{Math.min(view.stability, incomingLoss)}<small>{surpriseLoss ? "up to stability" : "stability"}</small></span></div>
          </div>

          {view.resolution.length > 0 ? <section className="round-resolution panel-flat" aria-label="Last round impacts">
            <p className="label">Last round impacts</p>
            {view.resolution.map((hit, index) => <p key={index}><strong>{hit.name}</strong><span className={hit.countered ? "text-accent" : "text-threat"}>{hit.countered ? "Countered · no damage" : `+${hit.harm} harm${hit.stabilityDamage ? ` · −${hit.stabilityDamage} stability` : ""}`}</span></p>)}
          </section> : null}
          <details className="incident-log panel-flat">
            <summary className="label">Incident log</summary><div className="log-scroll"><LogList view={view} /></div>
          </details>
          <p className="label text-center">{SAVE_LABEL[snapshot.saveStatus]}</p>
        </aside>
        <details className="mobile-map panel-flat p-3"><summary className="label">Incident map</summary>
          <p className="mt-2 text-xs text-ink-soft">The five towers are your services. Orange marks Jev’s target, cyan domes show protection, and energy pulses show your plays. Drag the arena to look around.</p>
        </details>
      </main>

      <footer className="hand-dock" data-mobile-bar>
        <div className="play-feedback" role="status" aria-live="polite" aria-atomic="true">
          {feedback ? <div key={feedback.id} className={`fade-up feedback-${feedback.cue}`}><strong>{feedback.title}</strong><span>{feedback.detail}</span></div> : null}
        </div>
        <div className="hand-toolbar">
          <div className="flex flex-wrap items-center gap-3"><span className="label">Your hand</span><FocusPips view={view} />
            <strong className="metric text-accent">{view.focus} focus</strong>
            {view.focusNext !== 0 ? <span className="chip">{view.focusNext > 0 ? "+" : ""}{view.focusNext} next</span> : null}
            {view.nextContainBonus > 0 ? <span className="chip chip-accent">Next contain +{view.nextContainBonus}</span> : null}
            {view.ward > 0 ? <span className="chip">ward {view.ward}</span> : null}
          </div>
          <span className="hand-piles metric">{view.drawCount} draw / {view.discardCount} discard</span>
        </div>
        <div className="hand-controls">
          <Hand hand="desktop" view={view} onPlay={playCard} hold={hold} onHold={toggleHold} className="desktop-hand card-row" />
          <Hand key={`${view.encounterId}-${view.round}`} hand="mobile" view={view} onPlay={playCard} hold={hold} onHold={toggleHold} className="mobile-hand card-row" />
          <div className="end-round-control">
            <p className="text-sm">{hold ? `Keeping ${view.hand[hold.handIndex]?.name ?? "one card"}.` : playable ? `${playable} playable card${playable === 1 ? "" : "s"}` : "All set. Let Jev respond."}</p>
            <button type="button" className={`btn min-h-12 ${lethal ? "btn-threat" : "btn-primary"}`} disabled={!yourTurn} onClick={endRound}>End round</button>
            <p className="hand-rule">Keep one card if you want.<br />The rest are discarded.</p>
          </div>
        </div>
      </footer>

      {showBriefing ? (
        <dialog ref={briefingRef} aria-label="Shift briefing" className="game-dialog briefing-dialog panel" onCancel={(event) => event.preventDefault()}>
          <p className="label text-accent">{view.encounterTitle}</p>
          <h2 className="mt-1 text-2xl">Shift briefing</h2>
          <p className="mt-3 text-sm text-ink">{view.briefing.objective}</p>
          <ol className="briefing-steps">
            {view.briefing.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-ink-soft">{view.briefing.impactLimit}</p>
          <button type="button" className="btn btn-primary mt-5 min-h-11" onClick={() => setBriefingDismissed(view.encounterId)}>
            Begin shift
          </button>
        </dialog>
      ) : null}

      {view.phase === "draft" && view.draft ? (
        <dialog ref={dialogRef} aria-label="Choose a card" className="game-dialog draft-dialog panel" onCancel={(event) => event.preventDefault()}>
            <div className="reward-emblem" aria-hidden>✓</div>
            <p className="label text-accent">Incident contained · rank {grade?.grade} · {grade?.score}/100</p>
            <h2 className="mt-1 text-2xl victory-title">You shut it down.</h2>
            <p className="mt-2 text-accent">Choose your next advantage</p>
            <p className="mt-1 text-sm text-ink-soft">
              {lastResult?.rounds} rounds · {lastResult?.stats.damageTaken} damage taken · {lastResult?.stats.threatsBlocked} counters. Choose one permanent addition to your deck.
            </p>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:justify-center">
              {view.draft.map((cardId) => {
                const definition = session.getData().catalog[cardId];
                if (!definition || definition.kind === "chaos") return null;
                return (
                  <div key={cardId} className="flex items-center gap-3 lg:flex-col lg:items-center">
                    <CardFace
                      card={{ ...definition, playable: true, reason: null }}
                      index={0}
                      disabled={false}
                      onPlay={() => void act({ type: "draft_pick", cardId })}
                    />
                    <button
                      type="button"
                      className="btn btn-primary min-h-11 flex-1 lg:w-full"
                      onClick={() => void act({ type: "draft_pick", cardId })}
                    >
                      Take it
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-5 text-sm text-ink-soft">Up next: {session.getData().encounters[session.currentState.encounterIds[view.encounterIndex + 1] ?? ""]?.title}. Harm resets; your deck carries over.</p>
        </dialog>
      ) : null}

      {view.phase === "complete" || view.phase === "failed" ? (
        <dialog ref={dialogRef} aria-label="Run finished" className="game-dialog finish-dialog panel" onCancel={(event) => event.preventDefault()}>
            <div className={`rank-emblem ${view.phase === "failed" ? "rank-failed" : ""}`}>{runRank.grade}</div>
            <p className="label">{view.phase === "complete" ? "Incident contained" : "Run over"}</p>
            <h2 className="mt-1 text-3xl">
              {view.phase === "complete" ? "You held the line" : "The outage wins"}
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              Damage taken: <span className="metric">{view.totalHarm}</span>
              {view.encounterCount > 1 ? (
                <>
                  {" "}
                  · incidents cleared{" "}
                  <span className="metric">
                    {view.results.filter((result) => result.outcome === "won").length}/{view.encounterCount}
                  </span>
                </>
              ) : (
                <>
                  {" "}
                  · <span className="metric">{view.results[0]?.rounds ?? view.round}</span> rounds
                </>
              )}
            </p>
            <p className="mt-2 text-accent">Score {runRank.score}/100 · speed + prevention</p>
            <p className="mt-3 text-xs text-ink-soft">Run it again for a fresh shuffle and a shot at a better rank.</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button type="button" className="btn btn-primary min-h-11" onClick={onDebrief}>
                Debrief
              </button>
              <button type="button" className="btn min-h-11" onClick={onRestart}>
                Run it again
              </button>
              <button type="button" className="btn min-h-11" onClick={onExit}>
                Shifts
              </button>
            </div>
        </dialog>
      ) : null}
    </div>
  );
}
