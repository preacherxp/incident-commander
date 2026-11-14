import type { HandCardView, ThreatView } from "@incident-commander/cards";

export function CardFace({ card, index, disabled, onPlay, threat, warRoom = false, nextContainBonus = 0 }: {
  card: HandCardView;
  index: number;
  disabled: boolean;
  onPlay: () => void;
  threat?: ThreatView | null;
  warRoom?: boolean;
  nextContainBonus?: number;
}) {
  const counter = threat && !threat.negated && card.negateTag === threat.tag;
  const combo = threat && card.comboTag?.tag === threat.tag ? card.comboTag.stability : 0;
  const bonus = warRoom && card.kind === "contain" && !card.warRoom ? 4 : 0;
  const penalty = card.kind === "contain" && !card.warRoom && !counter ? threat?.recoveryPenalty ?? 0 : 0;
  const setup = card.kind === "contain" && !card.warRoom ? nextContainBonus : 0;
  const cue = counter ? "Perfect counter" : combo ? `Combo +${combo}` : card.shield && threat?.pierce && !threat.negated ? "Shields ignored" : card.cost === 0 ? "Free play" : null;
  return (
    <button type="button" className={`card-face deal-in card-${card.kind} ${counter ? "card-counter" : ""}`}
      style={{ animationDelay: `${index * 35}ms` }} disabled={disabled} onClick={onPlay}
      title={card.reason ?? card.text} aria-label={`${card.name} — ${card.cost} focus`}>
      <span className="card-kicker">
        <span className="card-cost" aria-hidden>{card.cost}</span>
        <span className={`card-category kind-${card.kind}`}>{card.kind}</span>
      </span>
      <span className="card-art" aria-hidden>
        <span className="card-art-ring" />
        <span className="card-glyph">{card.glyph}</span>
        <span className="card-art-line" />
      </span>
      <span className="card-name">{card.name}</span>
      <span className="card-text">{card.text}</span>
      {setup > 0 ? <span className="text-xs text-accent">Combo +{setup} ready</span> : null}
      {penalty > 0 ? <span className="text-xs text-warn">−{penalty} while disrupted</span> : null}
      {bonus > 0 ? <span className="text-xs text-accent">+{bonus} from war room</span> : null}
      <span className={`card-kind ${counter || combo ? "text-accent" : "text-ink-soft"}`}>
        {disabled && card.reason ? card.reason : cue ?? (card.rarity === "rare" ? "✦ Rare" : "Click to play")}
      </span>
    </button>
  );
}
