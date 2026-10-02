import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildStartPrompt, defaultBranchName, pickBoardProject } from "./startIssueWork";

const issue = {
  identifier: "BRAV-2385",
  title: "Firma de correo incluye espacio gigante",
  url: "https://linear.app/gobraven/issue/BRAV-2385",
};

describe("buildStartPrompt", () => {
  it("carries the issue and its description, and asks for task.md before any code", () => {
    const prompt = buildStartPrompt(issue, "  El correo de Malakut llega con un hueco.  ");
    expect(prompt).toContain("BRAV-2385: Firma de correo incluye espacio gigante");
    expect(prompt).toContain(issue.url);
    expect(prompt).toContain("El correo de Malakut llega con un hueco.");
    expect(prompt.indexOf("task.md")).toBeLessThan(prompt.indexOf("Empieza por el primer paso"));
  });

  it("says so when Linear has no description instead of leaving the section empty", () => {
    expect(buildStartPrompt(issue, null)).toContain("(La issue no tiene descripción.)");
    expect(buildStartPrompt(issue, "   ")).toContain("(La issue no tiene descripción.)");
  });
});

describe("pickBoardProject", () => {
  const braven = { id: ProjectId.make("braven") };
  const other = { id: ProjectId.make("other") };

  it("prefers the user's pick, falls back to a lone project, and otherwise asks", () => {
    expect(pickBoardProject([braven, other], "other")).toBe(other);
    expect(pickBoardProject([braven], null)).toBe(braven);
    expect(pickBoardProject([braven], "deleted-project")).toBe(braven);
    expect(pickBoardProject([braven, other], null)).toBeNull();
    expect(pickBoardProject([], null)).toBeNull();
  });
});

describe("defaultBranchName", () => {
  it("returns the local default branch, never its remote twin", () => {
    expect(
      defaultBranchName([
        { name: "origin/develop", isDefault: true, isRemote: true },
        { name: "feature/x", isDefault: false },
        { name: "develop", isDefault: true },
      ]),
    ).toBe("develop");
    expect(defaultBranchName([{ name: "feature/x", isDefault: false }])).toBeNull();
  });
});
