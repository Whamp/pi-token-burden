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

/** Normal issue-kind labels accepted by the implementation route. */
export const IMPLEMENTATION_LABELS = new Set([
  'bug',
  'documentation',
  'enhancement',
  'feature',
  'task',
]);
