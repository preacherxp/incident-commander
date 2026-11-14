import { useEffect, useRef, useState } from "react";
import type { SceneState, createIncidentScene } from "../scene/incident-scene";

type Props = Pick<SceneState, "threatTag" | "bleeds" | "stability" | "stabilityTarget"> & Partial<SceneState>;
type Arena = ReturnType<typeof createIncidentScene>;

export function IncidentMap({ threatTag, bleeds, stability, stabilityTarget, harm = 0, shield = 0, countered = false, round = 1, cardsPlayed = 0 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const arenaRef = useRef<Arena | null>(null);
  const stateRef = useRef<SceneState>({ threatTag, bleeds, stability, stabilityTarget, harm, shield, countered, round, cardsPlayed });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const recovery = Math.min(100, Math.round(stability / Math.max(1, stabilityTarget) * 100));

  useEffect(() => {
    const state = { threatTag, bleeds, stability, stabilityTarget, harm, shield, countered, round, cardsPlayed };
    stateRef.current = state;
    arenaRef.current?.update(state);
  }, [threatTag, bleeds, stability, stabilityTarget, harm, shield, countered, round, cardsPlayed]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    host.dataset.scene = "loading";
    setFailed(false);
    setPaused(false);
    void import("../scene/incident-scene").then(({ createIncidentScene }) => {
      if (cancelled) return;
      try {
        arenaRef.current = createIncidentScene(host, stateRef.current, () => {
          host.dataset.scene = "unavailable";
          setFailed(true);
        });
      } catch {
        host.dataset.scene = "unavailable";
        setFailed(true);
      }
    }).catch(() => {
      if (!cancelled) { host.dataset.scene = "unavailable"; setFailed(true); }
    });
    return () => {
      cancelled = true;
      arenaRef.current?.dispose();
      arenaRef.current = null;
    };
  }, [attempt]);

  return (
    <div className={`incident-map arena ${failed ? "arena-unavailable" : ""}`} data-threat={countered ? "countered" : threatTag ?? "none"} data-recovery={recovery}>
      <div ref={hostRef} className="scene-canvas" role="img"
        aria-label={`Live incident map in 3D. ${recovery}% stability restored. ${countered ? "Threat countered." : threatTag ? `Incoming ${threatTag} attack.` : "No telegraphed attack."} ${bleeds} active bleeds.`} />
      <div className="arena-vignette" aria-hidden />
      <div className="arena-heading"><span className="label"><span className="live-dot" /> Production / live simulation</span>
        <span className="arena-recovery metric">{recovery}<small>% stable</small></span></div>
      {failed ? <div className="arena-fallback">
        <span className="fallback-core" aria-hidden>◈</span>
        <h3>Command link active</h3>
        <p>3D visuals are unavailable. Your cards and progress still work.</p>
        <p className="text-accent">{countered ? "Threat countered" : threatTag ? `${threatTag.toUpperCase()} attack incoming` : "No incoming attack"} · {bleeds} bleeds</p>
        <button type="button" className="btn" onClick={() => setAttempt((value) => value + 1)}>Retry 3D</button>
      </div> : null}
      <div className="arena-controls">
        <span className="arena-hint">Drag to orbit the arena</span>
        <button type="button" className="scene-button" disabled={failed} onClick={() => arenaRef.current?.reset()} aria-label="Reset arena camera">↺ <span>Reset view</span></button>
        <button type="button" className="scene-button" disabled={failed} aria-pressed={paused} onClick={() => {
          arenaRef.current?.pause(!paused);
          setPaused(!paused);
        }}>{paused ? "Resume motion" : "Pause motion"}</button>
      </div>
    </div>
  );
}
