import type { LinearIssue, ProjectId, VcsRef } from "@t3tools/contracts";

/** The first message of an issue's thread: the agent writes `task.md` before touching code. */
export function buildStartPrompt(
  issue: Pick<LinearIssue, "identifier" | "title" | "url">,
  description: string | null,
): string {
  const brief = description?.trim() ? description.trim() : "(La issue no tiene descripción.)";
  return [
    `Empieza a trabajar en ${issue.identifier}: ${issue.title}`,
    `Linear: ${issue.url}`,
    "",
    "## Descripción en Linear",
    "",
    brief,
    "",
    "## Primer paso",
    "",
    "1. Crea `task.md` en la raíz de este worktree con: objetivo, contexto, criterios de aceptación y un checklist de pasos con `- [ ]`.",
    "2. Mantén el checklist al día mientras avanzas (`- [x]` al terminar cada paso): el board de T3 lo muestra como progreso.",
    "3. No incluyas `task.md` en ningún commit.",
    "4. Empieza por el primer paso del checklist.",
  ].join("\n");
}

/**
 * The project new issue threads start in: the one the user picked, or the only one there is.
 * Several projects and no pick means the board has to ask.
 */
export function pickBoardProject<P extends { readonly id: ProjectId }>(
  projects: ReadonlyArray<P>,
  preferredProjectId: string | null,
): P | null {
  const preferred = projects.find((project) => project.id === preferredProjectId);
  if (preferred !== undefined) return preferred;
  return projects.length === 1 ? projects[0]! : null;
}

/** The repository's default branch, which every issue worktree branches from. */
export function defaultBranchName(
  refs: ReadonlyArray<Pick<VcsRef, "name" | "isDefault" | "isRemote">>,
) {
  return refs.find((ref) => ref.isDefault && ref.isRemote !== true)?.name ?? null;
}
