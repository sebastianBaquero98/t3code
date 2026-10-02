import { describe, expect, it } from "vite-plus/test";

import {
  buildHardReviewPrompt,
  buildShipPrompt,
  issueThreads,
  parseTaskChecklist,
  shouldMarkReadyToTest,
  shouldStartWork,
} from "./boardActions";

const issue = {
  identifier: "BRAV-2385",
  title: "Firma de correo",
  branchName: "feature/brav-2385",
};

describe("prompts", () => {
  it("asks for commit, push and a PR that names the issue, keeping task.md out", () => {
    const prompt = buildShipPrompt(issue);
    expect(prompt).toMatch(/commit[\s\S]*push[\s\S]*PR/);
    expect(prompt).toContain("sin incluir `task.md`");
    expect(prompt).toContain("`BRAV-2385` en el título del PR");
  });

  it("keeps the hard review read-only", () => {
    expect(buildHardReviewPrompt(issue)).toContain("No modifiques archivos");
  });
});

describe("parseTaskChecklist", () => {
  it("counts checked and unchecked steps and lists the next ones in order", () => {
    const markdown = [
      "# BRAV-2385",
      "- [x] Reproducir el espacio en la firma",
      "  - [X] Capturar el HTML enviado",
      "- [ ] Quitar el margen del template",
      "* [ ] Probar con Malakut",
      "- [ ] Abrir PR",
      "- [ ] Avisar a Producto",
      "- no es un paso",
    ].join("\n");
    expect(parseTaskChecklist(markdown)).toEqual({
      done: 2,
      total: 6,
      next: ["Quitar el margen del template", "Probar con Malakut", "Abrir PR"],
    });
    expect(parseTaskChecklist("sin checklist")).toEqual({ done: 0, total: 0, next: [] });
  });
});

describe("issueThreads", () => {
  const thread = (id: string, branch: string | null, createdAt: string, title = "Thread") => ({
    id,
    title,
    branch,
    createdAt,
    archivedAt: null as string | null,
  });
  const issue = { identifier: "BRAV-2385", branchName: "feature/brav-2385" };

  it("treats the first thread on the branch as the issue's and later ones as reviews", () => {
    const threads = [
      thread("review-2", "feature/brav-2385", "2026-10-01T12:00:00.000Z"),
      thread("work", "feature/brav-2385", "2026-10-01T09:00:00.000Z"),
      thread("elsewhere", "develop", "2026-10-01T08:00:00.000Z"),
      thread("review-1", "feature/brav-2385", "2026-10-01T10:00:00.000Z"),
    ];
    const { primary, reviews, hasAnyThread } = issueThreads(issue, threads);
    expect(primary?.id).toBe("work");
    expect(reviews.map((review) => review.id)).toEqual(["review-1", "review-2"]);
    expect(hasAnyThread).toBe(true);
    expect(issueThreads({ identifier: "BRAV-1", branchName: "none" }, threads)).toEqual({
      primary: null,
      reviews: [],
      hasAnyThread: false,
    });
  });

  it("finds the issue's thread by title while its worktree is still on the base branch", () => {
    const starting = thread("starting", "develop", "2026-10-01T09:00:00.000Z", "BRAV-2385 · Firma");
    expect(issueThreads(issue, [starting]).primary?.id).toBe("starting");
  });

  it("hides an archived thread but still reports that the issue has one", () => {
    const archived = {
      ...thread("archived", "feature/brav-2385", "2026-10-01T09:00:00.000Z"),
      archivedAt: "2026-10-01T11:00:00.000Z",
    };
    expect(issueThreads(issue, [archived])).toEqual({
      primary: null,
      reviews: [],
      hasAnyThread: true,
    });
  });
});

describe("shouldStartWork", () => {
  const firstStart = {
    columnKey: "in-progress",
    hasAnyThread: false,
    starting: false,
    threadsLoaded: true,
  };

  it("opens a worktree the first time an issue enters In Progress", () => {
    expect(shouldStartWork(firstStart)).toBe(true);
  });

  it("never starts again when a card comes back to In Progress with its thread", () => {
    expect(shouldStartWork({ ...firstStart, hasAnyThread: true })).toBe(false);
  });

  it("does not start twice while a start is in flight, or before threads have loaded", () => {
    expect(shouldStartWork({ ...firstStart, starting: true })).toBe(false);
    expect(shouldStartWork({ ...firstStart, threadsLoaded: false })).toBe(false);
  });

  it("only starts from In Progress", () => {
    expect(shouldStartWork({ ...firstStart, columnKey: "blocked" })).toBe(false);
  });
});

describe("shouldMarkReadyToTest", () => {
  it("moves only In Review issues whose PR merged", () => {
    expect(shouldMarkReadyToTest({ stateName: "In Review" }, "merged")).toBe(true);
    expect(shouldMarkReadyToTest({ stateName: "In Review" }, "open")).toBe(false);
    expect(shouldMarkReadyToTest({ stateName: "Done" }, "merged")).toBe(false);
    expect(shouldMarkReadyToTest({ stateName: "In Review" }, null)).toBe(false);
  });
});
