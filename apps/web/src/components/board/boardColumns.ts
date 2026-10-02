import type { LinearIssue } from "@t3tools/contracts";

export interface BoardColumn {
  readonly key: string;
  readonly title: string;
  /** Linear workflow state names that land in this column. */
  readonly states: ReadonlyArray<string>;
}

export const BOARD_COLUMNS: ReadonlyArray<BoardColumn> = [
  { key: "todo", title: "To do", states: ["To do"] },
  { key: "in-progress", title: "In Progress", states: ["In Progress"] },
  { key: "blocked", title: "Blocked", states: ["Blocked"] },
  { key: "in-review", title: "In Review", states: ["In Review"] },
  { key: "ready-to-test", title: "Ready to test", states: ["Ready to test by Product"] },
  { key: "testing", title: "Testing", states: ["Testing"] },
  { key: "done", title: "Done", states: ["Done", "Approved by Product"] },
];

// A state the board does not name (another team's workflow, a renamed state) still shows up,
// in the column its Linear category matches.
const FALLBACK_COLUMN_BY_TYPE: Partial<Record<LinearIssue["stateType"], string>> = {
  unstarted: "todo",
  started: "in-progress",
  completed: "done",
};

export function boardColumnKeyForIssue(issue: LinearIssue): string | null {
  const named = BOARD_COLUMNS.find((column) => column.states.includes(issue.stateName));
  return named?.key ?? FALLBACK_COLUMN_BY_TYPE[issue.stateType] ?? null;
}

// Linear's priority 0 means "no priority", which sorts after Low.
const priorityRank = (priority: number) => (priority === 0 ? 5 : priority);

/** Every column, in board order, holding its issues most urgent first, then most recently touched. */
export function groupIssuesByColumn(
  issues: ReadonlyArray<LinearIssue>,
): ReadonlyArray<{ readonly column: BoardColumn; readonly issues: ReadonlyArray<LinearIssue> }> {
  return BOARD_COLUMNS.map((column) => ({
    column,
    issues: issues
      .filter((issue) => boardColumnKeyForIssue(issue) === column.key)
      .toSorted(
        (left, right) =>
          priorityRank(left.priority) - priorityRank(right.priority) ||
          right.updatedAt.localeCompare(left.updatedAt),
      ),
  }));
}

/** A drag the board shows before Linear confirms it. */
export interface PendingMove {
  readonly stateName: string;
  /** The issue's `updatedAt` when it was dragged; any newer Linear write supersedes the move. */
  readonly fromUpdatedAt: string;
}

/** The state a card dropped on `column` is moved to: the column's first named state. */
export function targetStateName(column: BoardColumn): string {
  return column.states[0]!;
}

export function applyPendingMoves(
  issues: ReadonlyArray<LinearIssue>,
  moves: ReadonlyMap<string, PendingMove>,
): ReadonlyArray<LinearIssue> {
  if (moves.size === 0) return issues;
  return issues.map((issue) => {
    const move = moves.get(issue.id);
    return move === undefined ? issue : { ...issue, stateName: move.stateName };
  });
}

/**
 * The moves still worth showing. Linear stays the source of truth: once the issue changes there
 * (our own write landing, or anyone else's), the fetched state replaces the optimistic one.
 */
export function reconcilePendingMoves(
  issues: ReadonlyArray<LinearIssue>,
  moves: ReadonlyMap<string, PendingMove>,
): ReadonlyMap<string, PendingMove> {
  let next: Map<string, PendingMove> | null = null;
  for (const [issueId, move] of moves) {
    const issue = issues.find((candidate) => candidate.id === issueId);
    if (issue !== undefined && issue.updatedAt === move.fromUpdatedAt) continue;
    next ??= new Map(moves);
    next.delete(issueId);
  }
  return next ?? moves;
}
