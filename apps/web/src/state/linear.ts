import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

/** The Linear board, read through the environment that holds LINEAR_API_KEY and polled once a minute. */
export const linearBoard = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:linear:board",
  tag: WS_METHODS.linearBoard,
  staleTimeMs: 30_000,
  refreshIntervalMs: 60_000,
});
