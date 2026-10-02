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

interface BranchThread {
  readonly branch: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
}

/**
 * The threads working on an issue's branch: the first one opened is the issue's own thread,
 * every later one is a review the board launched against it.
 */
export function issueThreads<T extends BranchThread>(
  issue: Pick<LinearIssue, "branchName">,
  threads: ReadonlyArray<T>,
): { readonly primary: T | null; readonly reviews: ReadonlyArray<T> } {
  const onBranch = threads
    .filter((thread) => thread.archivedAt === null && thread.branch === issue.branchName)
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
  return { primary: onBranch[0] ?? null, reviews: onBranch.slice(1) };
}

/** An In Review issue whose PR merged belongs in Ready to test; any other state was moved on purpose. */
export function shouldMarkReadyToTest(
  issue: Pick<LinearIssue, "stateName">,
  pullRequestState: "open" | "closed" | "merged" | null,
): boolean {
  return issue.stateName === "In Review" && pullRequestState === "merged";
}
