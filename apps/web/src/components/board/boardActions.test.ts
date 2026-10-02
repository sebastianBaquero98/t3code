import { describe, expect, it } from "vite-plus/test";

import {
  buildHardReviewPrompt,
  buildShipPrompt,
  issueThreads,
  parseTaskChecklist,
  shouldMarkReadyToTest,
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
  const thread = (id: string, branch: string | null, createdAt: string) => ({
    id,
    branch,
    createdAt,
    archivedAt: null as string | null,
  });

  it("treats the first thread on the branch as the issue's and later ones as reviews", () => {
    const threads = [
      thread("review-2", "feature/brav-2385", "2026-10-01T12:00:00.000Z"),
      thread("work", "feature/brav-2385", "2026-10-01T09:00:00.000Z"),
      thread("elsewhere", "develop", "2026-10-01T08:00:00.000Z"),
      thread("review-1", "feature/brav-2385", "2026-10-01T10:00:00.000Z"),
      { ...thread("archived", "feature/brav-2385", "2026-10-01T07:00:00.000Z"), archivedAt: "x" },
    ];
    const { primary, reviews } = issueThreads(issue, threads);
    expect(primary?.id).toBe("work");
    expect(reviews.map((review) => review.id)).toEqual(["review-1", "review-2"]);
    expect(issueThreads({ branchName: "none" }, threads)).toEqual({ primary: null, reviews: [] });
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
