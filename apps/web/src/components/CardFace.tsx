import type { HandCardView } from "@incident-commander/cards";

const KIND_LABEL: Record<string, string> = {
  contain: "contain",
  communicate: "communicate",
  respond: "respond",
  recover: "recover",
};

export function CardFace({
  card,
  index,
  disabled,
  onPlay,
}: {
  card: HandCardView;
  index: number;
  disabled: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className="card-face deal-in"
      style={{ animationDelay: `${index * 50}ms` }}
      disabled={disabled}
      onClick={onPlay}
      title={card.reason ?? undefined}
      aria-label={`${card.name} — ${card.cost} focus`}
    >
      <span className="card-kicker">
        <span className="card-cost" aria-hidden>
          {card.cost}
        </span>
        <span className="card-glyph" aria-hidden>
          {card.glyph}
        </span>
      </span>
      <span className="card-name">{card.name}</span>
      <span className="card-text">{card.text}</span>
      <span className={`card-kind kind-${card.kind}`}>
        {KIND_LABEL[card.kind] ?? card.kind}
        {card.rarity === "rare" ? " · rare" : ""}
      </span>
    </button>
  );
}
