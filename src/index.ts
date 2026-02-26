import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import { parseSystemPrompt } from "./parser.js";
import { showReport } from "./report-view.js";

const extension: ExtensionFactory = (pi) => {
  pi.registerCommand("token-burden", {
    description: "Show token budget breakdown of the system prompt",
    handler: async (_args, ctx) => {
      const prompt = ctx.getSystemPrompt();
      const parsed = parseSystemPrompt(prompt);

      const usage = ctx.getContextUsage();
      const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;

      if (!ctx.hasUI) {
        return;
      }

      await showReport(parsed, contextWindow, ctx);
    },
  });
};

export default extension;
