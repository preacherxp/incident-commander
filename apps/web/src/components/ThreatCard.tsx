import type { ThreatView } from "@incident-commander/cards";

const TAG_LABEL: Record<string, string> = {
  load: "load",
  deploy: "deploy",
  infra: "infra",
  people: "people",
  sudden: "sudden",
};

export function ThreatCard({ threat }: { threat: ThreatView }) {
  const blocked = threat.pierce ? 0 : threat.mitigated + threat.ward;
  return (
    <article
      className={`card-face threat-frame ${threat.negated ? "threat-countered" : "threat-pulse"}`}
      aria-label={`Incoming threat: ${threat.name}`}
    >
      <p className="label mb-3">{threat.negated ? "✓ Play neutralized" : "Jev’s next move"}</p>
      <div className="flex items-center justify-between">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`chip ${threat.tag === "sudden" ? "chip-threat" : ""}`}>
            {TAG_LABEL[threat.tag] ?? threat.tag}
          </span>
          {threat.pierce ? <span className="chip chip-threat">pierces shields</span> : null}
        </span>
        <span className="card-glyph text-threat" aria-hidden>
          {threat.glyph}
        </span>
      </div>
      <span className="card-name">{threat.name}</span>
      <span className="card-text">{threat.text}</span>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex items-baseline justify-between">
          <dt className="label">Harm if it lands</dt>
          <dd className="metric text-threat">
            {threat.projectedHarm}
            {blocked > 0 && !threat.negated ? (
              <span className="text-ink-soft"> (blocking {Math.min(blocked, threat.harm)})</span>
            ) : null}
          </dd>
        </div>
        {threat.stabilityDamage > 0 ? (
          <div className="flex items-baseline justify-between">
            <dt className="label">Stability hit</dt>
            <dd className="metric text-warn">−{threat.projectedStability}</dd>
          </div>
        ) : null}
        {threat.drainFocus > 0 ? (
          <div className="flex items-baseline justify-between">
            <dt className="label">Focus drain</dt>
            <dd className="metric text-warn">−{threat.drainFocus}</dd>
          </div>
        ) : null}
        {threat.drawPenalty > 0 ? (
          <div className="flex items-baseline justify-between">
            <dt className="label">Next hand</dt>
            <dd className="metric text-warn">−{threat.drawPenalty} cards</dd>
          </div>
        ) : null}
        {threat.bleed ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="label">Adds a bleed</dt>
            <dd className="metric text-threat">+{threat.bleed.harm} harm × {threat.bleed.rounds}r</dd>
          </div>
        ) : null}
      </dl>
      {threat.recoveryPenalty > 0 ? <p className="recovery-lock"><strong>Recovery disrupted</strong> Contain gains −{threat.recoveryPenalty}. {threat.pierce ? "Counter to restore." : "Fully shield or counter to restore."}</p> : null}
      <span className={`card-kind ${threat.negated ? "kind-recover" : "kind-chaos"}`}>
        {threat.negated ? "countered" : "hits when you end the round"}
      </span>
    </article>
  );
}
