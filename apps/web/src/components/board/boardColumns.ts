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

/** The issue's working thread: the newest unarchived thread on the branch Linear named for it. */
export function threadForIssue<
  T extends {
    readonly branch: string | null;
    readonly archivedAt: string | null;
    readonly updatedAt: string;
  },
>(issue: Pick<LinearIssue, "branchName">, threads: ReadonlyArray<T>): T | null {
  let newest: T | null = null;
  for (const thread of threads) {
    if (thread.archivedAt !== null || thread.branch !== issue.branchName) continue;
    if (newest === null || thread.updatedAt > newest.updatedAt) newest = thread;
  }
  return newest;
}
