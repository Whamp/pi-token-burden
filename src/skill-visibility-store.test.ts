import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { DisableMode } from "./enums.js";
import { SkillVisibilityStore } from "./skill-visibility-store.js";
import type { Settings, SkillInfo } from "./types.js";

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

function readSettings(settingsPath: string): Settings {
  return JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Settings;
}

function isDisableEntry(entry: string): boolean {
  return entry.startsWith("-");
}

describe("skill visibility store", () => {
  it("persists duplicate Disabled state and removes it when re-enabled", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "visibility-store-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const firstDir = path.join(tmpDir, "first", "dupe");
      const secondDir = path.join(tmpDir, "second", "dupe");
      const firstPath = path.join(firstDir, "SKILL.md");
      const secondPath = path.join(secondDir, "SKILL.md");
      fs.mkdirSync(firstDir, { recursive: true });
      fs.mkdirSync(secondDir, { recursive: true });
      fs.writeFileSync(firstPath, "---\nname: dupe\ndescription: test\n---\n");
      fs.writeFileSync(secondPath, "---\nname: dupe\ndescription: test\n---\n");

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      const byName = new Map([
        ["dupe", makeSkill("dupe", firstPath, [firstPath, secondPath])],
      ]);

      store.applyChanges(new Map([["dupe", DisableMode.Disabled]]), byName);
      const disabledEntries =
        readSettings(settingsPath).skills?.filter(isDisableEntry);
      expect(disabledEntries).toHaveLength(2);

      store.applyChanges(new Map([["dupe", DisableMode.Enabled]]), byName);
      expect(readSettings(settingsPath).skills?.filter(Boolean)).toStrictEqual(
        []
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
