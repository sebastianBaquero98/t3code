import type { LinearIssue } from "@t3tools/contracts";

/** What the board asks an issue's agent to do when its card enters In Review. */
export function buildShipPrompt(issue: Pick<LinearIssue, "identifier" | "title">): string {
  return [
    `${issue.identifier} pasó a In Review en el board. Prepara el PR:`,
    "",
    "1. Haz commit de los cambios de esta rama, sin incluir `task.md`.",
    "2. Haz push de la rama.",
    "3. Abre el PR siguiendo `.agents/skills/file-pr/SKILL.md` si el repo lo tiene.",
    `4. Incluye \`${issue.identifier}\` en el título del PR para que Linear lo enlace.`,
    "5. Marca en `task.md` lo que quedó hecho y responde con el enlace del PR.",
  ].join("\n");
}

/** A read-only adversarial review of the issue branch, run in its own thread. */
export function buildHardReviewPrompt(issue: Pick<LinearIssue, "identifier" | "title">): string {
  return [
    `Hard review de ${issue.identifier}: ${issue.title}`,
    "",
    "Revisa de forma adversarial los cambios de esta rama frente a su rama base.",
    "Usa `.agents/skills/repo-review/SKILL.md` si el repo lo tiene.",
    "No modifiques archivos: reporta hallazgos ordenados por severidad, con archivo, línea y el escenario que falla.",
  ].join("\n");
}

export interface TaskChecklist {
  readonly done: number;
  readonly total: number;
  /** The first unchecked steps, in order. */
  readonly next: ReadonlyArray<string>;
}

/** Reads the `- [ ]` / `- [x]` checklist an agent keeps in `task.md`. */
export function parseTaskChecklist(markdown: string, nextLimit = 3): TaskChecklist {
  let done = 0;
  let total = 0;
  const next: string[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (match === null) continue;
    total += 1;
    if (match[1] !== " ") done += 1;
    else if (next.length < nextLimit) next.push(match[2]!);
  }
  return { done, total, next };
}

interface IssueThreadCandidate {
  readonly title: string;
  readonly branch: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
}

/** The title the board gives an issue's own thread; it identifies the thread before its branch does. */
export function issueThreadTitle(issue: Pick<LinearIssue, "identifier" | "title">): string {
  return `${issue.identifier} · ${issue.title}`;
}

/**
 * The threads working on an issue: the first one opened is the issue's own thread, every later
 * one is a review the board launched against it. A thread belongs to the issue by its branch, or
 * by the board's title while its worktree is still being prepared on the base branch.
 */
export function issueThreads<T extends IssueThreadCandidate>(
  issue: Pick<LinearIssue, "identifier" | "branchName">,
  threads: ReadonlyArray<T>,
): {
  readonly primary: T | null;
  readonly reviews: ReadonlyArray<T>;
  /** Archived threads count: the issue already has a worktree, so the board must not open another. */
  readonly hasAnyThread: boolean;
} {
  const titlePrefix = `${issue.identifier} · `;
  const owned = threads
    .filter((thread) => thread.branch === issue.branchName || thread.title.startsWith(titlePrefix))
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
  const live = owned.filter((thread) => thread.archivedAt === null);
  return { primary: live[0] ?? null, reviews: live.slice(1), hasAnyThread: owned.length > 0 };
}

/**
 * Whether entering In Progress should open a worktree thread. Work starts once per issue: a card
 * that comes back to In Progress, or is dropped again while starting, keeps the thread, worktree,
 * and task.md it already has. Until every thread list has loaded the board cannot know, so it waits.
 */
export function shouldStartWork(input: {
  readonly columnKey: string;
  readonly hasAnyThread: boolean;
  readonly starting: boolean;
  readonly threadsLoaded: boolean;
}): boolean {
  return (
    input.columnKey === "in-progress" &&
    input.threadsLoaded &&
    !input.starting &&
    !input.hasAnyThread
  );
}

/** An In Review issue whose PR merged belongs in Ready to test; any other state was moved on purpose. */
export function shouldMarkReadyToTest(
  issue: Pick<LinearIssue, "stateName">,
  pullRequestState: "open" | "closed" | "merged" | null,
): boolean {
  return issue.stateName === "In Review" && pullRequestState === "merged";
}
