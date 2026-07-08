import { DisableMode } from "./enums.js";
import { getEditor, isReadOnlySection, showReport } from "./report-view.js";
import type { ParsedPrompt, SkillInfo } from "./types.js";

describe("report-view", () => {
  it("exports showReport function", () => {
    expectTypeOf(showReport).toBeFunction();
  });
});

interface OverlayComponent {
  render(width: number): string[];
  invalidate(): void;
  handleInput(data: string): void;
}

interface MockTui {
  requestRender: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
}

interface MountedOverlay {
  overlay: OverlayComponent;
  tui: MockTui;
}

type OverlayFactory = (
  tui: MockTui,
  theme: unknown,
  kb: unknown,
  done: (value: null) => void
) => OverlayComponent;

async function mountOverlayWithTui(
  parsed: ParsedPrompt,
  discoveredSkills: SkillInfo[] = [],
  contextWindow?: number
): Promise<MountedOverlay> {
  let component: OverlayComponent | undefined;
  let tui: MockTui | undefined;

  const ctx = {
    ui: {
      custom: vi.fn(async (factory: OverlayFactory) => {
        tui = {
          requestRender: vi.fn(),
          stop: vi.fn(),
          start: vi.fn(),
        };
        component = factory(tui, undefined, undefined, vi.fn());
      }),
    },
  };

  await showReport(parsed, contextWindow, ctx as never, discoveredSkills);

  if (!component) {
    throw new Error("Overlay component was not created");
  }

  if (!tui) {
    throw new Error("Overlay TUI was not created");
  }

  return { overlay: component, tui };
}

async function mountOverlay(
  parsed: ParsedPrompt,
  discoveredSkills: SkillInfo[] = [],
  contextWindow?: number
): Promise<OverlayComponent> {
  const { overlay } = await mountOverlayWithTui(
    parsed,
    discoveredSkills,
    contextWindow
  );
  return overlay;
}

describe("showReport — rendering", () => {
  it("renders over-budget context window usage without crashing", async () => {
    const parsed: ParsedPrompt = {
      sections: [{ label: "Base prompt", chars: 1000, tokens: 150 }],
      totalChars: 1000,
      totalTokens: 150,
      skills: [],
    };

    const overlay = await mountOverlay(parsed, [], 100);

    expect(() => overlay.render(120)).not.toThrow();
    expect(overlay.render(120).join("\n")).toContain("150 / 100");
  });

  it("keeps an empty Skills section visible for discovered hidden skills", async () => {
    const parsed: ParsedPrompt = {
      sections: [
        { label: "Base prompt", chars: 100, tokens: 25 },
        { label: "Metadata (date/time, cwd)", chars: 30, tokens: 5 },
      ],
      totalChars: 130,
      totalTokens: 30,
      skills: [],
    };
    const hiddenSkill: SkillInfo = {
      name: "hidden-skill",
      description: "Hidden skill",
      filePath: "/skills/hidden-skill/SKILL.md",
      allPaths: ["/skills/hidden-skill/SKILL.md"],
      mode: DisableMode.Hidden,
      tokens: 10,
      hasDuplicates: false,
    };

    const overlay = await mountOverlay(parsed, [hiddenSkill]);
    const text = overlay.render(120).join("\n");

    expect(text).toContain("Skills (0)");
  });
});

