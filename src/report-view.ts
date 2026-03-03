import { spawnSync } from "node:child_process";

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";
import type { TUI } from "@mariozechner/pi-tui";

import { DisableMode } from "./enums.js";
import type {
  ParsedPrompt,
  SkillInfo,
  SkillToggleResult,
  TableItem,
} from "./types.js";
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

/** Resolve the user's preferred editor: $VISUAL → $EDITOR → vi. */
export function getEditor(): string {
  return process.env.VISUAL || process.env.EDITOR || "vi";
}

// ---------------------------------------------------------------------------
// Data preparation
// ---------------------------------------------------------------------------

/** Convert ParsedPrompt sections into TableItems sorted by tokens desc. */
export function buildTableItems(parsed: ParsedPrompt): TableItem[] {
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

type Mode = "sections" | "drilldown" | "skill-toggle";

interface OverlayState {
  mode: Mode;
  selectedIndex: number;
  scrollOffset: number;
  searchActive: boolean;
  searchQuery: string;
  drilldownSection: TableItem | null;
  pendingChanges: Map<string, DisableMode>;
  confirmingDiscard: boolean;
}

class BudgetOverlay {
  private state: OverlayState = {
    mode: "sections",
    selectedIndex: 0,
    scrollOffset: 0,
    searchActive: false,
    searchQuery: "",
    drilldownSection: null,
    pendingChanges: new Map(),
    confirmingDiscard: false,
  };

  private tableItems: TableItem[];
  private parsed: ParsedPrompt;
  private originalParsed: ParsedPrompt;
  private originalTotalTokens: number;
  private adjustedTotalTokens: number;
  private contextWindow: number | undefined;
  private readonly discoveredSkills: SkillInfo[];
  private readonly tui: TUI;
  private done: (value: null) => void;
  private onToggleResult?: (result: SkillToggleResult) => boolean;

  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    tui: TUI,
    parsed: ParsedPrompt,
    contextWindow: number | undefined,
    discoveredSkills: SkillInfo[],
    done: (value: null) => void,
    onToggleResult?: (result: SkillToggleResult) => boolean
  ) {
    this.tui = tui;
    this.parsed = parsed;
    this.originalParsed = {
      ...parsed,
      sections: parsed.sections.map((s) => ({ ...s })),
    };
    this.originalTotalTokens = parsed.totalTokens;
    this.adjustedTotalTokens = parsed.totalTokens;
    this.contextWindow = contextWindow;
    this.discoveredSkills = discoveredSkills;
    this.tableItems = buildTableItems(parsed);
    this.done = done;
    this.onToggleResult = onToggleResult;
  }

  // -----------------------------------------------------------------------
  // Input handling
  // -----------------------------------------------------------------------

  handleInput(data: string): void {
    if (this.state.mode === "skill-toggle") {
      this.handleSkillToggleInput(data);
      return;
    }

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

    if (data === "e" && this.state.mode === "drilldown") {
      this.openDrilldownItemInEditor();
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
    const itemCount =
      this.state.mode === "skill-toggle"
        ? this.getFilteredSkills().length
        : this.getVisibleItems().length;
    if (itemCount === 0) {
      return;
    }

    let next = this.state.selectedIndex + delta;
    if (next < 0) {
      next = itemCount - 1;
    }
    if (next >= itemCount) {
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

    if (
      selected.label.startsWith("Skills") &&
      this.discoveredSkills.length > 0
    ) {
      this.state.mode = "skill-toggle";
      this.state.selectedIndex = 0;
      this.state.scrollOffset = 0;
      this.state.searchActive = false;
      this.state.searchQuery = "";
      this.invalidate();
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
  // Skill toggle
  // -----------------------------------------------------------------------

  private handleSkillToggleInput(data: string): void {
    if (this.state.confirmingDiscard) {
      if (data === "y" || data === "Y") {
        this.state.mode = "sections";
        this.state.pendingChanges = new Map();
        this.state.confirmingDiscard = false;
        this.state.selectedIndex = 0;
        this.state.scrollOffset = 0;
        this.recalculateTokens();
        this.invalidate();
        return;
      }
      if (data === "n" || data === "N" || matchesKey(data, "escape")) {
        this.state.confirmingDiscard = false;
        this.invalidate();
        return;
      }
      return;
    }

    if (this.state.searchActive) {
      this.handleSearchInput(data);
      return;
    }

    if (matchesKey(data, "escape")) {
      if (this.state.pendingChanges.size > 0) {
        this.state.confirmingDiscard = true;
        this.invalidate();
        return;
      }
      this.state.mode = "sections";
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

    if (matchesKey(data, "enter") || data === " ") {
      this.cycleSkillState();
      return;
    }

    if (matchesKey(data, "ctrl+s")) {
      this.saveSkillChanges();
      return;
    }

    if (data === "e") {
      this.openSkillInEditor();
      return;
    }

    if (data === "/") {
      this.state.searchActive = true;
      this.state.searchQuery = "";
      this.invalidate();
    }
  }

  private cycleSkillState(): void {
    const visibleSkills = this.getFilteredSkills();
    const skill = visibleSkills[this.state.selectedIndex];
    if (!skill) {
      return;
    }

    const current = this.getEffectiveMode(skill);
    let next: DisableMode;
    if (current === DisableMode.Enabled) {
      next = DisableMode.Hidden;
    } else if (current === DisableMode.Hidden) {
      next = DisableMode.Disabled;
    } else {
      next = DisableMode.Enabled;
    }

    if (next === skill.mode) {
      this.state.pendingChanges.delete(skill.name);
    } else {
      this.state.pendingChanges.set(skill.name, next);
    }

    this.recalculateTokens();
    this.invalidate();
  }

  private getEffectiveMode(skill: SkillInfo): DisableMode {
    return this.state.pendingChanges.get(skill.name) ?? skill.mode;
  }

  private recalculateTokens(): void {
    let tokenDelta = 0;
    for (const [name, newMode] of this.state.pendingChanges) {
      const skill = this.discoveredSkills.find((s) => s.name === name);
      if (!skill) {
        continue;
      }

      const wasInPrompt = skill.mode === DisableMode.Enabled;
      const willBeInPrompt = newMode === DisableMode.Enabled;

      if (wasInPrompt && !willBeInPrompt) {
        tokenDelta -= skill.tokens;
      } else if (!wasInPrompt && willBeInPrompt) {
        tokenDelta += skill.tokens;
      }
    }

    this.adjustedTotalTokens = this.originalTotalTokens + tokenDelta;
    this.parsed = this.getAdjustedParsed();
    this.tableItems = buildTableItems(this.parsed);
    this.invalidate();
  }

  private getAdjustedParsed(): ParsedPrompt {
    const sections = this.originalParsed.sections.map((s) => ({ ...s }));

    // Find the skills section and adjust its token count
    const skillsSection = sections.find((s) => s.label.startsWith("Skills"));
    if (skillsSection) {
      const originalSkillsTokens =
        this.originalParsed.sections.find((s) => s.label.startsWith("Skills"))
          ?.tokens ?? 0;

      let delta = 0;
      for (const [name, newMode] of this.state.pendingChanges) {
        const skill = this.discoveredSkills.find((s) => s.name === name);
        if (!skill) {
          continue;
        }

        const wasInPrompt = skill.mode === DisableMode.Enabled;
        const willBeInPrompt = newMode === DisableMode.Enabled;

        if (wasInPrompt && !willBeInPrompt) {
          delta -= skill.tokens;
        } else if (!wasInPrompt && willBeInPrompt) {
          delta += skill.tokens;
        }
      }

      skillsSection.tokens = originalSkillsTokens + delta;
    }

    return {
      sections,
      totalChars: this.originalParsed.totalChars,
      totalTokens: this.adjustedTotalTokens,
      skills: this.originalParsed.skills,
    };
  }

  private saveSkillChanges(): void {
    if (this.state.pendingChanges.size === 0) {
      return;
    }

    const success =
      this.onToggleResult?.({
        applied: true,
        changes: new Map(this.state.pendingChanges),
      }) ?? true;

    if (success) {
      // Update discoveredSkills to reflect the persisted state so the
      // UI doesn't snap back to stale modes after clearing pendingChanges.
      for (const [name, newMode] of this.state.pendingChanges) {
        const skill = this.discoveredSkills.find((s) => s.name === name);
        if (skill) {
          skill.mode = newMode;
        }
      }

      // Rebase the "original" token counts so subsequent toggles compute
      // deltas against the newly persisted state, not the initial load.
      this.originalTotalTokens = this.adjustedTotalTokens;
      this.originalParsed = {
        ...this.parsed,
        sections: this.parsed.sections.map((s) => ({ ...s })),
      };

      this.state.pendingChanges = new Map();
      this.state.confirmingDiscard = false;
    }

    this.invalidate();
  }

  private openSkillInEditor(): void {
    const visibleSkills = this.getFilteredSkills();
    const skill = visibleSkills[this.state.selectedIndex];
    if (!skill?.filePath) {
      return;
    }

    this.launchEditor(skill.filePath);
  }

  private openDrilldownItemInEditor(): void {
    const items = this.getVisibleItems();
    const item = items[this.state.selectedIndex];
    if (!item?.label.startsWith("/")) {
      return;
    }

    this.launchEditor(item.label);
  }

  private launchEditor(filePath: string): void {
    const editorCmd = getEditor();
    const [editor, ...editorArgs] = editorCmd.split(" ");

    this.tui.stop();

    try {
      spawnSync(editor, [...editorArgs, filePath], {
        stdio: "inherit",
      });
    } finally {
      this.tui.start();
      this.tui.requestRender(true);
    }
  }

  private getFilteredSkills(): SkillInfo[] {
    if (this.state.searchActive && this.state.searchQuery) {
      const items = this.discoveredSkills.map((s) => ({
        ...s,
        label: s.name,
      }));
      return fuzzyFilter(items, this.state.searchQuery);
    }
    return this.discoveredSkills;
  }

  private renderSkillToggle(
    lines: string[],
    innerW: number,
    row: (content: string) => string,
    emptyRow: () => string,
    centerRow: (content: string) => string
  ): void {
    lines.push(emptyRow());

    const pendingCount = this.state.pendingChanges.size;
    if (pendingCount > 0) {
      lines.push(
        row(
          sgr(
            "33",
            `⚠ ${pendingCount} pending change${pendingCount === 1 ? "" : "s"} (Ctrl+S to save)`
          )
        )
      );
      lines.push(emptyRow());
    }

    const breadcrumb = `${bold("Skills")}  ${dim("← esc to go back")}`;
    lines.push(row(breadcrumb));

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

    // Skill rows
    const skills = this.getFilteredSkills();
    if (skills.length === 0) {
      lines.push(centerRow(dim(italic("No matching skills"))));
      lines.push(emptyRow());
      return;
    }

    const startIdx = this.state.scrollOffset;
    const endIdx = Math.min(startIdx + MAX_VISIBLE_ROWS, skills.length);

    for (let i = startIdx; i < endIdx; i++) {
      const skill = skills[i];
      const isSelected = i === this.state.selectedIndex;
      const mode = this.getEffectiveMode(skill);
      const hasChanged = this.state.pendingChanges.has(skill.name);

      const prefix = isSelected ? sgr("36", "▸") : dim("·");

      let statusIcon: string;
      if (mode === DisableMode.Enabled) {
        statusIcon = sgr("32", "●");
      } else if (mode === DisableMode.Hidden) {
        statusIcon = sgr("33", "◐");
      } else {
        statusIcon = sgr("31", "○");
      }

      const changedMarker = hasChanged ? sgr("33", "*") : " ";
      const dupMarker = skill.hasDuplicates ? sgr("35", "²") : " ";
      const nameStr = isSelected ? bold(sgr("36", skill.name)) : skill.name;

      const tokenStr = `${fmt(skill.tokens)} tok`;
      const suffixWidth = visibleWidth(tokenStr);
      const prefixWidth = 8;
      const nameMaxWidth = innerW - prefixWidth - suffixWidth - 4;

      const truncatedName = truncateToWidth(nameStr, nameMaxWidth, "…");
      const nameWidth = visibleWidth(truncatedName);
      const gap = Math.max(
        1,
        innerW - prefixWidth - nameWidth - suffixWidth - 3
      );

      const content = `${prefix} ${statusIcon}${changedMarker}${dupMarker}${truncatedName}${" ".repeat(gap)}${dim(tokenStr)}`;
      lines.push(row(content));
    }

    lines.push(emptyRow());

    // Legend
    lines.push(
      row(
        dim(
          `${sgr("32", "●")} on  ${sgr("33", "◐")} hidden  ${sgr("31", "○")} disabled  ${sgr("35", "²")} duplicates`
        )
      )
    );

    // Scroll indicator
    if (skills.length > MAX_VISIBLE_ROWS) {
      const progress = Math.round(
        ((this.state.selectedIndex + 1) / skills.length) * 10
      );
      const dots = rainbowDots(progress, 10);
      const countStr = `${this.state.selectedIndex + 1}/${skills.length}`;
      lines.push(row(`${dots}  ${dim(countStr)}`));
      lines.push(emptyRow());
    }

    // Discard confirmation
    if (this.state.confirmingDiscard) {
      lines.push(emptyRow());
      lines.push(
        row(
          `${sgr("33", `Discard ${this.state.pendingChanges.size} change${this.state.pendingChanges.size === 1 ? "" : "s"}? `)}${dim("(y/n)")}`
        )
      );
    }
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

    // Zone 3: Interactive table or skill toggle
    if (this.state.mode === "skill-toggle") {
      this.renderSkillToggle(lines, innerW, row, emptyRow, centerRow);
    } else {
      this.renderInteractiveTable(lines, innerW, row, emptyRow, centerRow);
    }

    // Footer
    lines.push(divider());
    lines.push(emptyRow());

    let hints: string;
    if (this.state.mode === "skill-toggle") {
      hints = `${italic("↑↓")} navigate  ${italic("enter")} cycle state  ${italic("e")} edit  ${italic("/")} search  ${italic("ctrl+s")} save  ${italic("esc")} back`;
    } else if (this.state.mode === "drilldown") {
      const hasEditableItems = this.state.drilldownSection?.children?.some(
        (c) => c.label.startsWith("/")
      );
      hints = hasEditableItems
        ? `${italic("↑↓")} navigate  ${italic("e")} edit  ${italic("/")} search  ${italic("esc")} back`
        : `${italic("↑↓")} navigate  ${italic("/")} search  ${italic("esc")} back`;
    } else {
      hints = `${italic("↑↓")} navigate  ${italic("enter")} drill-in  ${italic("/")} search  ${italic("esc")} close`;
    }
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
  ctx: ExtensionCommandContext,
  discoveredSkills?: SkillInfo[],
  onToggleResult?: (result: SkillToggleResult) => boolean
): Promise<void> {
  await ctx.ui.custom<null>(
    (tui, _theme, _kb, done) => {
      const overlay = new BudgetOverlay(
        tui,
        parsed,
        contextWindow,
        discoveredSkills ?? [],
        done,
        onToggleResult
      );
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
