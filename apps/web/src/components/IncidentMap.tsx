import { useEffect, useRef, useState } from "react";
import type { ThreatTag } from "@incident-commander/cards";

const POS: Record<string, [number, number]> = {
  gateway: [0.5, 0.12],
  checkout: [0.26, 0.4],
  catalog: [0.76, 0.4],
  payments: [0.74, 0.78],
  database: [0.3, 0.78],
};

const EDGES: Array<[string, string]> = [
  ["gateway", "checkout"],
  ["gateway", "catalog"],
  ["checkout", "database"],
  ["catalog", "database"],
  ["checkout", "payments"],
];

const TAG_TARGET: Record<ThreatTag, string> = {
  load: "gateway",
  deploy: "checkout",
  infra: "database",
  people: "catalog",
  sudden: "payments",
};

const COLORS = {
  threat: "#ff6a3d",
  warn: "#f7c948",
  accent: "#5eead4",
  soft: "#8e9aac",
  edge: "rgba(255,255,255,0.16)",
};

function useSize(ref: React.RefObject<HTMLDivElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 320, height: 420 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function IncidentMap({
  threatTag,
  bleeds,
  stability,
  stabilityTarget,
}: {
  threatTag: ThreatTag | null;
  bleeds: number;
  stability: number;
  stabilityTarget: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(ref);
  const threatened = threatTag ? TAG_TARGET[threatTag] : null;
  const settled = stabilityTarget > 0 && stability / stabilityTarget >= 0.5;
  const padX = 16;
  const padY = 40;
  const point = (service: string): [number, number] => {
    const [nx, ny] = POS[service] as [number, number];
    return [padX + nx * Math.max(1, width - padX * 2), padY + ny * Math.max(1, height - padY * 2 - 14)];
  };
  const colorOf = (service: string): string => {
    if (threatened === service) return COLORS.threat;
    if (bleeds > 0 && service === "database") return COLORS.warn;
    return settled ? COLORS.accent : COLORS.soft;
  };
  const fontSize = Math.max(9, Math.min(11, width * 0.03));

  return (
    <div
      ref={ref}
      className="relative h-full min-h-[16rem] w-full overflow-hidden rounded-xl border rule bg-black/20"
      role="img"
      aria-label="Live incident map of the service graph"
    >
      <svg width={width} height={height} className="block">
        {EDGES.map(([from, to]) => {
          const [x1, y1] = point(from);
          const [x2, y2] = point(to);
          const active = threatened === from || threatened === to;
          return (
            <line
              key={`${from}-${to}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={active ? COLORS.threat : COLORS.edge}
              strokeWidth={active ? 1.8 : 1}
              className="map-edge"
              opacity={active ? 0.95 : 0.6}
            />
          );
        })}
        {Object.keys(POS).map((service) => {
          const [x, y] = point(service);
          const isThreatened = threatened === service;
          const boxWidth = service === "database" ? 64 : 56;
          const boxHeight = 21;
          return (
            <g key={service}>
              {isThreatened ? (
                <>
                  <circle cx={x} cy={y} r={boxWidth * 0.85} fill="none" stroke={COLORS.threat} strokeWidth={1} opacity={0.35} className="node-pulse" />
                  <circle cx={x} cy={y} r={boxWidth * 0.62} fill={COLORS.threat} opacity={0.07} className="node-pulse" />
                </>
              ) : null}
              <rect
                x={x - boxWidth / 2}
                y={y - boxHeight / 2}
                width={boxWidth}
                height={boxHeight}
                rx={7}
                fill="rgba(9,13,19,0.94)"
                stroke={colorOf(service)}
                strokeWidth={isThreatened ? 1.6 : 1}
              />
              <text
                x={x}
                y={y + fontSize * 0.36}
                textAnchor="middle"
                fill={colorOf(service)}
                fontSize={fontSize}
                fontFamily="IBM Plex Mono, monospace"
                letterSpacing="0.1em"
              >
                {service.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
      <span className="absolute bottom-2 left-3 text-[10px] uppercase tracking-[0.2em] text-ink-faint">
        {threatTag ? `${threatTag} pressure on ${TAG_TARGET[threatTag]}` : "no live pressure"}
      </span>
    </div>
  );
}
