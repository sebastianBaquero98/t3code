import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { LinearIssue } from "@t3tools/contracts";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/shared/threadPullRequests";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  CornerDownRightIcon,
  GitBranchIcon,
  PlayIcon,
  ScanSearchIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { boardTaskFile } from "../../state/linear";
import { useEnvironmentQuery } from "../../state/query";
import { buildThreadRouteParams } from "../../threadRoutes";
import { PULL_REQUEST_STATE_PRESENTATION, PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { resolveSidebarThreadStatus, resolveThreadStatusPill } from "../Sidebar.logic";
import { ThreadStatusLabel } from "../ThreadStatusIndicators";
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "../ui/preview-card";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BoardPriorityIcon } from "./BoardGlyphs";
import { parseTaskChecklist } from "./boardActions";

export interface BoardCardActions {
  /** Opens the issue's worktree thread; offered on In Progress cards without one. */
  readonly onStart: (() => void) | null;
  /** Asks the issue's agent for commit, push and a PR; offered on idle In Review cards without one. */
  readonly onShip: (() => void) | null;
  /** Opens a read-only review thread in the issue's worktree. */
  readonly onReview: (() => void) | null;
}

const NO_ACTIONS: BoardCardActions = { onStart: null, onShip: null, onReview: null };

export function BoardCard({
  issue,
  columnKey,
  thread,
  reviews,
  busy,
  actions = NO_ACTIONS,
  lifted = false,
}: {
  issue: LinearIssue;
  columnKey: string;
  thread: EnvironmentThreadShell | null;
  reviews: ReadonlyArray<EnvironmentThreadShell>;
  /** A board action or Linear write for this card has not settled yet. */
  busy: boolean;
  actions?: BoardCardActions;
  lifted?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const status = thread === null ? null : resolveThreadStatusPill({ thread });
  const working = thread !== null && resolveSidebarThreadStatus(thread) === "working";
  const pullRequest =
    thread === null ? null : resolveThreadCurrentPullRequestLink(thread.pullRequests);
  const pullRequestLook = PULL_REQUEST_STATE_PRESENTATION[pullRequest?.snapshot?.state ?? "open"];
  // The dashed edge says "the board asked for this and the agent is still on it".
  const inFlight = busy || (columnKey === "in-review" && working);

  const card = (
    <article
      className={cn(
        "group/card flex cursor-grab flex-col gap-1.5 rounded-md border border-border/70 bg-card px-3 py-2.5 text-sm shadow-xs transition-[border-color,box-shadow] hover:border-border",
        inFlight && "border-dashed border-muted-foreground/60",
        lifted && "cursor-grabbing border-border shadow-lg",
      )}
    >
      <div className="flex h-4 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums">{issue.identifier}</span>
        {busy ? <Spinner size="sm" className="size-3" /> : null}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100">
          {actions.onReview !== null ? (
            <CardIconButton label="Launch hard review" onClick={actions.onReview}>
              <ScanSearchIcon className="size-3.5" />
            </CardIconButton>
          ) : null}
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${issue.identifier} in Linear`}
            onPointerDown={(event) => event.stopPropagation()}
            className="hover:text-foreground"
          >
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </div>
      </div>
      <p className="line-clamp-2 leading-snug font-medium">{issue.title}</p>
      <div className="mt-0.5 flex h-5 min-w-0 items-center gap-1.5">
        <BoardPriorityIcon priority={issue.priority} />
        {thread !== null ? (
          <ThreadChip thread={thread}>
            {status !== null ? (
              <ThreadStatusLabel status={status} compact />
            ) : (
              <GitBranchIcon className="size-3" />
            )}
            <span className="truncate">{status?.label ?? "Thread"}</span>
          </ThreadChip>
        ) : null}
        {pullRequest !== null ? (
          <a
            href={pullRequest.url}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(event) => event.stopPropagation()}
            className="flex h-5 shrink-0 items-center gap-1 rounded border border-border/70 px-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground"
          >
            <pullRequestLook.Icon className={cn("size-3", pullRequestLook.toneClassName)} />
            <span className="tabular-nums">#{pullRequest.number}</span>
          </a>
        ) : null}
        {actions.onStart !== null ? (
          <CardTextButton onClick={actions.onStart} icon={<PlayIcon className="size-3" />}>
            Start work
          </CardTextButton>
        ) : actions.onShip !== null && pullRequest === null ? (
          <CardTextButton
            onClick={actions.onShip}
            icon={<PullRequestGlyph.pullRequest className="size-3" />}
          >
            Open PR
          </CardTextButton>
        ) : null}
      </div>
      {reviews.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-border/60 pt-1.5">
          {reviews.map((review) => {
            const reviewStatus = resolveThreadStatusPill({ thread: review });
            return (
              <li key={review.id}>
                <ThreadChip thread={review} bare>
                  <CornerDownRightIcon className="size-3 shrink-0" />
                  <span className="truncate">{review.title}</span>
                  {reviewStatus !== null ? (
                    <ThreadStatusLabel status={reviewStatus} compact />
                  ) : null}
                </ThreadChip>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );

  if (thread === null || thread.worktreePath === null || lifted) return card;
  return (
    <PreviewCard open={previewOpen} onOpenChange={setPreviewOpen}>
      <PreviewCardTrigger render={<div />} delay={500} closeDelay={120}>
        {card}
      </PreviewCardTrigger>
      <PreviewCardPopup side="right" align="start">
        <div className="w-72 p-3">
          {previewOpen ? <TaskProgress thread={thread} worktreePath={thread.worktreePath} /> : null}
        </div>
      </PreviewCardPopup>
    </PreviewCard>
  );
}

/** "Where is it and what is left": the agent's own checklist in `task.md`. */
function TaskProgress({
  thread,
  worktreePath,
}: {
  thread: EnvironmentThreadShell;
  worktreePath: string;
}) {
  const file = useEnvironmentQuery(
    boardTaskFile({
      environmentId: thread.environmentId,
      input: { cwd: worktreePath, relativePath: "task.md" },
    }),
  );
  const status = resolveThreadStatusPill({ thread });
  const checklist = file.data === null ? null : parseTaskChecklist(file.data.contents);
  const step = thread.planProgress?.step;

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {status !== null ? <ThreadStatusLabel status={status} /> : <span>Idle</span>}
      </div>
      {step ? <p className="text-foreground">Now: {step}</p> : null}
      {checklist === null ? (
        <p className="text-muted-foreground">
          {file.isPending ? "Reading task.md…" : "No task.md in this worktree yet."}
        </p>
      ) : checklist.total === 0 ? (
        <p className="text-muted-foreground">task.md has no checklist yet.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(checklist.done / checklist.total) * 100}%` }}
              />
            </div>
            <span className="tabular-nums text-muted-foreground">
              {checklist.done}/{checklist.total}
            </span>
          </div>
          {checklist.next.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Next</span>
              <ul className="flex flex-col gap-0.5">
                {checklist.next.map((item) => (
                  <li key={item} className="line-clamp-2 text-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-success">Checklist complete.</p>
          )}
        </>
      )}
    </div>
  );
}

function ThreadChip({
  thread,
  bare = false,
  children,
}: {
  thread: EnvironmentThreadShell;
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to="/$environmentId/$threadId"
      params={buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id))}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        "flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground",
        !bare && "h-5 rounded border border-border/70 px-1.5 hover:border-border",
      )}
    >
      {children}
    </Link>
  );
}

function CardTextButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className="flex h-5 shrink-0 items-center gap-1 rounded border border-dashed border-border px-1.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground"
    >
      {icon}
      {children}
    </button>
  );
}

function CardIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            onPointerDown={(event) => event.stopPropagation()}
            className="hover:text-foreground"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}
