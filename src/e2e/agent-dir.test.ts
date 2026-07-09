import * as fs from 'node:fs';
import * as path from 'node:path';

import { createIsolatedAgentDir, removeIsolatedAgentDir } from './agent-dir.js';

describe('isolated agent directory', () => {
  it('creates an empty settings file and removes the directory safely', () => {
    const agentDir = createIsolatedAgentDir();

    try {
      const settingsPath = path.join(agentDir, 'settings.json');
      expect(fs.readFileSync(settingsPath, 'utf8')).toBe('{}');
    } finally {
      removeIsolatedAgentDir(agentDir);
    }

    expect(fs.existsSync(agentDir)).toBeFalsy();
    expect(() => removeIsolatedAgentDir(agentDir)).not.toThrow();
    expect(() => removeIsolatedAgentDir(undefined)).not.toThrow();
  });
});
