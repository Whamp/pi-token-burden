import { DisableMode } from "./enums.js";
import { estimateTokens } from "./parser.js";
import {
  reconcileSkillsWithPrompt,
  SkillManagementSession,
} from "./skill-management-session.js";
import { formatSkillsPromptSection } from "./skills.js";
import type { SkillInfo } from "./types.js";

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
});
