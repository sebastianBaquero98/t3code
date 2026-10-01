import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { LinearIssue } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";
import { useMemo } from "react";

import { isElectron } from "../../env";
import { buildThreadRouteParams } from "../../threadRoutes";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useThreadShells } from "../../state/entities";
import { linearBoard } from "../../state/linear";
import { useEnvironmentQuery } from "../../state/query";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import { ThreadStatusLabel } from "../ThreadStatusIndicators";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { SidebarInset } from "../ui/sidebar";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { groupIssuesByColumn, threadForIssue } from "./boardColumns";

const PRIORITY_LABEL: Record<number, string> = { 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };

export function BoardPage() {
  const environmentId = usePrimaryEnvironmentId();
  const board = useEnvironmentQuery(
    environmentId === null ? null : linearBoard({ environmentId, input: {} }),
  );
  const threads = useThreadShells();
  const columns = useMemo(() => groupIssuesByColumn(board.data?.issues ?? []), [board.data]);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader electron={isElectron}>
          <WorkspaceBreadcrumb ariaLabel="Board breadcrumb">
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate">This week</h1>
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

        {board.error !== null ? (
          <p className="px-5 pt-6 text-sm text-destructive">{board.error}</p>
        ) : null}

        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pt-4 pb-4">
          {columns.map(({ column, issues }) => (
            <section
              key={column.key}
              aria-label={column.title}
              className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/40"
            >
              <header className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>{column.title}</span>
                <span>{issues.length}</span>
              </header>
              <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {issues.map((issue) => (
                  <li key={issue.id}>
                    <BoardCard issue={issue} thread={threadForIssue(issue, threads)} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </SidebarInset>
  );
}

function BoardCard({
  issue,
  thread,
}: {
  issue: LinearIssue;
  thread: EnvironmentThreadShell | null;
}) {
  const status = thread === null ? null : resolveThreadStatusPill({ thread });
  return (
    <article className="flex flex-col gap-1.5 rounded-md border bg-background px-3 py-2 text-sm shadow-xs">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{issue.identifier}</span>
        {PRIORITY_LABEL[issue.priority] ? <span>{PRIORITY_LABEL[issue.priority]}</span> : null}
        <div className="flex-1" />
        {status !== null ? <ThreadStatusLabel status={status} compact /> : null}
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${issue.identifier} in Linear`}
          className="hover:text-foreground"
        >
          <ExternalLinkIcon className="size-3.5" />
        </a>
      </div>
      {thread === null ? (
        <p className="line-clamp-3">{issue.title}</p>
      ) : (
        <Link
          to="/$environmentId/$threadId"
          params={buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id))}
          className="line-clamp-3 hover:underline"
        >
          {issue.title}
        </Link>
      )}
    </article>
  );
}
