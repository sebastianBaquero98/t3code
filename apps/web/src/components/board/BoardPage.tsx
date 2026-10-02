import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { LinearIssue } from "@t3tools/contracts";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/shared/threadPullRequests";
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
import { KanbanIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { usePrimaryEnvironmentId } from "../../state/environments";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "../../state/entities";
import { linearBoard, setLinearIssueState } from "../../state/linear";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { RefreshIcon } from "../ui/refresh-icon";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";
import { toastManager } from "../ui/toast";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { BoardCard, type BoardCardActions } from "./BoardCard";
import { BoardStateIcon } from "./BoardGlyphs";
import {
  buildShipPrompt,
  issueThreads,
  shouldMarkReadyToTest,
  shouldStartWork,
} from "./boardActions";
import {
  applyPendingMoves,
  BOARD_COLUMNS,
  boardColumnKeyForIssue,
  groupIssuesByColumn,
  reconcilePendingMoves,
  targetStateName,
  type PendingMove,
} from "./boardColumns";
import { pickBoardProject } from "./startIssueWork";
import { useSendToThread, useStartHardReview, useStartIssueWork } from "./useBoardActions";

const BOARD_PROJECT_STORAGE_KEY = "t3code:board-project-id";
const READY_TO_TEST_STATE = "Ready to test by Product";

const weekRangeFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function formatWeekRange(weekStartIso: string): string {
  const start = new Date(weekStartIso);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${weekRangeFormat.format(start)} – ${weekRangeFormat.format(end)}`;
}

const failureMessage = (result: Parameters<typeof squashAtomCommandFailure>[0]) => {
  const failure = squashAtomCommandFailure(result);
  return failure instanceof Error ? failure.message : "Linear rejected the change.";
};

export function BoardPage() {
  const environmentId = usePrimaryEnvironmentId();
  const board = useEnvironmentQuery(
    environmentId === null ? null : linearBoard({ environmentId, input: {} }),
  );
  const threads = useThreadShells();
  const threadsLoaded = useAllEnvironmentShellsBootstrapped();
  const projects = useProjects();
  const moveIssue = useAtomCommand(setLinearIssueState, { reportFailure: false });
  const startIssueWork = useStartIssueWork();
  const sendToThread = useSendToThread();
  const startHardReview = useStartHardReview();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [pendingMoves, setPendingMoves] = useState<ReadonlyMap<string, PendingMove>>(new Map());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [preferredProjectId, setPreferredProjectId] = useState(() =>
    localStorage.getItem(BOARD_PROJECT_STORAGE_KEY),
  );
  const project = pickBoardProject(projects, preferredProjectId);

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
  const threadsByIssue = useMemo(
    () => new Map(issues.map((issue) => [issue.id, issueThreads(issue, threads)])),
    [issues, threads],
  );
  const draggingIssue = issues.find((issue) => issue.id === draggingId) ?? null;

  /** Runs one board action per card at a time, surfacing its failure as a toast. */
  const runCardAction = useCallback(
    async (issue: LinearIssue, title: string, action: () => Promise<string | null>) => {
      setBusyIds((ids) => new Set(ids).add(issue.id));
      const error = await action();
      setBusyIds((ids) => {
        const next = new Set(ids);
        next.delete(issue.id);
        return next;
      });
      if (error !== null) toastManager.add({ type: "error", title, description: error });
    },
    [],
  );

  const moveToState = useCallback(
    async (issue: LinearIssue, stateName: string, fromUpdatedAt: string) => {
      if (environmentId === null) return;
      setPendingMoves((moves) => new Map(moves).set(issue.id, { stateName, fromUpdatedAt }));
      const result = await moveIssue({ environmentId, input: { issueId: issue.id, stateName } });
      if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
      setPendingMoves((moves) => {
        const next = new Map(moves);
        next.delete(issue.id);
        return next;
      });
      toastManager.add({
        type: "error",
        title: `Couldn't move ${issue.identifier} to ${stateName}`,
        description: failureMessage(result),
      });
    },
    [environmentId, moveIssue],
  );

  const startWork = useCallback(
    (issue: LinearIssue) =>
      runCardAction(issue, `Couldn't start ${issue.identifier}`, async () =>
        project === null
          ? "Pick the project issue worktrees start in, at the top of the board."
          : startIssueWork(issue, project),
      ),
    [project, runCardAction, startIssueWork],
  );

  const shipIssue = useCallback(
    (issue: LinearIssue, thread: EnvironmentThreadShell) =>
      runCardAction(issue, `Couldn't ask for the ${issue.identifier} PR`, async () =>
        resolveSidebarThreadStatus(thread) === "working"
          ? "The agent is still working. Use Open PR on the card once it finishes."
          : sendToThread(thread, buildShipPrompt(issue)),
      ),
    [runCardAction, sendToThread],
  );

  const reviewIssue = useCallback(
    (issue: LinearIssue, thread: EnvironmentThreadShell) =>
      runCardAction(issue, `Couldn't start a review of ${issue.identifier}`, () =>
        startHardReview(issue, thread),
      ),
    [runCardAction, startHardReview],
  );

  // A merged PR moves its In Review card on, once per issue, unless Linear already did.
  const markedReadyRef = useRef(new Set<string>());
  useEffect(() => {
    for (const issue of fetchedIssues ?? []) {
      const thread = threadsByIssue.get(issue.id)?.primary ?? null;
      const pullRequest =
        thread === null ? null : resolveThreadCurrentPullRequestLink(thread.pullRequests);
      const state = pullRequest?.snapshot?.state ?? null;
      if (!shouldMarkReadyToTest(issue, state) || markedReadyRef.current.has(issue.id)) continue;
      markedReadyRef.current.add(issue.id);
      void moveToState(issue, READY_TO_TEST_STATE, issue.updatedAt);
    }
  }, [fetchedIssues, moveToState, threadsByIssue]);

  const canStartWork = (issue: LinearIssue, columnKey: string) =>
    shouldStartWork({
      columnKey,
      hasAnyThread: threadsByIssue.get(issue.id)?.hasAnyThread ?? false,
      starting: busyIds.has(issue.id),
      threadsLoaded,
    });

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const issue = issues.find((candidate) => candidate.id === event.active.id);
    const column = BOARD_COLUMNS.find((candidate) => candidate.key === event.over?.id);
    if (issue === undefined || column === undefined) return;
    if (boardColumnKeyForIssue(issue) === column.key) return;

    const thread = threadsByIssue.get(issue.id)?.primary ?? null;
    if (canStartWork(issue, column.key)) void startWork(issue);
    if (column.key === "in-review" && thread !== null) void shipIssue(issue, thread);

    const original = fetchedIssues?.find((candidate) => candidate.id === issue.id);
    void moveToState(issue, targetStateName(column), original?.updatedAt ?? issue.updatedAt);
  };

  const actionsFor = (issue: LinearIssue, columnKey: string): BoardCardActions => {
    const thread = threadsByIssue.get(issue.id)?.primary ?? null;
    if (busyIds.has(issue.id)) return { onStart: null, onShip: null, onReview: null };
    return {
      onStart: canStartWork(issue, columnKey) ? () => void startWork(issue) : null,
      onShip:
        columnKey === "in-review" &&
        thread !== null &&
        resolveSidebarThreadStatus(thread) !== "working"
          ? () => void shipIssue(issue, thread)
          : null,
      onReview: thread !== null ? () => void reviewIssue(issue, thread) : null,
    };
  };

  const selectProject = (projectId: string) => {
    localStorage.setItem(BOARD_PROJECT_STORAGE_KEY, projectId);
    setPreferredProjectId(projectId);
  };

  const missingKey = board.error?.includes("LINEAR_API_KEY") ?? false;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-board-canvas text-board-text">
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
          {projects.length > 1 ? (
            <Select
              value={project?.id ?? ""}
              onValueChange={(value) => selectProject(String(value))}
            >
              <SelectTrigger
                aria-label="Project for new issue worktrees"
                size="compact"
                variant="ghost"
                className="w-auto min-w-0"
              >
                <SelectValue>{project?.title ?? "Choose project"}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {projects.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
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
              onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
              onDragCancel={() => setDraggingId(null)}
              onDragEnd={handleDragEnd}
            >
              <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pt-2 pb-4">
                {columns.map(({ column, issues: columnIssues }) => (
                  <BoardColumnView
                    key={column.key}
                    columnKey={column.key}
                    title={column.title}
                    count={columnIssues.length}
                    loading={board.data === null && board.isPending}
                  >
                    {columnIssues.map((issue) => {
                      const { primary, reviews } = threadsByIssue.get(issue.id) ?? {
                        primary: null,
                        reviews: [],
                      };
                      return (
                        <DraggableCard key={issue.id} id={issue.id}>
                          <BoardCard
                            issue={issue}
                            columnKey={column.key}
                            thread={primary}
                            reviews={reviews}
                            busy={liveMoves.has(issue.id) || busyIds.has(issue.id)}
                            actions={actionsFor(issue, column.key)}
                          />
                        </DraggableCard>
                      );
                    })}
                  </BoardColumnView>
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {draggingIssue ? (
                  <BoardCard
                    issue={draggingIssue}
                    columnKey={boardColumnKeyForIssue(draggingIssue) ?? "todo"}
                    thread={threadsByIssue.get(draggingIssue.id)?.primary ?? null}
                    reviews={[]}
                    busy={false}
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
        "flex w-80 shrink-0 flex-col rounded-lg bg-board-column transition-colors",
        isOver && "ring-1 ring-board-state-done/60",
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 px-3.5 text-sm text-board-heading">
        <BoardStateIcon columnKey={columnKey} />
        <span className="font-medium">{title}</span>
        <span className="text-board-text-muted">{count}</span>
      </header>
      <ol className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
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

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none outline-none", isDragging && "opacity-40")}
    >
      {children}
    </li>
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
