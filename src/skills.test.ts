import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import fc from "fast-check";

import { DisableMode } from "./enums.js";
import {
  parseFrontmatter,
  scanSkillDir,
  loadAllSkills,
  estimateSkillPromptTokens,
} from "./skills.js";
import type { Settings } from "./types.js";

function withTemporaryHome<T>(homePath: string, fn: () => T): T {
  const previousHome = process.env.HOME;
  process.env.HOME = homePath;

  try {
    return fn();
  } finally {
    process.env.HOME = previousHome;
  }
}

// -- parseFrontmatter ---------------------------------------------------------

describe("parseFrontmatter()", () => {
  it("should extract name, description, and disableModelInvocation from valid frontmatter", () => {
    const content = [
      "---",
      "name: my-skill",
      "description: A useful skill",
      "disable-model-invocation: true",
      "---",
      "",
      "# My Skill",
      "Content here.",
    ].join("\n");

    const result = parseFrontmatter(content, "fallback");

    expect(result.name).toBe("my-skill");
    expect(result.description).toBe("A useful skill");
    expect(result.disableModelInvocation).toBeTruthy();
  });

  it("should fall back to parent dir name when frontmatter has no name", () => {
    const content = [
      "---",
      "description: Some skill",
      "---",
      "",
      "# Content",
    ].join("\n");

    const result = parseFrontmatter(content, "dir-name");

    expect(result.name).toBe("dir-name");
    expect(result.description).toBe("Some skill");
  });

  it("should return empty description when no frontmatter exists", () => {
    const content = "# Just a markdown file\nNo frontmatter here.";

    const result = parseFrontmatter(content, "fallback");

    expect(result.name).toBe("fallback");
    expect(result.description).toBe("");
    expect(result.disableModelInvocation).toBeFalsy();
  });

  it("should handle malformed frontmatter (no closing ---)", () => {
    const content = "---\nname: broken\ndescription: oops";

    const result = parseFrontmatter(content, "fallback");

    expect(result.name).toBe("fallback");
    expect(result.description).toBe("");
  });

  it("should default disableModelInvocation to false when not present", () => {
    const content = "---\nname: test\ndescription: desc\n---\n# Content";

    const result = parseFrontmatter(content, "fallback");

    expect(result.disableModelInvocation).toBeFalsy();
  });
});

// -- scanSkillDir -------------------------------------------------------------

