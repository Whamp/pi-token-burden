import { buildTableItems } from './buildTableItems.js';
import type { ParsedPrompt } from './types.js';

function summarizeItems(
  items: {
    label: string;
    tokens: number;
    drillable: boolean;
    children?: unknown[];
  }[],
) {
  return items.map((i) => ({
    label: i.label,
    tokens: i.tokens,
    drillable: i.drillable,
    childCount: i.children?.length ?? 0,
  }));
}

describe('budget section table rows', () => {
  it('marks Skills Budget Sections as drillable through the shared section predicate', () => {
    const parsed: ParsedPrompt = {
      sections: [
        { label: 'Base prompt', chars: 100, tokens: 25 },
        { label: 'Skills (0)', chars: 0, tokens: 0 },
      ],
      totalChars: 100,
      totalTokens: 25,
      skills: [],
    };

    const skillsItem = buildTableItems(parsed).find((item) => item.label === 'Skills (0)');

    expect(skillsItem?.drillable).toBeTruthy();
  });

  it('preserves table item sorting, percentages, content, and child rows', () => {
    const parsed: ParsedPrompt = {
      sections: [
        {
          label: 'Base prompt',
          chars: 5000,
          tokens: 1200,
          content: 'base instructions',
        },
        {
          label: 'AGENTS.md files',
          chars: 3000,
          tokens: 700,
          children: [
            {
              label: '/home/user/.pi/agent/AGENTS.md',
              chars: 1500,
              tokens: 350,
              content: 'user agents',
            },
            {
              label: '/home/user/project/AGENTS.md',
              chars: 1500,
              tokens: 350,
            },
          ],
        },
        {
          label: 'Skills (3)',
          chars: 2000,
          tokens: 500,
          children: [
            { label: 'brainstorming', chars: 800, tokens: 200 },
            { label: 'tdd', chars: 700, tokens: 175 },
            { label: 'debugging', chars: 500, tokens: 125 },
          ],
        },
        { label: 'Metadata (date/time, cwd)', chars: 200, tokens: 50 },
      ],
      totalChars: 10_200,
      totalTokens: 2450,
      skills: [],
    };

    const items = buildTableItems(parsed);

    expect(summarizeItems(items)).toMatchInlineSnapshot(`
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
    expect(items.find((item) => item.label === 'Base prompt')?.content).toBe('base instructions');
    expect(items.find((item) => item.label === 'AGENTS.md files')?.children?.[0]?.content).toBe(
      'user agents',
    );
    expect(items.find((item) => item.label === 'Base prompt')?.pct).toBeCloseTo(
      (1200 / 2450) * 100,
    );
  });
});
