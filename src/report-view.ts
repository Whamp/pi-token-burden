import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";

import type { ParsedPrompt, TableItem } from "./types.js";
import { buildBarSegments, fuzzyFilter } from "./utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VISIBLE_ROWS = 8;
const OVERLAY_WIDTH = 80;

/** ANSI SGR codes for section bar colors. */
const SECTION_COLORS = [
  "38;2;23;143;185", // blue — Base prompt
  "38;2;137;210;129", // green — AGENTS.md
  "38;2;254;188;56", // orange — Skills
  "38;2;178;129;214", // purple — extra sections
  "2", // dim — Metadata (always last)
];

/** Rainbow dot colors for scroll indicator. */
const RAINBOW = [
  "38;2;178;129;214",
  "38;2;215;135;175",
  "38;2;254;188;56",
  "38;2;228;192;15",
  "38;2;137;210;129",
  "38;2;0;175;175",
  "38;2;23;143;185",
];

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

function sgr(code: string, text: string): string {
  if (!code) {
    return text;
  }
  return `\u001B[${code}m${text}\u001B[0m`;
}

function bold(text: string): string {
  return `\u001B[1m${text}\u001B[22m`;
}

function italic(text: string): string {
  return `\u001B[3m${text}\u001B[23m`;
}

function dim(text: string): string {
  return `\u001B[2m${text}\u001B[22m`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function rainbowDots(filled: number, total: number): string {
  const dots: string[] = [];
  for (let i = 0; i < total; i++) {
    const color = RAINBOW[i % RAINBOW.length];
    dots.push(sgr(color, i < filled ? "●" : "○"));
  }
  return dots.join(" ");
}

function shortenLabel(label: string): string {
  if (label.startsWith("AGENTS")) {
    return "AGENTS";
  }
  if (label.startsWith("Skills")) {
    return "Skills";
  }
  if (label.startsWith("Metadata")) {
    return "Meta";
  }
  if (label.startsWith("Base")) {
    return "Base";
  }
  if (label.startsWith("SYSTEM")) {
    return "SYSTEM";
  }
  return truncateToWidth(label, 10, "…");
}

// ---------------------------------------------------------------------------
// Data preparation
// ---------------------------------------------------------------------------

/** Convert ParsedPrompt sections into TableItems sorted by tokens desc. */
function buildTableItems(parsed: ParsedPrompt): TableItem[] {
  return parsed.sections
    .map((section): TableItem => {
      const pct =
        parsed.totalTokens > 0
          ? (section.tokens / parsed.totalTokens) * 100
          : 0;

      const children: TableItem[] | undefined = section.children?.length
        ? section.children
            .map(
              (child): TableItem => ({
                label: child.label,
                tokens: child.tokens,
                chars: child.chars,
                pct:
                  parsed.totalTokens > 0
                    ? (child.tokens / parsed.totalTokens) * 100
                    : 0,
                drillable: false,
              })
            )
            .toSorted((a, b) => b.tokens - a.tokens)
        : undefined;

      return {
        label: section.label,
        tokens: section.tokens,
        chars: section.chars,
        pct,
        drillable: (children?.length ?? 0) > 0,
        children,
      };
    })
    .toSorted((a, b) => b.tokens - a.tokens);
}

// ---------------------------------------------------------------------------
// Row rendering helpers
// ---------------------------------------------------------------------------

function makeRow(innerW: number): (content: string) => string {
  return (content: string): string =>
    `${dim("│")}${truncateToWidth(` ${content}`, innerW, "…", true)}${dim("│")}`;
}

function makeEmptyRow(innerW: number): () => string {
  return (): string => `${dim("│")}${" ".repeat(innerW)}${dim("│")}`;
}

function makeDivider(innerW: number): () => string {
  return (): string => dim(`├${"─".repeat(innerW)}┤`);
}

function makeCenterRow(innerW: number): (content: string) => string {
  return (content: string): string => {
    const vis = visibleWidth(content);
    const padding = Math.max(0, innerW - vis);
    const left = Math.floor(padding / 2);
    return `${dim("│")}${" ".repeat(left)}${content}${" ".repeat(padding - left)}${dim("│")}`;
  };
}

// ---------------------------------------------------------------------------
// Zone renderers
// ---------------------------------------------------------------------------

function renderTitleBorder(innerW: number): string {
  const titleText = " Token Burden ";
  const borderLen = innerW - visibleWidth(titleText);
  const leftBorder = Math.floor(borderLen / 2);
  const rightBorder = borderLen - leftBorder;
  return dim(
    `╭${"─".repeat(leftBorder)}${titleText}${"─".repeat(rightBorder)}╮`
  );
}

function renderContextWindowBar(
  lines: string[],
  parsed: ParsedPrompt,
  contextWindow: number,
  innerW: number,
  row: (content: string) => string,
  emptyRow: () => string,
  divider: () => string
): void {
  const pct = (parsed.totalTokens / contextWindow) * 100;
  const label = `${fmt(parsed.totalTokens)} / ${fmt(contextWindow)} tokens (${pct.toFixed(1)}%)`;
  lines.push(row(label));

  const barWidth = innerW - 4;
  const filled = Math.max(1, Math.round((pct / 100) * barWidth));
  const empty = barWidth - filled;
  const bar = `${sgr("36", "█".repeat(filled))}${dim("░".repeat(empty))}`;
  lines.push(row(bar));

  lines.push(emptyRow());
  lines.push(divider());
  lines.push(emptyRow());
}

function renderStackedBar(
  lines: string[],
  parsed: ParsedPrompt,
  innerW: number,
  row: (content: string) => string
): void {
  const barWidth = innerW - 4;
  const segments = buildBarSegments(
    parsed.sections.map((s) => ({ label: s.label, tokens: s.tokens })),
    barWidth
  );

  // Stacked bar
  let bar = "";
  for (let i = 0; i < segments.length; i++) {
    const colorIdx = Math.min(i, SECTION_COLORS.length - 1);
    bar += sgr(SECTION_COLORS[colorIdx], "█".repeat(segments[i].width));
  }
  lines.push(row(bar));

  // Legend
  const legendParts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const colorIdx = Math.min(i, SECTION_COLORS.length - 1);
    const section = parsed.sections[i];
    const pct =
      parsed.totalTokens > 0
        ? ((section.tokens / parsed.totalTokens) * 100).toFixed(1)
        : "0.0";
    const shortLabel = shortenLabel(section.label);
    legendParts.push(
      `${sgr(SECTION_COLORS[colorIdx], "■")} ${shortLabel} ${pct}%`
    );
  }
  lines.push(row(legendParts.join("  ")));
}