describe("scanSkillDir()", () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "skill-test-"));
  }

  it("should discover SKILL.md files recursively", () => {
    const tmpDir = makeTmpDir();
    try {
      const skillDir = path.join(tmpDir, "my-skill");
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: my-skill\ndescription: A test skill\n---\n# My Skill"
      );

      const skills: {
        name: string;
        description: string;
        filePath: string;
        disableModelInvocation: boolean;
      }[] = [];
      scanSkillDir(tmpDir, skills, new Set());

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("my-skill");
      expect(skills[0].filePath).toBe(path.join(skillDir, "SKILL.md"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should discover nested SKILL.md files", () => {
    const tmpDir = makeTmpDir();
    try {
      const nested = path.join(tmpDir, "category", "nested-skill");
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(
        path.join(nested, "SKILL.md"),
        "---\nname: nested-skill\ndescription: Nested\n---\n# Nested"
      );

      const skills: {
        name: string;
        description: string;
        filePath: string;
        disableModelInvocation: boolean;
      }[] = [];
      scanSkillDir(tmpDir, skills, new Set());

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("nested-skill");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should skip dotfiles and node_modules", () => {
    const tmpDir = makeTmpDir();
    try {
      const hidden = path.join(tmpDir, ".hidden");
      fs.mkdirSync(hidden);
      fs.writeFileSync(
        path.join(hidden, "SKILL.md"),
        "---\nname: hidden\ndescription: Hidden\n---\n"
      );

      const nm = path.join(tmpDir, "node_modules", "pkg");
      fs.mkdirSync(nm, { recursive: true });
      fs.writeFileSync(
        path.join(nm, "SKILL.md"),
        "---\nname: nm-skill\ndescription: NM\n---\n"
      );

      const skills: {
        name: string;
        description: string;
        filePath: string;
        disableModelInvocation: boolean;
      }[] = [];
      scanSkillDir(tmpDir, skills, new Set());

      expect(skills).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should skip skills without a description", () => {
    const tmpDir = makeTmpDir();
    try {
      const skillDir = path.join(tmpDir, "no-desc");
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: no-desc\n---\n# No Description"
      );

      const skills: {
        name: string;
        description: string;
        filePath: string;
        disableModelInvocation: boolean;
      }[] = [];
      scanSkillDir(tmpDir, skills, new Set());

      expect(skills).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should not visit the same real path twice (symlinks)", () => {
    const tmpDir = makeTmpDir();
    try {
      const skillDir = path.join(tmpDir, "real-skill");
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: real-skill\ndescription: Real\n---\n"
      );

      const linkDir = path.join(tmpDir, "link-skill");
      fs.symlinkSync(skillDir, linkDir);

      const skills: {
        name: string;
        description: string;
        filePath: string;
        disableModelInvocation: boolean;
      }[] = [];
      scanSkillDir(tmpDir, skills, new Set());

      expect(skills).toHaveLength(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should discover root-level *.md files when includeRootFiles is true", () => {
    const tmpDir = makeTmpDir();
    try {
      fs.writeFileSync(
        path.join(tmpDir, "my-root-skill.md"),
        "---\nname: root-skill\ndescription: A root-level skill\n---\n# Root Skill"
      );

      const skills: {
        name: string;
        description: string;
        filePath: string;
        disableModelInvocation: boolean;
      }[] = [];
      scanSkillDir(tmpDir, skills, new Set(), undefined, true);

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("root-skill");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should not discover root-level *.md files when includeRootFiles is false", () => {
    const tmpDir = makeTmpDir();
    try {
      fs.writeFileSync(
        path.join(tmpDir, "my-root-skill.md"),
        "---\nname: root-skill\ndescription: A root-level skill\n---\n# Root Skill"
      );

      const skills: {
        name: string;
        description: string;
        filePath: string;
        disableModelInvocation: boolean;
      }[] = [];
      scanSkillDir(tmpDir, skills, new Set(), undefined, false);

      expect(skills).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// -- loadAllSkills ------------------------------------------------------------

describe("loadAllSkills()", () => {
  function makeTmpDir(): { tmpDir: string; userSkillsDir: string } {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-load-"));
    const userSkillsDir = path.join(tmpDir, "skills");
    fs.mkdirSync(userSkillsDir, { recursive: true });
    return { tmpDir, userSkillsDir };
  }

  it("should deduplicate skills by name (first wins)", () => {
    const { tmpDir, userSkillsDir } = makeTmpDir();
    try {
      const dir1 = path.join(userSkillsDir, "first", "dupe-skill");
      const dir2 = path.join(userSkillsDir, "second", "dupe-skill");
      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });

      fs.writeFileSync(
        path.join(dir1, "SKILL.md"),
        "---\nname: dupe-skill\ndescription: First copy\n---\n"
      );
      fs.writeFileSync(
        path.join(dir2, "SKILL.md"),
        "---\nname: dupe-skill\ndescription: Second copy\n---\n"
      );

      const { skills, byName } = loadAllSkills({}, [userSkillsDir]);

      const dupe = byName.get("dupe-skill");
      expect(dupe).toBeDefined();
      expect(dupe?.description).toBe("First copy");
      expect(dupe?.allPaths).toHaveLength(2);
      expect(dupe?.hasDuplicates).toBeTruthy();

      expect(skills.filter((s) => s.name === "dupe-skill")).toHaveLength(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should mark skills as disabled when all paths have -path in settings", () => {
    const { tmpDir, userSkillsDir } = makeTmpDir();
    try {
      const skillDir = path.join(userSkillsDir, "my-skill");
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: my-skill\ndescription: Test\n---\n"
      );

      const settings: Settings = {
        skills: [`-${skillDir}`],
      };

      const { byName } = loadAllSkills(settings, [userSkillsDir]);
      const skill = byName.get("my-skill");

      expect(skill?.mode).toBe(DisableMode.Disabled);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should mark skills as disabled for relative -path entries based on agent settings directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-home-"));

    try {
      withTemporaryHome(tmpDir, () => {
        const agentSkillsDir = path.join(tmpDir, ".pi", "agent", "skills");
        const skillDir = path.join(agentSkillsDir, "my-skill");
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, "SKILL.md"),
          "---\nname: my-skill\ndescription: Test\n---\n"
        );

        const settings: Settings = {
          skills: ["-skills/my-skill"],
        };

        const { byName } = loadAllSkills(settings, [agentSkillsDir]);
        expect(byName.get("my-skill")?.mode).toBe(DisableMode.Disabled);
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should mark skills as hidden when frontmatter has disable-model-invocation", () => {
    const { tmpDir, userSkillsDir } = makeTmpDir();
    try {
      const skillDir = path.join(userSkillsDir, "hidden-skill");
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: hidden-skill\ndescription: Hidden\ndisable-model-invocation: true\n---\n"
      );

      const { byName } = loadAllSkills({}, [userSkillsDir]);
      const skill = byName.get("hidden-skill");

      expect(skill?.mode).toBe(DisableMode.Hidden);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should mark skills as enabled by default", () => {
    const { tmpDir, userSkillsDir } = makeTmpDir();
    try {
      const skillDir = path.join(userSkillsDir, "normal-skill");
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: normal-skill\ndescription: Normal\n---\n"
      );

      const { byName } = loadAllSkills({}, [userSkillsDir]);
      const skill = byName.get("normal-skill");

      expect(skill?.mode).toBe(DisableMode.Enabled);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should estimate token cost for each skill", () => {
    const { tmpDir, userSkillsDir } = makeTmpDir();
    try {
      const skillDir = path.join(userSkillsDir, "token-skill");
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: token-skill\ndescription: A skill for testing token estimation\n---\n"
      );

      const { byName } = loadAllSkills({}, [userSkillsDir]);
      const skill = byName.get("token-skill");

      expect(skill?.tokens).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should discover skills from explicit settings paths", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-explicit-"));

    try {
      const explicitDir = path.join(tmpDir, "custom-skills");
      const skillDir = path.join(explicitDir, "explicit-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: explicit-skill\ndescription: Explicit path skill\n---\n"
      );

      const settings: Settings = {
        skills: [explicitDir],
      };

      const { byName } = loadAllSkills(settings, []);
      expect(byName.get("explicit-skill")).toBeDefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should discover skills from configured package paths", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-package-"));

    try {
      const packageDir = path.join(tmpDir, "pkg-skill-source");
      const skillDir = path.join(packageDir, "skills", "pkg-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: pkg-skill\ndescription: Package-provided skill\n---\n"
      );

      const settings: Settings = {
        packages: [packageDir],
      };

      const { byName } = loadAllSkills(settings, []);
      expect(byName.get("pkg-skill")).toBeDefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// -- estimateSkillPromptTokens ------------------------------------------------

describe("estimateSkillPromptTokens()", () => {
  it("should estimate tokens for the XML skill entry that would appear in the prompt", () => {
    const tokens = estimateSkillPromptTokens({
      name: "my-skill",
      description: "A useful skill for doing things",
      filePath: "/home/user/.pi/agent/skills/my-skill/SKILL.md",
    });

    expect(tokens).toBeGreaterThan(0);
  });
});

// -- Property-based tests -----------------------------------------------------

describe("property-based", () => {
  it("should roundtrip: written name matches discovered name", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,10}[a-z0-9]$/),
        (name) => {
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pbt-"));
          try {
            const skillDir = path.join(dir, name);
            fs.mkdirSync(skillDir);
            fs.writeFileSync(
              path.join(skillDir, "SKILL.md"),
              `---\nname: ${name}\ndescription: test skill\n---\n`
            );

            const { byName } = loadAllSkills({}, [dir]);
            const skill = byName.get(name);

            expect(skill?.name).toBe(name);
          } finally {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        }
      )
    );
  });

  it("should satisfy involution: toggling state three times returns to original", () => {
    const CYCLE_MAP: Record<DisableMode, DisableMode> = {
      [DisableMode.Enabled]: DisableMode.Hidden,
      [DisableMode.Hidden]: DisableMode.Disabled,
      [DisableMode.Disabled]: DisableMode.Enabled,
    };

    fc.assert(
      fc.property(
        fc.constantFrom(
          DisableMode.Enabled,
          DisableMode.Hidden,
          DisableMode.Disabled
        ),
        (startMode) => {
          const after3 = CYCLE_MAP[CYCLE_MAP[CYCLE_MAP[startMode]]];
          expect(after3).toBe(startMode);
        }
      )
    );
  });
});
