import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface LintResult {
  output: string;
  status: number | null;
}

interface LintFixtureOptions {
  fileName?: string;
  companionFiles?: Record<string, string>;
}

function lintSource(source: string, options: LintFixtureOptions = {}): LintResult {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'token-burden-lint-'));
  const fixturePath = join(fixtureDirectory, options.fileName ?? 'contract.ts');
  writeFileSync(fixturePath, source);
  for (const [fileName, content] of Object.entries(options.companionFiles ?? {})) {
    writeFileSync(join(fixtureDirectory, fileName), content);
  }

  try {
    const result = spawnSync(
      'pnpm',
      ['exec', 'oxlint', '--type-aware', '--no-ignore', '--config', '.oxlintrc.json', fixturePath],
      { encoding: 'utf8' },
    );

    return {
      output: `${result.stdout}${result.stderr}`,
      status: result.status,
    };
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
}

describe('TypeScript standards lint contract', () => {
  it('enforces native assertion and Factory rules through the project config', () => {
    const result = lintSource(`
      export type ContractStatus = "ready" | "done";

      export function readStatus(value: unknown): ContractStatus {
        return value as ContractStatus;
      }
    `);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('consistent-type-assertions');
    expect(result.output).toContain('no-exported-string-union-types');
  });

  it('preserves as const literal narrowing', () => {
    const result = lintSource(
      `
        const contractStatuses = ['ready', 'done'] as const;

        export function firstContractStatus(): 'ready' {
          return contractStatuses[0];
        }
      `,
      {
        fileName: 'firstContractStatus.ts',
        companionFiles: { 'firstContractStatus.test.ts': 'export {};\n' },
      },
    );

    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain('consistent-type-assertions');
  });
});
