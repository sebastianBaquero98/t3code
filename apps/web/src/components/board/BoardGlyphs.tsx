import { cn } from "../../lib/utils";

interface StateGlyph {
  /** How far the workflow has come, drawn as a pie inside the ring. */
  readonly progress: number;
  readonly tone: string;
  readonly variant?: "blocked" | "done";
}

// Linear's shapes, the active theme's colors: a hollow ring to start, a pie that fills as work
// advances, a solid check when it ships. Blocked breaks the sequence with a bar.
const STATE_GLYPHS: Record<string, StateGlyph> = {
  todo: { progress: 0, tone: "text-muted-foreground" },
  "in-progress": { progress: 0.5, tone: "text-warning" },
  blocked: { progress: 0, tone: "text-destructive", variant: "blocked" },
  "in-review": { progress: 0.75, tone: "text-success" },
  "ready-to-test": { progress: 0.75, tone: "text-info" },
  testing: { progress: 0.9, tone: "text-update" },
  done: { progress: 1, tone: "text-primary", variant: "done" },
};

function piePath(progress: number): string {
  const radius = 3.5;
  const angle = progress * 2 * Math.PI;
  const x = 7 + radius * Math.sin(angle);
  const y = 7 - radius * Math.cos(angle);
  return `M7 7 L7 ${7 - radius} A${radius} ${radius} 0 ${progress > 0.5 ? 1 : 0} 1 ${x} ${y} Z`;
}

export function BoardStateIcon({
  columnKey,
  className,
}: {
  columnKey: string;
  className?: string;
}) {
  const glyph = STATE_GLYPHS[columnKey] ?? STATE_GLYPHS.todo!;
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0", glyph.tone, className)}
    >
      {glyph.variant === "done" ? (
        <>
          <circle cx="7" cy="7" r="6" fill="currentColor" />
          <path
            d="M4.5 7.2 L6.2 8.8 L9.5 5.4"
            fill="none"
            stroke="var(--color-background)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          {glyph.variant === "blocked" ? (
            <path d="M4.5 7 H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : glyph.progress > 0 ? (
            <path d={piePath(glyph.progress)} fill="currentColor" />
          ) : null}
        </>
      )}
    </svg>
  );
}

export const PRIORITY_LABEL: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

export function BoardPriorityIcon({ priority }: { priority: number }) {
  const label = PRIORITY_LABEL[priority] ?? PRIORITY_LABEL[0]!;
  if (priority === 1) {
    return (
      <svg viewBox="0 0 14 14" role="img" aria-label={label} className="size-3.5 shrink-0">
        <title>{label}</title>
        <rect x="1" y="1" width="12" height="12" rx="3" className="fill-warning" />
        <path
          d="M7 4 V7.6"
          stroke="var(--color-background)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="7" cy="10" r="0.9" fill="var(--color-background)" />
      </svg>
    );
  }
  if (priority < 2 || priority > 4) {
    return (
      <svg viewBox="0 0 14 14" role="img" aria-label={label} className="size-3.5 shrink-0">
        <title>{label}</title>
        {[2, 6, 10].map((x) => (
          <rect
            key={x}
            x={x - 0.75}
            y="6.25"
            width="2.5"
            height="1.5"
            rx="0.5"
            className="fill-muted-foreground/60"
          />
        ))}
      </svg>
    );
  }
  // High lights three bars, Medium two, Low one.
  const lit = 5 - priority;
  return (
    <svg viewBox="0 0 14 14" role="img" aria-label={label} className="size-3.5 shrink-0">
      <title>{label}</title>
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1.5 + bar * 4}
          y={9 - bar * 3}
          width="3"
          height={3 + bar * 3}
          rx="0.75"
          className={bar < lit ? "fill-foreground/70" : "fill-muted-foreground/25"}
        />
      ))}
    </svg>
  );
}