describe("showReport — tools view", () => {
  it("opens a dedicated tools view with Active expanded", async () => {
    const parsed = {
      sections: [
        {
          label: "Tool definitions (1 active, 2 total)",
          chars: 100,
          tokens: 10,
          children: [{ label: "read", chars: 40, tokens: 10 }],
          tools: {
            active: [
              {
                name: "read",
                chars: 40,
                tokens: 10,
                content: '{"name":"read"}',
              },
            ],
            inactive: [
              {
                name: "bash",
                chars: 50,
                tokens: 12,
                content: '{"name":"bash"}',
              },
            ],
          },
        },
      ],
      totalChars: 100,
      totalTokens: 10,
      skills: [],
    } as ParsedPrompt;

    const overlay = await mountOverlay(parsed);
    overlay.handleInput("\r");

    const text = overlay.render(120).join("\n");

    expect(text).toContain("Active");
    expect(text).toContain("read");
    expect(text).toContain("10 tok");
    expect(text).not.toContain("bash");
  });

  it("shows Inactive as a collapsed counterfactual group by default", async () => {
    const parsed = {
      sections: [
        {
          label: "Tool definitions (1 active, 2 total)",
          chars: 100,
          tokens: 10,
          children: [{ label: "read", chars: 40, tokens: 10 }],
          tools: {
            active: [
              {
                name: "read",
                chars: 40,
                tokens: 10,
                content: '{"name":"read"}',
              },
            ],
            inactive: [
              {
                name: "bash",
                chars: 50,
                tokens: 12,
                content: '{"name":"bash"}',
              },
            ],
          },
        },
      ],
      totalChars: 100,
      totalTokens: 10,
      skills: [],
    } as ParsedPrompt;

    const overlay = await mountOverlay(parsed);
    overlay.handleInput("\r");

    const text = overlay.render(120).join("\n");

    expect(text).toContain("Inactive (1, +12 tok if enabled)");
    expect(text).not.toContain("bash");
  });

  it("expands inactive tools after navigating past active tools", async () => {
    const parsed = {
      sections: [
        {
          label: "Tool definitions (1 active, 2 total)",
          chars: 100,
          tokens: 10,
          children: [{ label: "read", chars: 40, tokens: 10 }],
          tools: {
            active: [
              {
                name: "read",
                chars: 40,
                tokens: 10,
                content: '{"name":"read"}',
              },
            ],
            inactive: [
              {
                name: "bash",
                chars: 50,
                tokens: 12,
                content: '{"name":"bash"}',
              },
            ],
          },
        },
      ],
      totalChars: 100,
      totalTokens: 10,
      skills: [],
    } as ParsedPrompt;

    const overlay = await mountOverlay(parsed);
    overlay.handleInput("\r");
    overlay.handleInput("\u001B[B");
    overlay.handleInput("\r");

    const text = overlay.render(120).join("\n");

    expect(text).toContain("bash");
    expect(text).toContain("+12 tok if enabled");
  });

  it("expands Inactive to show per-tool counterfactual rows", async () => {
    const parsed = {
      sections: [
        {
          label: "Tool definitions (0 active, 1 total)",
          chars: 50,
          tokens: 0,
          children: [],
          tools: {
            active: [],
            inactive: [
              {
                name: "bash",
                chars: 50,
                tokens: 12,
                content: '{"name":"bash"}',
              },
            ],
          },
        },
      ],
      totalChars: 50,
      totalTokens: 0,
      skills: [],
    } as ParsedPrompt;

    const overlay = await mountOverlay(parsed);
    overlay.handleInput("\r");
    overlay.handleInput("\r");

    const text = overlay.render(120).join("\n");

    expect(text).toContain("bash");
    expect(text).toContain("+12 tok if enabled");
  });

  it("allows selecting inactive tools when no active tools are present", async () => {
    const parsed = {
      sections: [
        {
          label: "Tool definitions (0 active, 1 total)",
          chars: 50,
          tokens: 0,
          children: [],
          tools: {
            active: [],
            inactive: [
              {
                name: "bash",
                chars: 50,
                tokens: 12,
                content: '{"name":"bash"}',
              },
            ],
          },
        },
      ],
      totalChars: 50,
      totalTokens: 0,
      skills: [],
    } as ParsedPrompt;

    const overlay = await mountOverlay(parsed);
    overlay.handleInput("\r");
    overlay.handleInput("\r");
    overlay.handleInput("\u001B[B");

    const selectedLine = overlay.render(120).find((line) => line.includes("▸"));

    expect(selectedLine).toContain("bash");
  });

  it("opens the selected tool definition in the editor", async () => {
    const savedVisual = process.env.VISUAL;
    const savedEditor = process.env.EDITOR;
    process.env.VISUAL = "";
    process.env.EDITOR = "true";

    try {
      const parsed = {
        sections: [
          {
            label: "Tool definitions (1 active, 2 total)",
            chars: 100,
            tokens: 10,
            children: [{ label: "read", chars: 40, tokens: 10 }],
            tools: {
              active: [
                {
                  name: "read",
                  chars: 40,
                  tokens: 10,
                  content: '{"name":"read"}',
                },
              ],
              inactive: [
                {
                  name: "bash",
                  chars: 50,
                  tokens: 12,
                  content: '{"name":"bash"}',
                },
              ],
            },
          },
        ],
        totalChars: 100,
        totalTokens: 10,
        skills: [],
      } as ParsedPrompt;

      const { overlay, tui } = await mountOverlayWithTui(parsed);
      overlay.handleInput("\r");
      overlay.handleInput("e");

      expect(tui.stop).toHaveBeenCalledWith();
      expect(tui.start).toHaveBeenCalledWith();
      expect(tui.requestRender).toHaveBeenCalledWith(true);
    } finally {
      process.env.VISUAL = savedVisual;
      process.env.EDITOR = savedEditor;
    }
  });

  it("shows a view hint when a tool row is selected", async () => {
    const parsed = {
      sections: [
        {
          label: "Tool definitions (1 active, 2 total)",
          chars: 100,
          tokens: 10,
          children: [{ label: "read", chars: 40, tokens: 10 }],
          tools: {
            active: [
              {
                name: "read",
                chars: 40,
                tokens: 10,
                content: '{"name":"read"}',
              },
            ],
            inactive: [
              {
                name: "bash",
                chars: 50,
                tokens: 12,
                content: '{"name":"bash"}',
              },
            ],
          },
        },
      ],
      totalChars: 100,
      totalTokens: 10,
      skills: [],
    } as ParsedPrompt;

    const overlay = await mountOverlay(parsed);
    overlay.handleInput("\r");

    const text = overlay.render(120).join("\n");

    expect(text).toContain("view");
  });
});

