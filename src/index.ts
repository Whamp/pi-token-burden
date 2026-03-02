import * as os from "node:os";
import * as path from "node:path";

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import { DisableMode } from "./enums.js";
import { parseSystemPrompt } from "./parser.js";
import { showReport } from "./report-view.js";
import { applyChanges, loadSettings } from "./skills-persistence.js";
import { loadAllSkills } from "./skills.js";

const SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "settings.json");

const extension: ExtensionFactory = (pi) => {
  pi.registerCommand("token-burden", {
    description: "Show token budget breakdown and manage skills",
    handler: async (_args, ctx) => {
      const prompt = ctx.getSystemPrompt();
      const parsed = parseSystemPrompt(prompt);

      const usage = ctx.getContextUsage();
      const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;

      if (!ctx.hasUI) {
        return;
      }

      const settings = loadSettings(SETTINGS_PATH);
      const { skills, byName } = loadAllSkills(settings);

      await showReport(parsed, contextWindow, ctx, skills, (result) => {
        if (result.applied && result.changes.size > 0) {
          try {
            applyChanges(result.changes, byName, SETTINGS_PATH);

            const parts: string[] = [];
            const enabledCount = [...result.changes.values()].filter(
              (v) => v === DisableMode.Enabled
            ).length;
            const hiddenCount = [...result.changes.values()].filter(
              (v) => v === DisableMode.Hidden
            ).length;
            const disabledCount = [...result.changes.values()].filter(
              (v) => v === DisableMode.Disabled
            ).length;

            if (enabledCount > 0) {
              parts.push(`${enabledCount} enabled`);
            }
            if (hiddenCount > 0) {
              parts.push(`${hiddenCount} hidden`);
            }
            if (disabledCount > 0) {
              parts.push(`${disabledCount} disabled`);
            }

            ctx.ui.notify(
              `Skills updated: ${parts.join(", ")}. Use /reload or restart for changes to take effect.`,
              "info"
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : "Unknown error";
            ctx.ui.notify(`Failed to save settings: ${msg}`, "error");
          }
        }
      });
    },
  });
};

export default extension;
