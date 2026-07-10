import { isSkillsBudgetSectionLabel } from './skill-management-session.js';
import type { ParsedPrompt, TableItem } from './types.js';

/** Convert ParsedPrompt sections into TableItems sorted by tokens desc. */
export function buildTableItems(parsed: ParsedPrompt): TableItem[] {
  return parsed.sections
    .map((section): TableItem => {
      const pct = parsed.totalTokens > 0 ? (section.tokens / parsed.totalTokens) * 100 : 0;

      const children: TableItem[] | undefined = section.children?.length
        ? section.children
            .map(
              (child): TableItem => ({
                label: child.label,
                tokens: child.tokens,
                chars: child.chars,
                pct: parsed.totalTokens > 0 ? (child.tokens / parsed.totalTokens) * 100 : 0,
                drillable: false,
                content: child.content,
              }),
            )
            .toSorted((a, b) => b.tokens - a.tokens)
        : undefined;

      return {
        label: section.label,
        tokens: section.tokens,
        chars: section.chars,
        pct,
        drillable:
          (children?.length ?? 0) > 0 ||
          Boolean(section.tools) ||
          isSkillsBudgetSectionLabel(section.label),
        content: section.content,
        tools: section.tools,
        children,
      };
    })
    .toSorted((a, b) => b.tokens - a.tokens);
}
