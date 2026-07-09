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
  return tmpDir;
}

/** Remove an isolated test agent directory; repeated cleanup is safe. */
export function removeIsolatedAgentDir(agentDir?: string): void {
  if (!agentDir) {
    return;
  }
  fs.rmSync(agentDir, { recursive: true, force: true });
}
