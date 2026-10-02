import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { LinearIssue } from "@t3tools/contracts";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/shared/threadPullRequests";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  BoxIcon,
  CalendarIcon,
  CalendarX2Icon,
  CornerDownRightIcon,
  FlameIcon,
  GitBranchIcon,
  PlayIcon,
  RefreshCcwDotIcon,
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
import { BoardPriorityIcon, BoardStateIcon, PRIORITY_LABEL } from "./BoardGlyphs";
import { parseTaskChecklist } from "./boardActions";
import { dueDateTone, formatDueDate, slaStatus, type MetaTone } from "./cardMeta";

export interface BoardCardActions {
  /** Opens the issue's worktree thread; offered on In Progress cards without one. */
  readonly onStart: (() => void) | null;
  /** Asks the issue's agent for commit, push and a PR; offered on idle In Review cards without one. */
  readonly onShip: (() => void) | null;
  /** Opens a read-only review thread in the issue's worktree. */
  readonly onReview: (() => void) | null;
}

const NO_ACTIONS: BoardCardActions = { onStart: null, onShip: null, onReview: null };

const TONE_CLASS: Record<MetaTone, string> = {
  muted: "text-board-text-muted",
  warning: "text-board-urgent",
  danger: "text-board-overdue",
};

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
  const now = new Date();
  const status = thread === null ? null : resolveThreadStatusPill({ thread });
  const working = thread !== null && resolveSidebarThreadStatus(thread) === "working";
  const pullRequest =
    thread === null ? null : resolveThreadCurrentPullRequestLink(thread.pullRequests);
  const pullRequestLook = PULL_REQUEST_STATE_PRESENTATION[pullRequest?.snapshot?.state ?? "open"];
  // The dashed edge says "the board asked for this and the agent is still on it".
  const inFlight = busy || (columnKey === "in-review" && working);
  const completed = columnKey === "done";
  const dueTone = issue.dueDate === null ? null : dueDateTone(issue.dueDate, now, completed);
  const sla =
    issue.slaBreachesAt === null || completed
      ? null
      : slaStatus(issue.slaBreachesAt, issue.slaHighRiskAt, now);

  const card = (
    <article
      className={cn(
        "group/card flex cursor-grab flex-col gap-2 rounded-lg border border-board-card-border bg-board-card px-3.5 pt-3 pb-3.5 text-board-text shadow-xs transition-[border-color,box-shadow] hover:shadow-sm",
        inFlight && "border-dashed border-board-text-muted/50",
        lifted && "cursor-grabbing shadow-lg",
      )}
    >
      <div className="flex h-4 items-center gap-1.5 text-xs text-board-text-muted">
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <BoardPriorityIcon priority={issue.priority} />
          </TooltipTrigger>
          <TooltipPopup side="top">{PRIORITY_LABEL[issue.priority] ?? "No priority"}</TooltipPopup>
        </Tooltip>
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
            className="hover:text-board-text"
          >
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <BoardStateIcon columnKey={columnKey} className="mt-0.5" />
        <p className="line-clamp-2 text-sm leading-snug font-medium">{issue.title}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {issue.dueDate !== null && dueTone !== null ? (
          <Chip>
            {dueTone === "danger" ? (
              <CalendarX2Icon className={cn("size-3.5", TONE_CLASS.danger)} />
            ) : (
              <CalendarIcon className={cn("size-3.5", TONE_CLASS[dueTone])} />
            )}
            {formatDueDate(issue.dueDate)}
          </Chip>
        ) : null}
        {sla !== null ? (
          <Chip>
            <FlameIcon className={cn("size-3.5", TONE_CLASS[sla.tone])} />
            <span className={cn(sla.tone !== "muted" && TONE_CLASS[sla.tone])}>{sla.label}</span>
          </Chip>
        ) : null}
        {issue.cycleNumber !== null ? (
          <Chip>
            <RefreshCcwDotIcon className="size-3.5 text-board-accent" />
            <span className="tabular-nums">{issue.cycleNumber}</span>
          </Chip>
        ) : null}
        {issue.project !== null ? (
          <Chip>
            {/* Linear's own project color, the way Linear marks the project everywhere. */}
            <BoxIcon className="size-3.5" style={{ color: issue.project.color }} />
            <span className="max-w-32 truncate">{issue.project.name}</span>
          </Chip>
        ) : null}
        {thread !== null ? (
          <ThreadLink thread={thread}>
            <Chip interactive>
              {status !== null ? (
                <ThreadStatusLabel status={status} compact />
              ) : (
                <GitBranchIcon className="size-3.5" />
              )}
              <span className="max-w-28 truncate">{status?.label ?? "Thread"}</span>
            </Chip>
          </ThreadLink>
        ) : null}
        {pullRequest !== null ? (
          <a
            href={pullRequest.url}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Chip interactive>
              <pullRequestLook.Icon className={cn("size-3.5", pullRequestLook.toneClassName)} />
              <span className="tabular-nums">#{pullRequest.number}</span>
            </Chip>
          </a>
        ) : null}
        {actions.onStart !== null ? (
          <ActionChip onClick={actions.onStart} icon={<PlayIcon className="size-3" />}>
            Start work
          </ActionChip>
        ) : actions.onShip !== null && pullRequest === null ? (
          <ActionChip
            onClick={actions.onShip}
            icon={<PullRequestGlyph.pullRequest className="size-3" />}
          >
            Open PR
          </ActionChip>
        ) : null}
      </div>

      {reviews.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-board-card-border pt-2">
          {reviews.map((review) => {
            const reviewStatus = resolveThreadStatusPill({ thread: review });
            return (
              <li key={review.id}>
                <ThreadLink thread={review}>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-board-text-muted hover:text-board-text">
                    <CornerDownRightIcon className="size-3 shrink-0" />
                    <span className="truncate">{review.title}</span>
                    {reviewStatus !== null ? (
                      <ThreadStatusLabel status={reviewStatus} compact />
                    ) : null}
                  </span>
                </ThreadLink>
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
                className="h-full rounded-full bg-board-accent"
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
            <p className="text-board-state-review">Checklist complete.</p>
          )}
        </>
      )}
    </div>
  );
}

/** Linear's metadata pill: hairline border, muted text, icon first. */
function Chip({ interactive = false, children }: { interactive?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-0 items-center gap-1 rounded-full border border-board-chip-border px-2 text-xs text-board-text-muted",
        interactive && "hover:text-board-text",
      )}
    >
      {children}
    </span>
  );
}

function ThreadLink({ thread, children }: { thread: EnvironmentThreadShell; children: ReactNode }) {
  return (
    <Link
      to="/$environmentId/$threadId"
      params={buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id))}
      onPointerDown={(event) => event.stopPropagation()}
      className="min-w-0"
    >
      {children}
    </Link>
  );
}

function ActionChip({
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
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-dashed border-board-chip-border px-2 text-xs text-board-text-muted hover:border-solid hover:text-board-text"
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
            className="hover:text-board-text"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}
