import { DisableMode } from "./enums.js";
import { SkillManagementSession } from "./skill-management-session.js";
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
    const session = new SkillManagementSession([
      skill({ name: "tdd", mode: DisableMode.Enabled, tokens: 25 }),
    ]);
    const states = [snapshot(session, "tdd", 100)];

    session.cycle("tdd");
    states.push(snapshot(session, "tdd", 100));

    session.cycle("tdd");
    states.push(snapshot(session, "tdd", 100));

    session.cycle("tdd");
    states.push(snapshot(session, "tdd", 100));

    expect(states).toStrictEqual([
      { pendingCount: 0, mode: DisableMode.Enabled, totalTokens: 100 },
      { pendingCount: 1, mode: DisableMode.Hidden, totalTokens: 75 },
      { pendingCount: 1, mode: DisableMode.Disabled, totalTokens: 75 },
      { pendingCount: 0, mode: DisableMode.Enabled, totalTokens: 100 },
    ]);
  });

  it("can discard pending edits or rebase them after save", () => {
    const session = new SkillManagementSession([
      skill({ name: "browser-use", mode: DisableMode.Enabled, tokens: 40 }),
    ]);
    const states: SessionSnapshot[] = [];

    session.cycle("browser-use");
    states.push(snapshot(session, "browser-use", 200));

    session.discardPending();
    states.push(snapshot(session, "browser-use", 200));

    session.cycle("browser-use");
    session.commitPending();
    states.push(snapshot(session, "browser-use", 160));

    session.cycle("browser-use");
    states.push(snapshot(session, "browser-use", 160));

    expect(states).toStrictEqual([
      { pendingCount: 1, mode: DisableMode.Hidden, totalTokens: 160 },
      { pendingCount: 0, mode: DisableMode.Enabled, totalTokens: 200 },
      { pendingCount: 0, mode: DisableMode.Hidden, totalTokens: 160 },
      { pendingCount: 1, mode: DisableMode.Disabled, totalTokens: 160 },
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
});