describe("getEditor — editor resolution", () => {
  function withEnv(
    env: { VISUAL?: string; EDITOR?: string },
    fn: () => void
  ): void {
    const savedVisual = process.env.VISUAL;
    const savedEditor = process.env.EDITOR;
    try {
      if ("VISUAL" in env) {
        process.env.VISUAL = env.VISUAL;
      } else {
        delete process.env.VISUAL;
      }
      if ("EDITOR" in env) {
        process.env.EDITOR = env.EDITOR;
      } else {
        delete process.env.EDITOR;
      }
      fn();
    } finally {
      process.env.VISUAL = savedVisual;
      process.env.EDITOR = savedEditor;
    }
  }

  it("should prefer $VISUAL over $EDITOR", () => {
    withEnv({ VISUAL: "code", EDITOR: "vim" }, () => {
      expect(getEditor()).toBe("code");
    });
  });

  it("should fall back to $EDITOR when $VISUAL is unset", () => {
    withEnv({ EDITOR: "nano" }, () => {
      expect(getEditor()).toBe("nano");
    });
  });

  it("should fall back to vi when both are unset", () => {
    withEnv({}, () => {
      expect(getEditor()).toBe("vi");
    });
  });

  it("should skip empty string $VISUAL", () => {
    withEnv({ VISUAL: "", EDITOR: "nano" }, () => {
      expect(getEditor()).toBe("nano");
    });
  });
});

describe("isReadOnlySection — read-only detection", () => {
  it("returns true for generated sections", () => {
    expect(isReadOnlySection("Base prompt")).toBeTruthy();
    expect(isReadOnlySection("Metadata (date/time, cwd)")).toBeTruthy();
    expect(isReadOnlySection("SYSTEM.md / APPEND_SYSTEM.md")).toBeTruthy();
  });

  it("returns false for file-backed sections", () => {
    expect(isReadOnlySection("AGENTS.md files")).toBeFalsy();
    expect(isReadOnlySection("Skills (3)")).toBeFalsy();
  });
});
