import { execSync, type ExecSyncOptions } from "node:child_process";

const EXEC_OPTS: ExecSyncOptions = { encoding: "utf8", timeout: 10_000 };

interface TmuxHarnessOptions {
  /** Unique tmux session name. */
  sessionName: string;
  /** Terminal width. Default: 120. */
  width?: number;
  /** Terminal height. Default: 40. */
  height?: number;
  /**
   * Environment variables to pass to the pi process.
   * PI_CODING_AGENT_DIR is set automatically when agentDir is provided.
   */
  env?: Record<string, string>;
  /** Override the agent dir (sets PI_CODING_AGENT_DIR). */
  agentDir?: string;
  /** Extra pi CLI flags. Default: --no-session --no-memory. */
  piFlags?: string[];
}

function shellEscape(s: string): string {
  return `'${s.replaceAll("'", "'\\''")}'`;
}

function sleepMs(ms: number): void {
  execSync(`sleep ${(ms / 1000).toFixed(3)}`);
}

/**
 * Format a key for tmux send-keys.
 *
 * Tmux key names (Enter, Escape, Up, Down, C-s, Space, etc.) must NOT
 * be quoted. Literal text (user input) must be quoted as a single argument
 * so tmux treats it as a string, not individual keys.
 */
function formatTmuxKey(key: string): string {
  if (/^[A-Z]/.test(key) || key.startsWith("C-")) {
    return key;
  }
  return shellEscape(key);
}

export class TmuxHarness {
  readonly sessionName: string;
  private readonly width: number;
  private readonly height: number;
  private readonly env: Record<string, string>;
  private readonly piFlags: string[];

  constructor(opts: TmuxHarnessOptions) {
    this.sessionName = opts.sessionName;
    this.width = opts.width ?? 120;
    this.height = opts.height ?? 40;
    this.piFlags = opts.piFlags ?? [
      "--no-session",
      "--no-memory",
      "--provider",
      "zai",
      "--model",
      "glm-4.7",
    ];
    this.env = { ...opts.env };
    if (opts.agentDir) {
      this.env.PI_CODING_AGENT_DIR = opts.agentDir;
    }
  }

  /** Start pi in a detached tmux session. */
  start(): void {
    // Kill stale session if it exists
    this.tryKill();

    const envPrefix = Object.entries(this.env)
      .map(([k, v]) => `${k}=${shellEscape(v)}`)
      .join(" ");

    const flags = this.piFlags.join(" ");
    const cmd = `${envPrefix ? `${envPrefix} ` : ""}pi -e ./src/index.ts ${flags} 2>&1`;

    execSync(
      `tmux new-session -d -s ${this.sessionName} -x ${this.width} -y ${this.height} '${cmd}'`,
      EXEC_OPTS
    );
  }

  /** Wait until capture output matches a pattern. */
  waitFor(pattern: string | RegExp, timeoutMs = 10_000): string[] {
    const deadline = Date.now() + timeoutMs;
    const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;

    while (Date.now() < deadline) {
      const lines = this.capture();
      if (lines.some((line) => re.test(line))) {
        return lines;
      }
      sleepMs(300);
    }

    const finalCapture = this.capture();
    throw new Error(
      `Timed out waiting for ${pattern} after ${timeoutMs}ms.\nScreen:\n${finalCapture.join("\n")}`
    );
  }

  /** Send keys to the tmux session. Inserts a brief delay after sending. */
  sendKeys(...keys: string[]): void {
    const escaped = keys.map((k) => formatTmuxKey(k)).join(" ");
    execSync(`tmux send-keys -t ${this.sessionName} ${escaped}`, EXEC_OPTS);
    sleepMs(150);
  }

  /** Capture the current pane content as an array of lines. */
  capture(): string[] {
    const output = execSync(`tmux capture-pane -t ${this.sessionName} -p`, {
      ...EXEC_OPTS,
      timeout: 5000,
    }) as string;
    return output.split("\n");
  }

  /** Kill the tmux session. Safe to call multiple times. */
  stop(): void {
    this.tryKill();
  }

  private tryKill(): void {
    try {
      execSync(
        `tmux kill-session -t ${this.sessionName} 2>/dev/null`,
        EXEC_OPTS
      );
    } catch {
      // Session didn't exist — fine.
    }
  }
}
