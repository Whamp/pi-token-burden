import { DisableMode } from "./enums.js";
import { estimateTokens } from "./parser.js";
import {
  applySkillManagementToParsed,
  buildSkillsBudgetSection,
  isSkillsBudgetSectionLabel,
  reconcileSkillsWithPrompt,
  SkillManagementSession,
} from "./skill-management-session.js";
import { formatSkillsPromptSection } from "./skills.js";
import type { ParsedPrompt, SkillInfo } from "./types.js";

interface SessionSnapshot {
  pendingCount: number;
  mode: DisableMode | undefined;
  totalTokens: number;
}

function skill(
  overrides: Partial<SkillInfo> & Pick<SkillInfo, "name">
): SkillInfo {
  return {
    name: overrides.name,
    description: overrides.description ?? `${overrides.name} description`,
    filePath: overrides.filePath ?? `/skills/${overrides.name}/SKILL.md`,
    allPaths: overrides.allPaths ?? [
      overrides.filePath ?? `/skills/${overrides.name}/SKILL.md`,
    ],
    mode: overrides.mode ?? DisableMode.Enabled,
    tokens: overrides.tokens ?? 10,
    hasDuplicates: overrides.hasDuplicates ?? false,
  };
}

function snapshot(
  session: SkillManagementSession,
  skillName: string,
  originalTotalTokens: number
): SessionSnapshot {
  return {
    pendingCount: session.pendingCount,
    mode: session.effectiveMode(skillName),
    totalTokens: session.adjustedTotalTokens(originalTotalTokens),
  };
}

