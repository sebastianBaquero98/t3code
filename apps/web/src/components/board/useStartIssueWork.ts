import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { DEFAULT_SERVER_SETTINGS, type LinearIssue } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useCallback } from "react";

import { newMessageId, newThreadId } from "../../lib/utils";
import { useServerConfigs } from "../../state/entities";
import { listBoardProjectRefs, loadLinearIssueDetail } from "../../state/linear";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildStartPrompt, defaultBranchName } from "./startIssueWork";

const failureText = (result: {
  readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"];
}) => {
  const failure = squashAtomCommandFailure(result);
  return failure instanceof Error ? failure.message : "The request failed.";
};

/**
 * Starts an issue the way a new worktree thread starts from the composer: a worktree on Linear's
 * branch name off the repository's default branch, the project's setup script, and a first turn
 * that writes `task.md`. Resolves to an error message, or null once the turn is dispatched.
 */
export function useStartIssueWork() {
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const loadDetail = useAtomCommand(loadLinearIssueDetail, { reportFailure: false });
  const listRefs = useAtomCommand(listBoardProjectRefs, { reportFailure: false });
  const serverConfigs = useServerConfigs();

  return useCallback(
    async (issue: LinearIssue, project: EnvironmentProject): Promise<string | null> => {
      const { environmentId } = project;
      const { settings } = resolveProjectSettings(
        serverConfigs.get(environmentId)?.settings ?? DEFAULT_SERVER_SETTINGS,
        project.id,
        project,
      );
      const modelSelection = settings.defaultModelSelection;
      if (modelSelection == null) {
        return `Choose a default model for ${project.title} in its project settings first.`;
      }
      const refs = await listRefs({
        environmentId,
        input: { cwd: project.workspaceRoot, refKind: "local" },
      });
      if (refs._tag === "Failure") return failureText(refs);
      const baseBranch = defaultBranchName(refs.value.refs);
      if (baseBranch === null) return `Couldn't find the default branch of ${project.title}.`;

      // A missing description should not block the start; the prompt says it is empty.
      const detail = await loadDetail({ environmentId, input: { issueId: issue.id } });
      const description = detail._tag === "Success" ? detail.value.description : null;

      const title = `${issue.identifier} · ${issue.title}`;
      const createdAt = new Date().toISOString();
      const runtimeMode = settings.defaultRuntimeMode;
      const result = await startTurn({
        environmentId,
        input: {
          threadId: newThreadId(),
          message: {
            messageId: newMessageId(),
            role: "user",
            text: buildStartPrompt(issue, description),
            attachments: [],
          },
          modelSelection,
          titleSeed: title,
          runtimeMode,
          interactionMode: "default",
          bootstrap: {
            createThread: {
              projectId: project.id,
              title,
              modelSelection,
              runtimeMode,
              interactionMode: "default",
              branch: baseBranch,
              worktreePath: null,
              createdAt,
            },
            prepareWorktree: {
              projectCwd: project.workspaceRoot,
              baseBranch,
              branch: issue.branchName,
              startFromOrigin: true,
            },
            runSetupScript: true,
          },
          createdAt,
        },
      });
      return result._tag === "Failure" ? failureText(result) : null;
    },
    [listRefs, loadDetail, serverConfigs, startTurn],
  );
}
