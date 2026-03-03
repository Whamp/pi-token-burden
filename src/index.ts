import * as os from "node:os";
import * as path from "node:path";

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import { DisableMode } from "./enums.js";
import { parseSystemPrompt } from "./parser.js";
import { showReport } from "./report-view.js";
import { applyChanges, loadSettings } from "./skills-persistence.js";
import { loadAllSkills } from "./skills.js";

/**
 * Resolve the agent directory, matching pi's own resolution logic:
 * 1. Check PI_CODING_AGENT_DIR environment variable
 * 2. Fall back to ~/.pi/agent
 */
function getAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) {
    if (envDir === "~") {
      return os.homedir();
    }
    if (envDir.startsWith("~/")) {
      return path.join(os.homedir(), envDir.slice(2));
    }
    return envDir;
  }
  return path.join(os.homedir(), ".pi", "agent");
}

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

      const agentDir = getAgentDir();
      const settingsPath = path.join(agentDir, "settings.json");
      const settings = loadSettings(settingsPath);
      const { skills, byName } = loadAllSkills(settings, undefined, agentDir);

      await showReport(parsed, contextWindow, ctx, skills, (result) => {
        if (!result.applied || result.changes.size === 0) {
          return true;
        }

        try {
          applyChanges(result.changes, byName, settingsPath, agentDir);

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
          return true;
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          ctx.ui.notify(`Failed to save settings: ${msg}`, "error");
          return false;
        }
      });
    },
  });
};

export default extension;
