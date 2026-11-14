export function JevBubble({
  line,
  pending,
}: {
  line: string;
  pending: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="orb" aria-hidden>
        ◈
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
          <h2 className="text-lg text-threat">Jev</h2>
          <span className="label">the adversary</span>
        </div>
        <p
          className="mt-1 min-h-[3rem] text-sm text-ink"
          aria-live="polite"
          aria-busy={pending}
        >
          {line || (pending ? "…" : "Waiting for your move, commander.")}
        </p>
      </div>
    </div>
  );
}
