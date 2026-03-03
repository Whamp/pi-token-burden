import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import fc from "fast-check";

import { DisableMode } from "./enums.js";
import {
  loadSettings,
  saveSettings,
  applyChanges,
  setFrontmatterField,
  removeFrontmatterField,
} from "./skills-persistence.js";
import type { Settings, SkillInfo } from "./types.js";

function isDisableEntry(s: string): boolean {
  return typeof s === "string" && s.startsWith("-");
}

// -- setFrontmatterField() ----------------------------------------------------

describe("setFrontmatterField()", () => {
  it("should add field to existing frontmatter", () => {
    const content = "---\nname: test\n---\n# Content";

    const result = setFrontmatterField(
      content,
      "disable-model-invocation",
      "true"
    );

    expect(result).toContain("disable-model-invocation: true");
    expect(result).toContain("name: test");
    expect(result).toContain("# Content");
  });

  it("should update existing field value", () => {
    const content =
      "---\nname: test\ndisable-model-invocation: false\n---\n# Content";

    const result = setFrontmatterField(
      content,
      "disable-model-invocation",
      "true"
    );

    expect(result).toContain("disable-model-invocation: true");
    expect(result).not.toContain("disable-model-invocation: false");
  });

  it("should create frontmatter when none exists", () => {
    const content = "# Just markdown";

    const result = setFrontmatterField(
      content,
      "disable-model-invocation",
      "true"
    );

    expect(result).toMatch(/^---\n/);
    expect(result).toContain("disable-model-invocation: true");
    expect(result).toContain("# Just markdown");
  });
});

// -- removeFrontmatterField() -------------------------------------------------

describe("removeFrontmatterField()", () => {
  it("should remove an existing field", () => {
    const content =
      "---\nname: test\ndisable-model-invocation: true\n---\n# Content";

    const result = removeFrontmatterField(content, "disable-model-invocation");

    expect(result).not.toContain("disable-model-invocation");
    expect(result).toContain("name: test");
    expect(result).toContain("# Content");
  });

  it("should return unchanged content when field does not exist", () => {
    const content = "---\nname: test\n---\n# Content";

    const result = removeFrontmatterField(content, "disable-model-invocation");

    expect(result).toContain("name: test");
  });

  it("should return unchanged content when no frontmatter exists", () => {
    const content = "# No frontmatter";

    const result = removeFrontmatterField(content, "anything");

    expect(result).toBe("# No frontmatter");
  });
});

// -- loadSettings / saveSettings ----------------------------------------------

