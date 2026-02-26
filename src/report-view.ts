import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, matchesKey, Text } from "@mariozechner/pi-tui";

import { formatReport } from "./formatter.js";
import type { ParsedPrompt } from "./types.js";

const HIGH_PERCENTAGE_THRESHOLD = 10;

export async function showReport(
  parsed: ParsedPrompt,
  contextWindow: number | undefined,
  ctx: ExtensionCommandContext
): Promise<void> {
  const lines = formatReport(parsed, contextWindow);

  await ctx.ui.custom((_tui, theme, _kb, done) => {
    const container = new Container();
    const border = new DynamicBorder((s: string) => theme.fg("accent", s));

    container.addChild(border);
    container.addChild(
      new Text(theme.fg("accent", theme.bold(" Context Budget")), 1, 0)
    );

    for (const line of lines) {
      let styled = "";
      switch (line.kind) {
        case "header": {
          styled = theme.bold(line.text);
          break;
        }
        case "separator": {
          styled = "";
          break;
        }
        case "section": {
          const pctMatch = line.text.match(/(\d+\.\d)%/);
          const pct = pctMatch ? Number.parseFloat(pctMatch[1]) : 0;
          const pctColor = pct > HIGH_PERCENTAGE_THRESHOLD ? "warning" : "dim";
          styled = line.text.replace(/(\d+\.\d%)/, theme.fg(pctColor, "$1"));
          styled = styled.replace(
            /^([^]+?) {2}/,
            `${theme.fg("toolTitle", "$1")}  `
          );
          break;
        }
        case "child": {
          styled = theme.fg("dim", line.text);
          break;
        }
        default: {
          styled = line.text;
          break;
        }
      }

      container.addChild(new Text(styled, 1, 0));
    }

    container.addChild(new Text("", 0, 0));
    container.addChild(
      new Text(theme.fg("dim", " Press Enter or Esc to close"), 1, 0)
    );
    container.addChild(border);

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
          done();
        }
      },
    };
  });
}
