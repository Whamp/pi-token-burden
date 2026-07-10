import { EXCLUSION_LABELS, isExclusionLabel } from './routingPolicy.js';

describe('Sandcastle routing policy', () => {
  it('excludes planning and human-intervention labels', () => {
    expect(EXCLUSION_LABELS).toStrictEqual(
      new Set([
        'needs-info',
        'needs-triage',
        'ready-for-human',
        'wayfinder:grilling',
        'wayfinder:map',
        'wayfinder:prototype',
        'wontfix',
      ]),
    );
    expect(isExclusionLabel('ready-for-human')).toBeTruthy();
    expect(isExclusionLabel('wayfinder:task')).toBeFalsy();
  });
});
