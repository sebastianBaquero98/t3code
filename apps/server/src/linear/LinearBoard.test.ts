// @effect-diagnostics preferSchemaOverJson:off - Mock HTTP responses use JSON fixtures.
import { assert, describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { loadLinearBoard, startOfWeek } from "./LinearBoard.ts";

const respondWith = (body: unknown, seen: Array<Record<string, unknown>> = []) =>
  HttpClient.make((request) =>
    Effect.sync(() => {
      seen.push({ url: request.url, authorization: request.headers.authorization });
      return HttpClientResponse.fromWeb(request, new Response(JSON.stringify(body)));
    }),
  );

const bogota = DateTime.zoneMakeNamedUnsafe("America/Bogota");
const at = (iso: string) => DateTime.makeUnsafe(iso);
const MONDAY_IN_BOGOTA = "2026-09-28T05:00:00.000Z";

describe("startOfWeek", () => {
  it("anchors every day of the week, Sunday night included, to that week's Monday", () => {
    for (const day of ["2026-09-28T05:00:00Z", "2026-10-01T17:30:00Z", "2026-10-05T04:59:59Z"]) {
      assert.strictEqual(DateTime.formatIso(startOfWeek(at(day), bogota)), MONDAY_IN_BOGOTA);
    }
    assert.strictEqual(
      DateTime.formatIso(startOfWeek(at("2026-10-05T05:00:00Z"), bogota)),
      "2026-10-05T05:00:00.000Z",
    );
  });
});

describe("loadLinearBoard", () => {
  it.effect("sends the personal key unprefixed and flattens each issue's state", () =>
    Effect.gen(function* () {
      const seen: Array<Record<string, unknown>> = [];
      const http = respondWith(
        {
          data: {
            viewer: {
              assignedIssues: {
                nodes: [
                  {
                    id: "issue-1",
                    identifier: "BRA-12",
                    title: "Kanban",
                    url: "https://linear.app/braven/issue/BRA-12",
                    priority: 2,
                    branchName: "sebastian/bra-12-kanban",
                    updatedAt: "2026-09-30T10:00:00.000Z",
                    state: { id: "state-1", name: "In Review", type: "started" },
                  },
                ],
              },
            },
          },
        },
        seen,
      );
      const board = yield* loadLinearBoard(
        " lin_api_key ",
        at("2026-09-30T12:00:00Z"),
        bogota,
      ).pipe(Effect.provideService(HttpClient.HttpClient, http));
      assert.deepEqual(seen, [
        { url: "https://api.linear.app/graphql", authorization: "lin_api_key" },
      ]);
      assert.strictEqual(board.weekStart, MONDAY_IN_BOGOTA);
      assert.deepEqual(board.issues[0], {
        id: "issue-1",
        identifier: "BRA-12",
        title: "Kanban",
        url: "https://linear.app/braven/issue/BRA-12",
        priority: 2,
        branchName: "sebastian/bra-12-kanban",
        updatedAt: "2026-09-30T10:00:00.000Z",
        stateId: "state-1",
        stateName: "In Review",
        stateType: "started",
      });
    }),
  );

  it.effect("fails as missing_api_key without calling Linear", () =>
    Effect.gen(function* () {
      const seen: Array<Record<string, unknown>> = [];
      for (const apiKey of [undefined, "  "]) {
        const error = yield* Effect.flip(
          loadLinearBoard(apiKey, at("2026-09-30T12:00:00Z"), bogota).pipe(
            Effect.provideService(HttpClient.HttpClient, respondWith({}, seen)),
          ),
        );
        assert.strictEqual(error.reason, "missing_api_key");
      }
      assert.deepEqual(seen, []);
    }),
  );

  it.effect("surfaces Linear's GraphQL error message", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        loadLinearBoard("bad", at("2026-09-30T12:00:00Z"), bogota).pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            respondWith({ data: null, errors: [{ message: "Authentication required" }] }),
          ),
        ),
      );
      assert.strictEqual(error.reason, "request_failed");
      assert.strictEqual(error.detail, "Authentication required");
    }),
  );
});
