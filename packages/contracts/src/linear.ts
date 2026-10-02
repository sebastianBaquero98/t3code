import * as Schema from "effect/Schema";

/** Linear's own workflow state categories; the board places cards by state name within them. */
export const LinearStateType = Schema.Literals([
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
]);
export type LinearStateType = typeof LinearStateType.Type;

export const LinearIssue = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  url: Schema.String,
  /** 0 = none, 1 = urgent, 2 = high, 3 = medium, 4 = low. */
  priority: Schema.Number,
  /** Linear's suggested git branch; the board links an issue to the thread on this branch. */
  branchName: Schema.String,
  stateId: Schema.String,
  stateName: Schema.String,
  stateType: LinearStateType,
  updatedAt: Schema.String,
  /** Calendar date (YYYY-MM-DD) the issue is due, without a time of day. */
  dueDate: Schema.NullOr(Schema.String),
  /** When the issue's SLA breaches, and when it turns high risk. */
  slaBreachesAt: Schema.NullOr(Schema.String),
  slaHighRiskAt: Schema.NullOr(Schema.String),
  cycleNumber: Schema.NullOr(Schema.Number),
  project: Schema.NullOr(Schema.Struct({ name: Schema.String, color: Schema.String })),
});
export type LinearIssue = typeof LinearIssue.Type;

export const LinearBoardInput = Schema.Struct({});
export type LinearBoardInput = typeof LinearBoardInput.Type;

export const LinearBoardResult = Schema.Struct({
  /** Monday 00:00 in the server's time zone; completed issues before it are left off. */
  weekStart: Schema.String,
  issues: Schema.Array(LinearIssue),
});
export type LinearBoardResult = typeof LinearBoardResult.Type;

export const LinearSetIssueStateInput = Schema.Struct({
  issueId: Schema.String,
  /** A state name in the issue's own team workflow, e.g. "In Review". */
  stateName: Schema.String,
});
export type LinearSetIssueStateInput = typeof LinearSetIssueStateInput.Type;

export const LinearIssueDetailInput = Schema.Struct({ issueId: Schema.String });
export type LinearIssueDetailInput = typeof LinearIssueDetailInput.Type;

export const LinearIssueDetail = Schema.Struct({
  /** Markdown body; read on demand because the board never needs it. */
  description: Schema.NullOr(Schema.String),
});
export type LinearIssueDetail = typeof LinearIssueDetail.Type;

export const LinearUnavailableReason = Schema.Literals([
  "missing_api_key",
  "request_failed",
  "unknown_state",
]);
export type LinearUnavailableReason = typeof LinearUnavailableReason.Type;

export class LinearUnavailableError extends Schema.TaggedError<LinearUnavailableError>()(
  "LinearUnavailableError",
  {
    reason: LinearUnavailableReason,
    detail: Schema.String,
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "missing_api_key":
        return "Set LINEAR_API_KEY on the T3 Code server to load the board.";
      case "unknown_state":
        return this.detail;
      case "request_failed":
        return `Linear request failed: ${this.detail}`;
    }
  }
}
