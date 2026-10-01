import { LinearIssue, LinearUnavailableError } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/**
 * The viewer's open work (To do and every started state, Blocked included) whatever its age,
 * plus what they finished since Monday. Backlog, triage, and canceled issues stay off the board.
 */
const BOARD_QUERY = `
  query Board($weekStart: DateTimeOrDuration!) {
    viewer {
      assignedIssues(
        first: 250
        filter: {
          or: [
            { state: { type: { in: ["unstarted", "started"] } } }
            { state: { type: { eq: "completed" } }, completedAt: { gte: $weekStart } }
          ]
        }
      ) {
        nodes {
          id
          identifier
          title
          url
          priority
          branchName
          updatedAt
          state { id name type }
        }
      }
    }
  }
`;

const BoardResponse = Schema.Struct({
  data: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        viewer: Schema.Struct({
          assignedIssues: Schema.Struct({
            nodes: Schema.Array(
              Schema.Struct({
                id: Schema.String,
                identifier: Schema.String,
                title: Schema.String,
                url: Schema.String,
                priority: Schema.Number,
                branchName: Schema.String,
                updatedAt: Schema.String,
                state: Schema.Struct({
                  id: Schema.String,
                  name: Schema.String,
                  type: LinearIssue.fields.stateType,
                }),
              }),
            ),
          }),
        }),
      }),
    ),
  ),
  errors: Schema.optional(Schema.Array(Schema.Struct({ message: Schema.String }))),
});

/** Monday 00:00 of the week containing `now`, on the wall clock of `zone`. */
export function startOfWeek(now: DateTime.DateTime, zone: DateTime.TimeZone): DateTime.Zoned {
  return DateTime.startOf(DateTime.setZone(now, zone), "week", { weekStartsOn: 1 });
}

const requestFailed = (detail: string) =>
  new LinearUnavailableError({ reason: "request_failed", detail });

export const loadLinearBoard = Effect.fn("loadLinearBoard")(
  function* (apiKey: string | undefined, now: DateTime.DateTime, zone: DateTime.TimeZone) {
    if (apiKey === undefined || apiKey.trim() === "") {
      return yield* new LinearUnavailableError({
        reason: "missing_api_key",
        detail: "LINEAR_API_KEY is not set",
      });
    }
    const weekStart = DateTime.formatIso(startOfWeek(now, zone));
    const client = yield* HttpClient.HttpClient;
    const response = yield* client
      .execute(
        HttpClientRequest.post(LINEAR_GRAPHQL_URL).pipe(
          // Personal API keys go in the header as-is; only OAuth tokens take a Bearer prefix.
          HttpClientRequest.setHeader("authorization", apiKey.trim()),
          HttpClientRequest.bodyJsonUnsafe({ query: BOARD_QUERY, variables: { weekStart } }),
        ),
      )
      .pipe(Effect.mapError((cause) => requestFailed(cause.message)));
    const body = yield* response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(BoardResponse)),
      Effect.mapError((cause) => requestFailed(`HTTP ${response.status}: ${cause.message}`)),
    );
    const firstError = body.errors?.[0]?.message;
    if (firstError !== undefined || body.data == null) {
      return yield* requestFailed(firstError ?? `HTTP ${response.status}`);
    }
    return {
      weekStart,
      issues: body.data.viewer.assignedIssues.nodes.map((node) => ({
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        url: node.url,
        priority: node.priority,
        branchName: node.branchName,
        updatedAt: node.updatedAt,
        stateId: node.state.id,
        stateName: node.state.name,
        stateType: node.state.type,
      })),
    };
  },
  Effect.timeout("20 seconds"),
  Effect.catchTag("TimeoutError", () => Effect.fail(requestFailed("timed out"))),
);
