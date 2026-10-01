import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { LinearIssue } from "@t3tools/contracts";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, GitBranchIcon, KanbanIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useThreadShells } from "../../state/entities";
import { linearBoard, setLinearIssueState } from "../../state/linear";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import { ThreadStatusLabel } from "../ThreadStatusIndicators";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { RefreshIcon } from "../ui/refresh-icon";
import { SidebarInset } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { BoardPriorityIcon, BoardStateIcon } from "./BoardGlyphs";
import {
  applyPendingMoves,
  BOARD_COLUMNS,
  boardColumnKeyForIssue,
  groupIssuesByColumn,
  reconcilePendingMoves,
  targetStateName,
  threadForIssue,
  type PendingMove,
} from "./boardColumns";

const weekRangeFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function formatWeekRange(weekStartIso: string): string {
  const start = new Date(weekStartIso);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${weekRangeFormat.format(start)} – ${weekRangeFormat.format(end)}`;
}

export function BoardPage() {
  const environmentId = usePrimaryEnvironmentId();
  const board = useEnvironmentQuery(
    environmentId === null ? null : linearBoard({ environmentId, input: {} }),
  );
  const threads = useThreadShells();
  const moveIssue = useAtomCommand(setLinearIssueState, { reportFailure: false });
  const [pendingMoves, setPendingMoves] = useState<ReadonlyMap<string, PendingMove>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const fetchedIssues = board.data?.issues;
  // Superseded moves are ignored rather than deleted: a later drag of the same card replaces them.
  const liveMoves = useMemo(
    () => reconcilePendingMoves(fetchedIssues ?? [], pendingMoves),
    [fetchedIssues, pendingMoves],
  );
  const issues = useMemo(
    () => applyPendingMoves(fetchedIssues ?? [], liveMoves),
    [fetchedIssues, liveMoves],
  );
  const columns = useMemo(() => groupIssuesByColumn(issues), [issues]);
  const draggingIssue = issues.find((issue) => issue.id === draggingId) ?? null;

  const handleDragStart = (event: DragStartEvent) => setDraggingId(String(event.active.id));

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggingId(null);
    const issue = issues.find((candidate) => candidate.id === event.active.id);
    const column = BOARD_COLUMNS.find((candidate) => candidate.key === event.over?.id);
    if (environmentId === null || issue === undefined || column === undefined) return;
    if (boardColumnKeyForIssue(issue) === column.key) return;

    const original = fetchedIssues?.find((candidate) => candidate.id === issue.id);
    const stateName = targetStateName(column);
    setPendingMoves((moves) =>
      new Map(moves).set(issue.id, {
        stateName,
        fromUpdatedAt: original?.updatedAt ?? issue.updatedAt,
      }),
    );
    const result = await moveIssue({ environmentId, input: { issueId: issue.id, stateName } });
    if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
    setPendingMoves((moves) => {
      const next = new Map(moves);
      next.delete(issue.id);
      return next;
    });
    const failure = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: `Couldn't move ${issue.identifier} to ${column.title}`,
      description: failure instanceof Error ? failure.message : "Linear rejected the change.",
    });
  };

  const missingKey = board.error?.includes("LINEAR_API_KEY") ?? false;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader electron={isElectron}>
          <WorkspaceBreadcrumb ariaLabel="Board breadcrumb">
            <WorkspaceBreadcrumbItem current className="gap-2">
              <h1 className="truncate">This week</h1>
              {board.data ? (
                <span className="truncate font-normal text-muted-foreground">
                  {formatWeekRange(board.data.weekStart)}
                </span>
              ) : null}
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
          <div className="min-w-0 flex-1" />
          <Button
            onClick={board.refresh}
            aria-label="Refresh board"
            aria-busy={board.isPending}
            disabled={board.isPending}
            size="icon-sm"
            variant="ghost"
          >
            <RefreshIcon size="sm" refreshing={board.isPending} />
          </Button>
        </WorkspacePageHeader>

        {missingKey ? (
          <BoardConnectState />
        ) : (
          <>
            {board.error !== null ? (
              <p className="mx-4 mt-3 rounded-md bg-error-surface px-3 py-2 text-xs text-error-foreground">
                {board.error}
              </p>
            ) : null}
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragCancel={() => setDraggingId(null)}
              onDragEnd={(event) => void handleDragEnd(event)}
            >
              <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto px-3 pt-3 pb-3">
                {columns.map(({ column, issues: columnIssues }) => (
                  <BoardColumnView
                    key={column.key}
                    columnKey={column.key}
                    title={column.title}
                    count={columnIssues.length}
                    loading={board.data === null && board.isPending}
                  >
                    {columnIssues.map((issue) => (
                      <DraggableCard
                        key={issue.id}
                        issue={issue}
                        thread={threadForIssue(issue, threads)}
                        syncing={liveMoves.has(issue.id)}
                      />
                    ))}
                  </BoardColumnView>
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {draggingIssue ? (
                  <BoardCard
                    issue={draggingIssue}
                    thread={threadForIssue(draggingIssue, threads)}
                    syncing={false}
                    lifted
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </div>
    </SidebarInset>
  );
}

function BoardColumnView({
  columnKey,
  title,
  count,
  loading,
  children,
}: {
  columnKey: string;
  title: string;
  count: number;
  loading: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={cn(
        "flex w-[17.5rem] shrink-0 flex-col rounded-lg bg-muted/40 transition-colors",
        isOver && "bg-accent/70 ring-1 ring-border",
      )}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 px-3 text-sm">
        <BoardStateIcon columnKey={columnKey} />
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{count}</span>
      </header>
      <ol className="flex min-h-16 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5">
        {loading ? (
          <>
            <Skeleton className="h-18" />
            <Skeleton className="h-18" />
          </>
        ) : (
          children
        )}
      </ol>
    </section>
  );
}

function DraggableCard(props: {
  issue: LinearIssue;
  thread: EnvironmentThreadShell | null;
  syncing: boolean;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: props.issue.id });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none outline-none", isDragging && "opacity-40")}
    >
      <BoardCard {...props} lifted={false} />
    </li>
  );
}

function BoardCard({
  issue,
  thread,
  syncing,
  lifted,
}: {
  issue: LinearIssue;
  thread: EnvironmentThreadShell | null;
  syncing: boolean;
  lifted: boolean;
}) {
  const status = thread === null ? null : resolveThreadStatusPill({ thread });
  return (
    <article
      className={cn(
        "group/card flex cursor-grab flex-col gap-1.5 rounded-md border border-border/70 bg-card px-3 py-2.5 text-sm shadow-xs transition-[border-color,box-shadow] hover:border-border",
        lifted && "cursor-grabbing border-border shadow-lg",
      )}
    >
      <div className="flex h-4 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums">{issue.identifier}</span>
        {syncing ? <Spinner size="sm" className="size-3" /> : null}
        <div className="flex-1" />
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${issue.identifier} in Linear`}
          onPointerDown={(event) => event.stopPropagation()}
          className="opacity-0 transition-opacity group-hover/card:opacity-100 hover:text-foreground focus-visible:opacity-100"
        >
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>
      <p className="line-clamp-2 leading-snug font-medium">{issue.title}</p>
      <div className="mt-0.5 flex h-5 items-center gap-1.5">
        <BoardPriorityIcon priority={issue.priority} />
        {thread !== null ? (
          <Link
            to="/$environmentId/$threadId"
            params={buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id))}
            onPointerDown={(event) => event.stopPropagation()}
            className="flex h-5 min-w-0 items-center gap-1 rounded border border-border/70 px-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground"
          >
            {status !== null ? (
              <ThreadStatusLabel status={status} compact />
            ) : (
              <GitBranchIcon className="size-3" />
            )}
            <span className="truncate">{status?.label ?? "Thread"}</span>
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function BoardConnectState() {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <KanbanIcon />
        </EmptyMedia>
        <EmptyTitle>Connect Linear</EmptyTitle>
        <EmptyDescription>
          Add <code>LINEAR_API_KEY</code> to the server environment and restart it to see this
          week's issues here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
