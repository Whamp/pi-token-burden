import { showReport, buildTableItems } from "./report-view.js";
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
});
