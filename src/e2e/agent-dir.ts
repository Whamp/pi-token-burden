import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Create an isolated Pi agent directory with an empty settings.json.
 *
 * E2e tests run the local extension via `pi -e ./src/index.ts`; using a temp
 * PI_CODING_AGENT_DIR prevents the user's installed extensions and commands
 * from conflicting with the local test extension.
 */
export function createIsolatedAgentDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-agent-'));
  fs.writeFileSync(path.join(tmpDir, 'settings.json'), '{}');

  const skillsDir = path.join(tmpDir, '.agents', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  for (let i = 1; i <= 12; i++) {
    const skillName = `fixture-skill-${String(i).padStart(2, '0')}`;
    const skillDir = path.join(skillsDir, skillName);
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: ${skillName}\ndescription: Fixture skill ${i} for e2e token-burden tests.\n---\n\n# ${skillName}\n\nUse this fixture for deterministic e2e skill rendering.\n`,
    );
  }

  return tmpDir;
}

/** Remove an isolated test agent directory; repeated cleanup is safe. */
export function removeIsolatedAgentDir(agentDir?: string): void {
  if (!agentDir) {
    return;
  }
  fs.rmSync(agentDir, { recursive: true, force: true });
}
