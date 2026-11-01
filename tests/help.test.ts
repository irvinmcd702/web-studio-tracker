import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

import { HELP, HELP_EN, HELP_RU, preferredLang } from "../lib/help-content";

/**
 * The guide is prose, so there is little to assert about what it says. What is
 * worth pinning down is that it stays reachable by the people it is for, and
 * that the two languages stay the same guide — a Russian version that quietly
 * loses a section is worse than not having one.
 */
const page = readFileSync("app/(app)/help/page.tsx", "utf8");
const sidebar = readFileSync("components/shell/sidebar.tsx", "utf8");

describe("the guide", () => {
  it("is for everybody signed in, not just managers", () => {
    // requireStaff, and no redirect for anyone who passes it.
    expect(page).toContain("requireStaff");
    expect(page).not.toMatch(/redirect\(["']\/dashboard["']\)/);
  });

  it("is in the sidebar without an admin flag", () => {
    const line = sidebar.split("\n").find((l) => l.includes('href: "/help"'));

    expect(line).toBeDefined();
    expect(line).not.toContain("adminOnly");
  });

  it("sends studio process to Docs rather than describing it", () => {
    // This page describes the software; how a particular studio works belongs
    // where the studio can edit it.
    expect(HELP_EN.outro.paragraphs.join(" ")).toContain("](/docs)");
    expect(HELP_RU.outro.paragraphs.join(" ")).toContain("](/docs)");
  });
});

describe("the two languages are the same guide", () => {
  it("has the same sections in the same order", () => {
    expect(HELP_RU.sections.map((s) => s.id)).toEqual(
      HELP_EN.sections.map((s) => s.id),
    );
  });

  it("says the same number of things in each section", () => {
    for (const [i, en] of HELP_EN.sections.entries()) {
      const ru = HELP_RU.sections[i]!;

      expect(
        `${ru.id}:${ru.paragraphs.length}`,
        `paragraph count differs in "${en.id}"`,
      ).toBe(`${en.id}:${en.paragraphs.length}`);

      expect(ru.managerParagraphs?.length ?? 0).toBe(
        en.managerParagraphs?.length ?? 0,
      );
      expect(Boolean(ru.insteadForMembers)).toBe(Boolean(en.insteadForMembers));
    }

    expect(HELP_RU.outro.paragraphs).toHaveLength(
      HELP_EN.outro.paragraphs.length,
    );
  });

  it("keeps the same links, so neither version points somewhere the other does not", () => {
    const links = (c: typeof HELP_EN) =>
      [
        ...c.sections.flatMap((s) => [
          ...s.paragraphs,
          ...(s.managerParagraphs ?? []),
        ]),
        ...c.outro.paragraphs,
      ]
        .flatMap((p) => [...p.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!))
        .sort();

    expect(links(HELP_RU)).toEqual(links(HELP_EN));
  });

  it("is actually translated, not copied", () => {
    // Cyrillic in every Russian section, so an untranslated stub cannot pass
    // the structural checks above and slip through unnoticed.
    for (const section of HELP_RU.sections) {
      expect(section.title, `"${section.id}" title`).toMatch(/[а-яё]/i);
      expect(section.paragraphs.join(" "), `"${section.id}" body`).toMatch(
        /[а-яё]/i,
      );
    }
  });
});

describe("which language somebody lands on", () => {
  it("is Russian when the browser asks for it first", () => {
    expect(preferredLang("ru-RU,ru;q=0.9,en;q=0.8")).toBe("ru");
    expect(preferredLang("ru")).toBe("ru");
  });

  it("is the project's own language otherwise", () => {
    expect(preferredLang("en-GB,en;q=0.9")).toBe("en");
    expect(preferredLang("de-DE")).toBe("en");
    // Russian somewhere down the list is not a preference for Russian.
    expect(preferredLang("en-US,en;q=0.9,ru;q=0.5")).toBe("en");
    expect(preferredLang(null)).toBe("en");
  });

  it("offers the other one, whichever you are on", () => {
    expect(HELP.en.otherLanguage).toMatch(/[а-яё]/i);
    expect(HELP.ru.otherLanguage).toMatch(/English/);
  });
});
