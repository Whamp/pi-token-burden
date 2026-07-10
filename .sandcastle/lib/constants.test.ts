import { EXCLUSION_LABELS, IMPLEMENTATION_LABELS } from './constants.js';

describe('Sandcastle routing policy', () => {
  it('keeps exclusion and implementation labels disjoint', () => {
    expect(
      Array.from(IMPLEMENTATION_LABELS).some((label) => EXCLUSION_LABELS.has(label)),
    ).toBeFalsy();
  });
});
