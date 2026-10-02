import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { connectionAtomRuntime } from "../connection/runtime";

/** The Linear board, read through the environment that holds LINEAR_API_KEY and polled once a minute. */
export const linearBoard = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:linear:board",
  tag: WS_METHODS.linearBoard,
  staleTimeMs: 30_000,
  refreshIntervalMs: 60_000,
});

/** Moves an issue in Linear, then re-reads the board so the card settles on Linear's answer. */
export const setLinearIssueState = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:linear:set-issue-state",
  tag: WS_METHODS.linearSetIssueState,
  onSettled: ({ environmentId }, registry) =>
    Effect.sync(() => registry.refresh(linearBoard({ environmentId, input: {} }))),
});

/** The issue body, read once when work on it starts. */
export const loadLinearIssueDetail = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:linear:issue-detail",
  tag: WS_METHODS.linearIssueDetail,
});

/** One-shot ref listing, to find the branch an issue worktree starts from. */
export const listBoardProjectRefs = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:linear:list-project-refs",
  tag: WS_METHODS.vcsListRefs,
});
