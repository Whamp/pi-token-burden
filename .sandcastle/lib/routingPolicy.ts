/** Labels that exclude an issue from every Sandcastle route. */
export const EXCLUSION_LABELS = new Set([
  'needs-info',
  'needs-triage',
  'ready-for-human',
  'wayfinder:grilling',
  'wayfinder:map',
  'wayfinder:prototype',
  'wontfix',
]);

/** Return whether a label excludes an issue from Sandcastle pickup. */
export function isExclusionLabel(label: string): boolean {
  return EXCLUSION_LABELS.has(label);
}