describe("loadSettings() / saveSettings()", () => {
  function makeTmpSettings(): { tmpDir: string; settingsPath: string } {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-test-"));
    return { tmpDir, settingsPath: path.join(tmpDir, "settings.json") };
  }

  it("should return empty object when file does not exist", () => {
    const { tmpDir, settingsPath } = makeTmpSettings();
    try {
      const settings = loadSettings(settingsPath);
      expect(settings).toStrictEqual({});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should roundtrip settings through save and load", () => {
    const { tmpDir, settingsPath } = makeTmpSettings();
    try {
      const original: Settings = { skills: ["-some/path", "other/path"] };

      saveSettings(original, settingsPath);
      const loaded = loadSettings(settingsPath);

      expect(loaded).toStrictEqual(original);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should preserve other keys when saving", () => {
    const { tmpDir, settingsPath } = makeTmpSettings();
    try {
      const original: Settings = {
        skills: ["-path"],
        packages: ["some-package"],
        theme: "dark",
      };

      saveSettings(original, settingsPath);
      const loaded = loadSettings(settingsPath);

      expect(loaded.packages).toStrictEqual(["some-package"]);
      expect(loaded.theme).toBe("dark");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// -- applyChanges() -----------------------------------------------------------

describe("applyChanges()", () => {
  function makeTmpSettings(): { tmpDir: string; settingsPath: string } {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apply-test-"));
    return { tmpDir, settingsPath: path.join(tmpDir, "settings.json") };
  }

  function makeSkill(
    name: string,
    filePath: string,
    allPaths?: string[]
  ): SkillInfo {
    return {
      name,
      description: `${name} description`,
      filePath,
      allPaths: allPaths ?? [filePath],
      mode: DisableMode.Enabled,
      tokens: 100,
      hasDuplicates: (allPaths?.length ?? 1) > 1,
    };
  }

  it("should add -path entries when disabling a skill", () => {
    const { tmpDir, settingsPath } = makeTmpSettings();
    try {
      const skillPath = path.join(tmpDir, "my-skill", "SKILL.md");
      fs.mkdirSync(path.dirname(skillPath), { recursive: true });
      fs.writeFileSync(
        skillPath,
        "---\nname: my-skill\ndescription: test\n---\n"
      );

      const skill = makeSkill("my-skill", skillPath);
      const byName = new Map([["my-skill", skill]]);
      const changes = new Map<string, DisableMode>([
        ["my-skill", DisableMode.Disabled],
      ]);

      applyChanges(changes, byName, settingsPath);

      const settings = loadSettings(settingsPath);
      const hasDisableEntry = settings.skills?.some(isDisableEntry);
      expect(hasDisableEntry).toBeTruthy();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should remove -path entries when enabling a previously disabled skill", () => {
    const { tmpDir, settingsPath } = makeTmpSettings();
    try {
      const skillDir = path.join(tmpDir, "my-skill");
      const skillPath = path.join(skillDir, "SKILL.md");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        skillPath,
        "---\nname: my-skill\ndescription: test\n---\n"
      );

      // Pre-disable it
      saveSettings({ skills: [`-${skillDir}`] }, settingsPath);

      const skill = makeSkill("my-skill", skillPath);
      const byName = new Map([["my-skill", skill]]);
      const changes = new Map<string, DisableMode>([
        ["my-skill", DisableMode.Enabled],
      ]);

      applyChanges(changes, byName, settingsPath);

      const settings = loadSettings(settingsPath);
      const hasDisableEntry = settings.skills?.some(isDisableEntry);
      expect(hasDisableEntry).toBeFalsy();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should remove relative -path entries based on the settings file directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apply-relative-"));

    try {
      const settingsDir = path.join(tmpDir, "agent");
      const settingsPath = path.join(settingsDir, "settings.json");
      const skillDir = path.join(settingsDir, "skills", "my-skill");
      const skillPath = path.join(skillDir, "SKILL.md");

      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        skillPath,
        "---\nname: my-skill\ndescription: test\n---\n"
      );

      saveSettings({ skills: ["-skills/my-skill"] }, settingsPath);

      const skill = makeSkill("my-skill", skillPath);
      const byName = new Map([["my-skill", skill]]);
      const changes = new Map<string, DisableMode>([
        ["my-skill", DisableMode.Enabled],
      ]);

      applyChanges(changes, byName, settingsPath);

      const settings = loadSettings(settingsPath);
      const disableEntries = settings.skills?.filter(isDisableEntry);
      expect(disableEntries).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should set disable-model-invocation in frontmatter when hiding", () => {
    const { tmpDir, settingsPath } = makeTmpSettings();
    try {
      const skillDir = path.join(tmpDir, "hide-skill");
      const skillPath = path.join(skillDir, "SKILL.md");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        skillPath,
        "---\nname: hide-skill\ndescription: test\n---\n# Content"
      );

      const skill = makeSkill("hide-skill", skillPath);
      const byName = new Map([["hide-skill", skill]]);
      const changes = new Map<string, DisableMode>([
        ["hide-skill", DisableMode.Hidden],
      ]);

      applyChanges(changes, byName, settingsPath);

      const content = fs.readFileSync(skillPath, "utf8");
      expect(content).toContain("disable-model-invocation: true");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should remove disable-model-invocation from frontmatter when enabling a hidden skill", () => {
    const { tmpDir, settingsPath } = makeTmpSettings();
    try {
      const skillDir = path.join(tmpDir, "unhide-skill");
      const skillPath = path.join(skillDir, "SKILL.md");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        skillPath,
        "---\nname: unhide-skill\ndescription: test\ndisable-model-invocation: true\n---\n# Content"
      );

      const skill = makeSkill("unhide-skill", skillPath);
      const byName = new Map([["unhide-skill", skill]]);
      const changes = new Map<string, DisableMode>([
        ["unhide-skill", DisableMode.Enabled],
      ]);

      applyChanges(changes, byName, settingsPath);

      const content = fs.readFileSync(skillPath, "utf8");
      expect(content).not.toContain("disable-model-invocation");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should throw and preserve settings when frontmatter update fails", () => {
    const { tmpDir, settingsPath } = makeTmpSettings();
    try {
      const baseline: Settings = { skills: ["keep-this-entry"] };
      saveSettings(baseline, settingsPath);

      const missingSkillPath = path.join(tmpDir, "missing", "SKILL.md");
      const skill = makeSkill("missing-skill", missingSkillPath);
      const byName = new Map([["missing-skill", skill]]);
      const changes = new Map<string, DisableMode>([
        ["missing-skill", DisableMode.Hidden],
      ]);

      expect(() => applyChanges(changes, byName, settingsPath)).toThrow(
        /Failed to update skill frontmatter/
      );
      expect(loadSettings(settingsPath)).toStrictEqual(baseline);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should disable ALL paths when a duplicate skill is disabled", () => {
    const { tmpDir, settingsPath } = makeTmpSettings();
    try {
      const dir1 = path.join(tmpDir, "first", "dupe");
      const dir2 = path.join(tmpDir, "second", "dupe");
      const path1 = path.join(dir1, "SKILL.md");
      const path2 = path.join(dir2, "SKILL.md");
      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(path1, "---\nname: dupe\ndescription: test\n---\n");
      fs.writeFileSync(path2, "---\nname: dupe\ndescription: test\n---\n");

      const skill = makeSkill("dupe", path1, [path1, path2]);
      const byName = new Map([["dupe", skill]]);
      const changes = new Map<string, DisableMode>([
        ["dupe", DisableMode.Disabled],
      ]);

      applyChanges(changes, byName, settingsPath);

      const settings = loadSettings(settingsPath);
      expect(settings.skills).toBeDefined();
      const disableEntries = settings.skills?.filter(isDisableEntry);
      expect(disableEntries).toHaveLength(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// -- Property-based tests -----------------------------------------------------

describe("property-based persistence", () => {
  it("should roundtrip frontmatter: set then remove preserves body content", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("field-a", "field-b", "custom-field"),
        fc.string({ minLength: 1, maxLength: 50 }),
        (key, value) => {
          const original = "# Some Content\n\nBody text here.";

          const withField = setFrontmatterField(original, key, value);
          const withoutField = removeFrontmatterField(withField, key);

          expect(withoutField).toContain("# Some Content");
          expect(withoutField).toContain("Body text here.");
        }
      )
    );
  });

  it("should be idempotent: setting the same field twice yields same result", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("disable-model-invocation", "custom"),
        fc.constantFrom("true", "false", "value"),
        (key, value) => {
          const content = "---\nname: test\n---\n# Content";

          const once = setFrontmatterField(content, key, value);
          const twice = setFrontmatterField(once, key, value);

          expect(once).toBe(twice);
        }
      )
    );
  });
});
