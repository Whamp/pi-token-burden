import { createIsolatedAgentDir, removeIsolatedAgentDir } from "./agent-dir.js";
import { TmuxHarness } from "./tmux-harness.js";

describe("tmux harness", () => {
  let harness: TmuxHarness;
  let agentDir: string;

  afterEach(() => {
    harness?.stop();
    removeIsolatedAgentDir(agentDir);
  });

  it("should start pi and capture the token-burden overlay", () => {
    agentDir = createIsolatedAgentDir();
    harness = new TmuxHarness({ sessionName: "e2e-harness-test", agentDir });
    harness.start();
    harness.waitFor("pi-token-burden", 15_000);

    harness.sendKeys("/token-burden", "Enter");
    const lines = harness.waitFor("Token Burden", 10_000);

    const titleLine = lines.find((l) => l.includes("Token Burden"));
    expect(titleLine).toBeDefined();
  });
});