function renderTableRow(
  item: TableItem,
  isSelected: boolean,
  innerW: number
): string {
  const prefix = isSelected ? sgr("36", "▸") : dim("·");

  const tokenStr = `${fmt(item.tokens)} tokens`;
  const pctStr = `${item.pct.toFixed(1)}%`;
  const suffix = `${tokenStr}   ${pctStr}`;

  // Calculate available space for name
  const suffixWidth = visibleWidth(suffix);
  const prefixWidth = 2; // "▸ " or "· "
  const gapMin = 2;
  const nameMaxWidth = innerW - prefixWidth - suffixWidth - gapMin - 3;

  const truncatedName = truncateToWidth(
    isSelected ? bold(sgr("36", item.label)) : item.label,
    nameMaxWidth,
    "…"
  );
  const nameWidth = visibleWidth(truncatedName);
  const gap = Math.max(1, innerW - prefixWidth - nameWidth - suffixWidth - 3);

  const content = `${prefix} ${truncatedName}${" ".repeat(gap)}${dim(suffix)}`;

  return `${dim("│")}${truncateToWidth(` ${content}`, innerW, "…", true)}${dim("│")}`;
}

// ---------------------------------------------------------------------------
// BudgetOverlay component
// ---------------------------------------------------------------------------

type Mode = "sections" | "drilldown";