describe("skill management session", () => {
  it("cycles a skill through visibility states while tracking pending token impact", () => {
    const tddSkill = skill({
      name: "tdd",
      mode: DisableMode.Enabled,
      tokens: 25,
    });
    const session = new SkillManagementSession([tddSkill]);
    const baseTokens = 100;
    const originalTotal =
      baseTokens + estimateTokens(formatSkillsPromptSection([tddSkill]));
    const states = [snapshot(session, "tdd", originalTotal)];

    session.cycle("tdd");
    states.push(snapshot(session, "tdd", originalTotal));

    session.cycle("tdd");
    states.push(snapshot(session, "tdd", originalTotal));

    session.cycle("tdd");
    states.push(snapshot(session, "tdd", originalTotal));

    expect(states).toStrictEqual([
      {
        pendingCount: 0,
        mode: DisableMode.Enabled,
        totalTokens: originalTotal,
      },
      { pendingCount: 1, mode: DisableMode.Hidden, totalTokens: baseTokens },
      { pendingCount: 1, mode: DisableMode.Disabled, totalTokens: baseTokens },
      {
        pendingCount: 0,
        mode: DisableMode.Enabled,
        totalTokens: originalTotal,
      },
    ]);
  });

  it("can discard pending edits or rebase them after save", () => {
    const browserSkill = skill({
      name: "browser-use",
      mode: DisableMode.Enabled,
      tokens: 40,
    });
    const session = new SkillManagementSession([browserSkill]);
    const baseTokens = 160;
    const originalTotal =
      baseTokens + estimateTokens(formatSkillsPromptSection([browserSkill]));
    const states: SessionSnapshot[] = [];

    session.cycle("browser-use");
    states.push(snapshot(session, "browser-use", originalTotal));

    session.discardPending();
    states.push(snapshot(session, "browser-use", originalTotal));

    session.cycle("browser-use");
    session.commitPending();
    states.push(snapshot(session, "browser-use", baseTokens));

    session.cycle("browser-use");
    states.push(snapshot(session, "browser-use", baseTokens));

    expect(states).toStrictEqual([
      { pendingCount: 1, mode: DisableMode.Hidden, totalTokens: baseTokens },
      {
        pendingCount: 0,
        mode: DisableMode.Enabled,
        totalTokens: originalTotal,
      },
      { pendingCount: 0, mode: DisableMode.Hidden, totalTokens: baseTokens },
      { pendingCount: 1, mode: DisableMode.Disabled, totalTokens: baseTokens },
    ]);
  });

  it("records duplicate-skill edits once by skill name for persistence", () => {
    const session = new SkillManagementSession([
      skill({
        name: "github",
        mode: DisableMode.Enabled,
        tokens: 30,
        filePath: "/first/github/SKILL.md",
        allPaths: ["/first/github/SKILL.md", "/second/github/SKILL.md"],
        hasDuplicates: true,
      }),
    ]);

    session.cycle("github");
    const changes = session.changes();

    expect(changes).toStrictEqual(new Map([["github", DisableMode.Hidden]]));

    changes.set("github", DisableMode.Disabled);
    expect(session.effectiveMode("github")).toBe(DisableMode.Hidden);
  });

  it("counts the full skills section when toggles cross zero visible skills", () => {
    const onlySkill = skill({
      name: "only-skill",
      description: "Do the thing",
      filePath: "/skills/only-skill/SKILL.md",
      mode: DisableMode.Enabled,
      tokens: 10,
    });
    const hiddenSkill = skill({
      name: "hidden-skill",
      description: "Use hidden skill",
      filePath: "/skills/hidden-skill/SKILL.md",
      mode: DisableMode.Hidden,
      tokens: 10,
    });
    const originalSectionTokens = estimateTokens(
      formatSkillsPromptSection([onlySkill])
    );
    const hiddenSectionTokens = estimateTokens(
      formatSkillsPromptSection([{ ...hiddenSkill, mode: DisableMode.Enabled }])
    );

    const removeLast = new SkillManagementSession([onlySkill]);
    removeLast.cycle("only-skill");

    const addFirst = new SkillManagementSession([hiddenSkill]);
    addFirst.cycle("hidden-skill");
    addFirst.cycle("hidden-skill");

    expect(removeLast.tokenDelta).toBe(-originalSectionTokens);
    expect(addFirst.tokenDelta).toBe(hiddenSectionTokens);
  });

  it("reconciles discovered enabled skills against the active prompt skills", () => {
    const activePromptSkill = {
      name: "tdd",
      description: "Prompt description",
      location: "/prompt/tdd/SKILL.md",
      chars: 120,
      tokens: 30,
    };
    const discovered = [
      skill({
        name: "extra",
        mode: DisableMode.Enabled,
        tokens: 50,
      }),
      skill({
        name: "tdd",
        description: "Filesystem description",
        filePath: "/filesystem/tdd/SKILL.md",
        mode: DisableMode.Hidden,
        tokens: 10,
      }),
    ];

    const reconciled = reconcileSkillsWithPrompt(discovered, [
      activePromptSkill,
    ]);
    const session = new SkillManagementSession(reconciled);

    expect(
      reconciled.map(({ name, mode, description, filePath, tokens }) => ({
        name,
        mode,
        description,
        filePath,
        tokens,
      }))
    ).toStrictEqual([
      {
        name: "extra",
        mode: DisableMode.Hidden,
        description: "extra description",
        filePath: "/skills/extra/SKILL.md",
        tokens: 50,
      },
      {
        name: "tdd",
        mode: DisableMode.Enabled,
        description: "Prompt description",
        filePath: "/prompt/tdd/SKILL.md",
        tokens: 30,
      },
    ]);
    expect(session.tokenDelta).toBe(0);
  });

  it("uses decoded prompt skill fields when estimating toggle deltas", () => {
    const promptSkill = {
      name: "api-helper",
      description: "Use A&amp;B &lt; C",
      location: "/skills/A&amp;B/SKILL.md",
      chars: 120,
      tokens: 30,
    };
    const discovered = [
      skill({
        name: "api-helper",
        description: "Filesystem description",
        filePath: "/filesystem/api-helper/SKILL.md",
        mode: DisableMode.Enabled,
        tokens: 10,
      }),
    ];

    const reconciled = reconcileSkillsWithPrompt(discovered, [promptSkill]);
    const session = new SkillManagementSession(reconciled);
    const baseTokens = 200;
    const originalTotal =
      baseTokens + estimateTokens(formatSkillsPromptSection(reconciled));

    session.cycle("api-helper");

    expect(reconciled[0]).toMatchObject({
      description: "Use A&B < C",
      filePath: "/skills/A&B/SKILL.md",
    });
    expect(session.adjustedTotalTokens(originalTotal)).toBe(baseTokens);
  });

  it("builds the Skills Budget Section from effective Skill Visibility State", () => {
    const enabledSkill = skill({
      name: "tdd",
      description: "Test first",
      filePath: "/skills/tdd/SKILL.md",
      mode: DisableMode.Enabled,
    });
    const hiddenSkill = skill({
      name: "hidden-helper",
      description: "Loaded on demand",
      filePath: "/skills/hidden-helper/SKILL.md",
      mode: DisableMode.Hidden,
    });

    const section = buildSkillsBudgetSection([enabledSkill, hiddenSkill]);
    const expectedContent = formatSkillsPromptSection([
      enabledSkill,
      hiddenSkill,
    ]);

    expect(section).toMatchObject({
      label: "Skills (1)",
      chars: expectedContent.length,
      tokens: estimateTokens(expectedContent),
      content: expectedContent,
    });
    expect(section.children?.map((child) => child.label)).toStrictEqual([
      "tdd",
    ]);
  });

  it("recognizes Skills Budget Section labels through a shared predicate", () => {
    expect(isSkillsBudgetSectionLabel("Skills (2)")).toBeTruthy();
    expect(isSkillsBudgetSectionLabel("Skills")).toBeTruthy();
    expect(isSkillsBudgetSectionLabel("Base prompt")).toBeFalsy();
    expect(isSkillsBudgetSectionLabel("Skill Visibility Store")).toBeFalsy();
  });

  it("owns Skill Management Session section-route eligibility", () => {
    const session = new SkillManagementSession([
      skill({ name: "tdd", mode: DisableMode.Enabled }),
    ]);
    const emptySession = new SkillManagementSession([]);

    expect(session.canManageSection("Skills (1)")).toBeTruthy();
    expect(session.canManageSection("Base prompt")).toBeFalsy();
    expect(emptySession.canManageSection("Skills (0)")).toBeFalsy();
  });

  it("returns render-ready skill rows with search and pending-change state", () => {
    const session = new SkillManagementSession([
      skill({
        name: "tdd",
        mode: DisableMode.Enabled,
        tokens: 12,
        hasDuplicates: true,
      }),
      skill({
        name: "browser-use",
        mode: DisableMode.Hidden,
        tokens: 30,
      }),
    ]);

    session.cycle("browser-use");

    expect(session.skillRows("td")).toStrictEqual([
      {
        skill: expect.objectContaining({ name: "tdd" }),
        label: "tdd",
        mode: DisableMode.Enabled,
        hasChanged: false,
        hasDuplicates: true,
        tokens: 12,
      },
    ]);
    expect(session.skillRows()).toStrictEqual([
      {
        skill: expect.objectContaining({ name: "tdd" }),
        label: "tdd",
        mode: DisableMode.Enabled,
        hasChanged: false,
        hasDuplicates: true,
        tokens: 12,
      },
      {
        skill: expect.objectContaining({ name: "browser-use" }),
        label: "browser-use",
        mode: DisableMode.Disabled,
        hasChanged: true,
        hasDuplicates: false,
        tokens: 30,
      },
    ]);
  });

  it("applies pending Skill Management Session state to ParsedPrompt without overlay logic", () => {
    const tddSkill = skill({
      name: "tdd",
      description: "Test first",
      filePath: "/skills/tdd/SKILL.md",
      mode: DisableMode.Enabled,
    });
    const hiddenSkill = skill({
      name: "hidden-helper",
      description: "Loaded on demand",
      filePath: "/skills/hidden-helper/SKILL.md",
      mode: DisableMode.Hidden,
    });
    const originalSkillsSection = buildSkillsBudgetSection([tddSkill]);
    const original: ParsedPrompt = {
      sections: [
        { label: "Base prompt", chars: 20, tokens: 5 },
        originalSkillsSection,
      ],
      totalChars: 20 + originalSkillsSection.chars,
      totalTokens: 5 + originalSkillsSection.tokens,
      skills: [],
    };
    const session = new SkillManagementSession([tddSkill, hiddenSkill]);

    session.cycle("hidden-helper");
    session.cycle("hidden-helper");
    const adjusted = applySkillManagementToParsed(original, session);

    expect(adjusted.totalTokens).toBe(
      session.adjustedTotalTokens(original.totalTokens)
    );
    expect(adjusted.totalChars).toBe(original.totalChars);
    expect(adjusted.sections.map((section) => section.label)).toStrictEqual([
      "Base prompt",
      "Skills (2)",
    ]);
    expect(
      adjusted.sections
        .find((section) => isSkillsBudgetSectionLabel(section.label))
        ?.children?.map((child) => child.label)
    ).toStrictEqual(["tdd", "hidden-helper"]);
  });
});
