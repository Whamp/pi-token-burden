import type { BarSegment, FilterItem } from "./types.js";

/**
 * Score a query against text using fuzzy matching.
 * Returns 0 for no match, higher scores for better matches.
 */
function fuzzyScore(query: string, text: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  // Exact substring match scores highest
  if (lowerText.includes(lowerQuery)) {
    return 100 + (lowerQuery.length / lowerText.length) * 50;
  }

  // Fuzzy character-by-character match
  let score = 0;
  let queryIndex = 0;
  let consecutiveBonus = 0;

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      score += 10 + consecutiveBonus;
      consecutiveBonus += 5;
      queryIndex++;
    } else {
      consecutiveBonus = 0;
    }
  }

  return queryIndex === lowerQuery.length ? score : 0;
}

/**
 * Filter and sort items by fuzzy match against their label.
 * Returns all items (unmodified order) when query is empty.
 */
export function fuzzyFilter<T extends FilterItem>(
  items: T[],
  query: string
): T[] {
  if (!query.trim()) {
    return items;
  }

  const scored = items
    .map((item) => ({ item, score: fuzzyScore(query, item.label) }))
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score);

  return scored.map((entry) => entry.item);
}

/**
 * Compute bar segment widths proportional to token counts.
 * Each segment gets at least 1 character. Excess is stolen from the largest.
 */
export function buildBarSegments(
  sections: { label: string; tokens: number }[],
  barWidth: number
): BarSegment[] {
  if (sections.length === 0) {
    return [];
  }

  const totalTokens = sections.reduce((sum, s) => sum + s.tokens, 0);

  // If all tokens are zero, distribute evenly
  if (totalTokens === 0) {
    const baseWidth = Math.floor(barWidth / sections.length);
    let remainder = barWidth - baseWidth * sections.length;
    return sections.map((s) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder--;
      return { label: s.label, width: baseWidth + extra };
    });
  }

  // Compute proportional widths
  const raw = sections.map((s) => (s.tokens / totalTokens) * barWidth);

  // Floor each, enforce minimum 1
  const widths = raw.map((w) => Math.max(1, Math.floor(w)));

  // Adjust total to match barWidth
  const currentTotal = widths.reduce((sum, w) => sum + w, 0);
  const diff = barWidth - currentTotal;

  if (diff > 0) {
    // Distribute extra to segments with largest fractional parts
    const fractionals = raw.map((w, i) => ({ index: i, frac: w - widths[i] }));
    fractionals.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < diff; i++) {
      widths[fractionals[i % fractionals.length].index]++;
    }
  } else if (diff < 0) {
    // Steal from largest segments
    for (let i = 0; i < -diff; i++) {
      let maxIdx = 0;
      for (let j = 1; j < widths.length; j++) {
        if (widths[j] > widths[maxIdx]) {
          maxIdx = j;
        }
      }
      if (widths[maxIdx] > 1) {
        widths[maxIdx]--;
      }
    }
  }

  return sections.map((s, i) => ({ label: s.label, width: widths[i] }));
}