interface OverlayState {
  mode: Mode;
  selectedIndex: number;
  scrollOffset: number;
  searchActive: boolean;
  searchQuery: string;
  drilldownSection: TableItem | null;
}

class BudgetOverlay {
  private state: OverlayState = {
    mode: "sections",
    selectedIndex: 0,
    scrollOffset: 0,
    searchActive: false,
    searchQuery: "",
    drilldownSection: null,
  };

  private tableItems: TableItem[];
  private parsed: ParsedPrompt;
  private contextWindow: number | undefined;
  private done: (value: null) => void;

  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    parsed: ParsedPrompt,
    contextWindow: number | undefined,
    done: (value: null) => void
  ) {
    this.parsed = parsed;
    this.contextWindow = contextWindow;
    this.tableItems = buildTableItems(parsed);
    this.done = done;
  }

  // -----------------------------------------------------------------------
  // Input handling
  // -----------------------------------------------------------------------

  handleInput(data: string): void {
    if (this.state.searchActive) {
      this.handleSearchInput(data);
      return;
    }

    if (matchesKey(data, "escape")) {
      if (this.state.mode === "drilldown") {
        this.state.mode = "sections";
        this.state.drilldownSection = null;
        this.state.selectedIndex = 0;
        this.state.scrollOffset = 0;
        this.invalidate();
        return;
      }
      this.done(null);
      return;
    }

    if (matchesKey(data, "up")) {
      this.moveSelection(-1);
      return;
    }

    if (matchesKey(data, "down")) {
      this.moveSelection(1);
      return;
    }

    if (matchesKey(data, "enter")) {
      this.drillIn();
      return;
    }

    if (data === "/") {
      this.state.searchActive = true;
      this.state.searchQuery = "";
      this.invalidate();
    }
  }

  private handleSearchInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.state.searchActive = false;
      this.state.searchQuery = "";
      this.state.selectedIndex = 0;
      this.state.scrollOffset = 0;
      this.invalidate();
      return;
    }

    if (matchesKey(data, "up")) {
      this.moveSelection(-1);
      return;
    }

    if (matchesKey(data, "down")) {
      this.moveSelection(1);
      return;
    }

    if (matchesKey(data, "backspace")) {
      if (this.state.searchQuery.length > 0) {
        this.state.searchQuery = this.state.searchQuery.slice(0, -1);
        this.state.selectedIndex = 0;
        this.state.scrollOffset = 0;
        this.invalidate();
      }
      return;
    }

    // Printable character
    if (data.length === 1 && (data.codePointAt(0) ?? 0) >= 32) {
      this.state.searchQuery += data;
      this.state.selectedIndex = 0;
      this.state.scrollOffset = 0;
      this.invalidate();
    }
  }

  private moveSelection(delta: number): void {
    const items = this.getVisibleItems();
    if (items.length === 0) {
      return;
    }

    let next = this.state.selectedIndex + delta;
    if (next < 0) {
      next = items.length - 1;
    }
    if (next >= items.length) {
      next = 0;
    }
    this.state.selectedIndex = next;

    // Adjust scroll offset to keep selection visible
    if (next < this.state.scrollOffset) {
      this.state.scrollOffset = next;
    } else if (next >= this.state.scrollOffset + MAX_VISIBLE_ROWS) {
      this.state.scrollOffset = next - MAX_VISIBLE_ROWS + 1;
    }

    this.invalidate();
  }

  private drillIn(): void {
    if (this.state.mode !== "sections") {
      return;
    }
    const items = this.getVisibleItems();
    const selected = items[this.state.selectedIndex];
    if (!selected?.drillable) {
      return;
    }

    this.state.mode = "drilldown";
    this.state.drilldownSection = selected;
    this.state.selectedIndex = 0;
    this.state.scrollOffset = 0;
    this.state.searchActive = false;
    this.state.searchQuery = "";
    this.invalidate();
  }

  private getVisibleItems(): TableItem[] {
    const baseItems =
      this.state.mode === "drilldown"
        ? (this.state.drilldownSection?.children ?? [])
        : this.tableItems;

    if (this.state.searchActive && this.state.searchQuery) {
      return fuzzyFilter(baseItems, this.state.searchQuery);
    }

    return baseItems;
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const w = Math.min(width, OVERLAY_WIDTH);
    const innerW = w - 2;
    const row = makeRow(innerW);
    const emptyRow = makeEmptyRow(innerW);
    const divider = makeDivider(innerW);
    const centerRow = makeCenterRow(innerW);

    const lines: string[] = [renderTitleBorder(innerW), emptyRow()];

    // Zone 1: Context window usage bar
    if (this.contextWindow) {
      renderContextWindowBar(
        lines,
        this.parsed,
        this.contextWindow,
        innerW,
        row,
        emptyRow,
        divider
      );
    }

    // Zone 2: Stacked section bar
    renderStackedBar(lines, this.parsed, innerW, row);
    lines.push(emptyRow());
    lines.push(divider());

    // Zone 3: Interactive table
    this.renderInteractiveTable(lines, innerW, row, emptyRow, centerRow);

    // Footer
    lines.push(divider());
    lines.push(emptyRow());

    const hints =
      this.state.mode === "drilldown"
        ? `${italic("↑↓")} navigate  ${italic("/")} search  ${italic("esc")} back`
        : `${italic("↑↓")} navigate  ${italic("enter")} drill-in  ${italic("/")} search  ${italic("esc")} close`;
    lines.push(centerRow(dim(hints)));

    // Bottom border
    lines.push(dim(`╰${"─".repeat(innerW)}╯`));

    this.cachedLines = lines;
    this.cachedWidth = width;
    return lines;
  }

  private renderInteractiveTable(
    lines: string[],
    innerW: number,
    row: (content: string) => string,
    emptyRow: () => string,
    centerRow: (content: string) => string
  ): void {
    if (this.state.mode === "drilldown" && this.state.drilldownSection) {
      lines.push(emptyRow());
      const breadcrumb = `${bold(this.state.drilldownSection.label)}  ${dim("←  esc to go back")}`;
      lines.push(row(breadcrumb));
    }

    // Search bar
    if (this.state.searchActive) {
      lines.push(emptyRow());
      const cursor = sgr("36", "│");
      const query = this.state.searchQuery
        ? `${this.state.searchQuery}${cursor}`
        : `${cursor}${dim(italic("type to filter..."))}`;
      lines.push(row(`${dim("◎")}  ${query}`));
    }

    lines.push(emptyRow());

    // Table rows
    const items = this.getVisibleItems();
    if (items.length === 0) {
      lines.push(centerRow(dim(italic("No matching items"))));
      lines.push(emptyRow());
    } else {
      const startIdx = this.state.scrollOffset;
      const endIdx = Math.min(startIdx + MAX_VISIBLE_ROWS, items.length);

      for (let i = startIdx; i < endIdx; i++) {
        const item = items[i];
        const isSelected = i === this.state.selectedIndex;
        lines.push(renderTableRow(item, isSelected, innerW));
      }

      lines.push(emptyRow());

      // Scroll indicator
      if (items.length > MAX_VISIBLE_ROWS) {
        const progress = Math.round(
          ((this.state.selectedIndex + 1) / items.length) * 10
        );
        const dots = rainbowDots(progress, 10);
        const countStr = `${this.state.selectedIndex + 1}/${items.length}`;
        lines.push(row(`${dots}  ${dim(countStr)}`));
        lines.push(emptyRow());
      }
    }
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function showReport(
  parsed: ParsedPrompt,
  contextWindow: number | undefined,
  ctx: ExtensionCommandContext
): Promise<void> {
  await ctx.ui.custom<null>(
    (tui, _theme, _kb, done) => {
      const overlay = new BudgetOverlay(parsed, contextWindow, done);
      return {
        render: (width: number) => overlay.render(width),
        invalidate: () => overlay.invalidate(),
        handleInput: (data: string) => {
          overlay.handleInput(data);
          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: OVERLAY_WIDTH },
    }
  );
}
