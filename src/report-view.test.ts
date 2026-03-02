import { showReport } from "./report-view.js";
import type { ParsedPrompt } from "./types.js";

describe("report-view", () => {
  it("exports showReport function", () => {
    expectTypeOf(showReport).toBeFunction();
  });
});

describe("buildTableItems", () => {
  it("should mark Skills section as drillable", async () => {
    const { buildTableItems } = await import("./report-view.js");
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
});
