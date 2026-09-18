export function Meter({
  label,
  value,
  max,
  tone,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  tone: "meter-stability" | "meter-harm";
  detail?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="label">{label}</span>
        <span className="metric">
          {value}
          <span className="text-ink-faint"> / {max}</span>
        </span>
      </div>
      <div className="meter mt-1" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className={`meter-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {detail ? <p className="mt-1 text-[10px] text-ink-faint">{detail}</p> : null}
    </div>
  );
}
