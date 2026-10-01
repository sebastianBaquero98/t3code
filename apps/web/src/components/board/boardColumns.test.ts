import type { LinearIssue } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { boardColumnKeyForIssue, groupIssuesByColumn, threadForIssue } from "./boardColumns";

const issue = (overrides: Partial<LinearIssue>): LinearIssue => ({
  id: "id",
  identifier: "BRA-1",
  title: "Issue",
  url: "https://linear.app/braven/issue/BRA-1",
  priority: 3,
  branchName: "sebastian/bra-1-issue",
  stateId: "state",
  stateName: "To do",
  stateType: "unstarted",
  updatedAt: "2026-09-29T00:00:00.000Z",
  ...overrides,
});

describe("boardColumnKeyForIssue", () => {
  it("places Braven's workflow states, keeping both test states apart", () => {
    expect(
      [
        "To do",
        "In Progress",
        "Blocked",
        "In Review",
        "Ready to test by Product",
        "Testing",
        "Done",
        "Approved by Product",
      ].map((stateName) => boardColumnKeyForIssue(issue({ stateName, stateType: "started" }))),
    ).toEqual([
      "todo",
      "in-progress",
      "blocked",
      "in-review",
      "ready-to-test",
      "testing",
      "done",
      "done",
    ]);
  });

  it("falls back to the Linear category for states the board does not name", () => {
    expect(boardColumnKeyForIssue(issue({ stateName: "Doing", stateType: "started" }))).toBe(
      "in-progress",
    );
    expect(boardColumnKeyForIssue(issue({ stateName: "Shipped", stateType: "completed" }))).toBe(
      "done",
    );
    expect(boardColumnKeyForIssue(issue({ stateName: "Icebox", stateType: "backlog" }))).toBeNull();
  });
});

describe("groupIssuesByColumn", () => {
  it("orders a column by urgency with no-priority last, then by most recent update", () => {
    const groups = groupIssuesByColumn([
      issue({ identifier: "none", priority: 0 }),
      issue({ identifier: "low", priority: 4 }),
      issue({ identifier: "urgent-old", priority: 1, updatedAt: "2026-09-28T00:00:00.000Z" }),
      issue({ identifier: "urgent-new", priority: 1, updatedAt: "2026-09-30T00:00:00.000Z" }),
    ]);
    expect(groups.map((group) => group.column.key)).toEqual([
      "todo",
      "in-progress",
      "blocked",
      "in-review",
      "ready-to-test",
      "testing",
      "done",
    ]);
    expect(groups[0]!.issues.map((entry) => entry.identifier)).toEqual([
      "urgent-new",
      "urgent-old",
      "low",
      "none",
    ]);
  });
});

describe("threadForIssue", () => {
  const thread = (id: string, branch: string | null, updatedAt: string) => ({
    id,
    branch,
    updatedAt,
    archivedAt: null as string | null,
  });

  it("picks the newest live thread on the issue's branch", () => {
    const threads = [
      thread("other-branch", "main", "2026-09-30T00:00:00.000Z"),
      thread("older", "sebastian/bra-1-issue", "2026-09-28T00:00:00.000Z"),
      thread("newer", "sebastian/bra-1-issue", "2026-09-29T00:00:00.000Z"),
      {
        ...thread("archived", "sebastian/bra-1-issue", "2026-09-30T00:00:00.000Z"),
        archivedAt: "x",
      },
    ];
    expect(threadForIssue(issue({}), threads)?.id).toBe("newer");
    expect(threadForIssue(issue({ branchName: "nobody/bra-9" }), threads)).toBeNull();
  });
});
