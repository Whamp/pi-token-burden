import {
  getEditor,
  isReadOnlySection,
  showReport,
  buildTableItems,
} from "./report-view.js";
import type { ParsedPrompt } from "./types.js";

describe("report-view", () => {
  it("exports showReport function", () => {
    expectTypeOf(showReport).toBeFunction();
  });
});

function summarizeItems(
  items: {
    label: string;
    tokens: number;
    drillable: boolean;
    children?: unknown[];
  }[]
) {
  return items.map((i) => ({
    label: i.label,
    tokens: i.tokens,
    drillable: i.drillable,
    childCount: i.children?.length ?? 0,
  }));
}

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

type OverlayFactory = (
  tui: MockTui,
  theme: unknown,
  kb: unknown,
  done: (value: null) => void
) => OverlayComponent;

async function mountOverlay(parsed: ParsedPrompt): Promise<OverlayComponent> {
  let component: OverlayComponent | undefined;

  const ctx = {
    ui: {
      custom: vi.fn(async (factory: OverlayFactory) => {
        const tui = {
          requestRender: vi.fn(),
          stop: vi.fn(),
          start: vi.fn(),
        };
        component = factory(tui, undefined, undefined, vi.fn());
      }),
    },
  };

  await showReport(parsed, undefined, ctx as never);

  if (!component) {
    throw new Error("Overlay component was not created");
  }

  return component;
}

describe("buildTableItems — table items", () => {
  it("should mark Skills section as drillable", () => {
    const parsed: ParsedPrompt = {
      sections: [
        { label: "Base prompt", chars: 100, tokens: 25 },
        {
          label: "Skills (2)",
          chars: 200,
          tokens: 50,
          children: [
            { label: "skill-a", chars: 100, tokens: 25 },
            { label: "skill-b", chars: 100, tokens: 25 },
          ],
        },
      ],
      totalChars: 300,
      totalTokens: 75,
      skills: [],
    };

    const items = buildTableItems(parsed);
    const skillsItem = items.find((i) => i.label.startsWith("Skills"));

    expect(skillsItem?.drillable).toBeTruthy();
    expect(skillsItem?.children).toHaveLength(2);
  });

  it("should produce consistent table items structure", () => {
    const parsed: ParsedPrompt = {
      sections: [
        { label: "Base prompt", chars: 5000, tokens: 1200 },
        {
          label: "AGENTS.md files",
          chars: 3000,
          tokens: 700,
          children: [
            {
              label: "/home/user/.pi/agent/AGENTS.md",
              chars: 1500,
              tokens: 350,
            },
            {
              label: "/home/user/project/AGENTS.md",
              chars: 1500,
              tokens: 350,
            },
          ],
        },
        {
          label: "Skills (3)",
          chars: 2000,
          tokens: 500,
          children: [
            { label: "brainstorming", chars: 800, tokens: 200 },
            { label: "tdd", chars: 700, tokens: 175 },
            { label: "debugging", chars: 500, tokens: 125 },
          ],
        },
        { label: "Metadata (date/time, cwd)", chars: 200, tokens: 50 },
      ],
      totalChars: 10_200,
      totalTokens: 2450,
      skills: [],
    };

    const items = buildTableItems(parsed);

    const summary = summarizeItems(items);

    expect(summary).toMatchInlineSnapshot(`
      [
        {
          "childCount": 0,
          "drillable": false,
          "label": "Base prompt",
          "tokens": 1200,
        },
        {
          "childCount": 2,
          "drillable": true,
          "label": "AGENTS.md files",
          "tokens": 700,
        },
        {
          "childCount": 3,
          "drillable": true,
          "label": "Skills (3)",
          "tokens": 500,
        },
        {
          "childCount": 0,
          "drillable": false,
          "label": "Metadata (date/time, cwd)",
          "tokens": 50,
        },
      ]
    `);
  });

  it("should sort sections by tokens descending", () => {
    const parsed: ParsedPrompt = {
      sections: [
        { label: "Small", chars: 100, tokens: 10 },
        { label: "Large", chars: 1000, tokens: 500 },
        { label: "Medium", chars: 500, tokens: 200 },
      ],
      totalChars: 1600,
      totalTokens: 710,
      skills: [],
    };

    const items = buildTableItems(parsed);
    const labels = items.map((i) => i.label);

    expect(labels).toStrictEqual(["Large", "Medium", "Small"]);
  });

  it("should propagate content from PromptSection to TableItem", () => {
    const parsed: ParsedPrompt = {
      sections: [
        {
          label: "Base prompt",
          chars: 18,
          tokens: 5,
          content: "You are helpful.\n\n",
        },
        {
          label: "Metadata (date/time, cwd)",
          chars: 30,
          tokens: 8,
          content: "Current date and time: Monday",
        },
      ],
      totalChars: 48,
      totalTokens: 13,
      skills: [],
    };

    const items = buildTableItems(parsed);

    expect(items.find((i) => i.label === "Base prompt")?.content).toBe(
      "You are helpful.\n\n"
    );
    expect(items.find((i) => i.label.startsWith("Metadata"))?.content).toBe(
      "Current date and time: Monday"
    );
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
