import { DisableMode } from './enums.js';
import { saveSkillToggleResult } from './saveSkillToggleResult.js';
import type { SkillToggleResult } from './types.js';

function toggleResult(changes: Map<string, DisableMode>): SkillToggleResult {
  return { applied: true, changes };
}

describe('skill save', () => {
  it('skips persistence when there are no applied changes', () => {
    const persist = vi.fn();

    const outcomes = [
      saveSkillToggleResult({ applied: false, changes: new Map() }, persist),
      saveSkillToggleResult(toggleResult(new Map()), persist),
    ];

    expect(outcomes).toStrictEqual([
      { ok: true, saved: false },
      { ok: true, saved: false },
    ]);
    expect(persist).not.toHaveBeenCalled();
  });

  it('persists changes and summarizes saved skill visibility states', () => {
    const changes = new Map([
      ['tdd', DisableMode.ENABLED],
      ['browser-use', DisableMode.HIDDEN],
      ['github', DisableMode.HIDDEN],
      ['legacy', DisableMode.DISABLED],
    ]);
    const persist = vi.fn();

    const outcome = saveSkillToggleResult(toggleResult(changes), persist);

    expect(outcome).toStrictEqual({
      ok: true,
      saved: true,
      summary: '1 enabled, 2 hidden, 1 disabled',
    });
    expect(persist).toHaveBeenCalledWith(changes);
  });

  it('returns an error outcome when persistence fails', () => {
    const persist = vi.fn(() => {
      throw new Error('disk full');
    });

    const outcome = saveSkillToggleResult(
      toggleResult(new Map([['tdd', DisableMode.HIDDEN]])),
      persist,
    );

    expect(outcome).toStrictEqual({
      ok: false,
      saved: false,
      errorMessage: 'disk full',
    });
  });
});
