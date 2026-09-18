import type { ThreatView } from "@incident-commander/cards";

const TAG_LABEL: Record<string, string> = {
  load: "load",
  deploy: "deploy",
  infra: "infra",
  people: "people",
  sudden: "sudden",
};

export function ThreatCard({ threat }: { threat: ThreatView }) {
  const blocked = threat.mitigated + threat.ward;
  return (
    <article
      className={`card-face threat-frame w-[12.5rem] ${threat.negated ? "" : "threat-pulse"}`}
      aria-label={`Incoming threat: ${threat.name}`}
    >
      <div className="flex items-center justify-between">
        <span className={`chip ${threat.tag === "sudden" ? "chip-threat" : ""}`}>
          {TAG_LABEL[threat.tag] ?? threat.tag}
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
      </dl>
      <span className={`card-kind ${threat.negated ? "kind-recover" : "kind-chaos"}`}>
        {threat.negated ? "countered" : "hits when you end the round"}
      </span>
    </article>
  );
}
