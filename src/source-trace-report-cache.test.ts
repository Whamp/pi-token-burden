import type { BasePromptTraceResult } from "./base-trace/index.js";
import { SourceTraceReportCache } from "./source-trace-report-cache.js";

function result(fingerprint: string): BasePromptTraceResult {
  return {
    fingerprint,
    generatedAt: "2026-01-01T00:00:00.000Z",
    baseTokens: 100,
    buckets: [],
    evidence: [],
    errors: [],
  };
}

describe("source trace report cache", () => {
  it("caches the latest loaded report until refreshed", async () => {
    const cache = new SourceTraceReportCache();
    const load = vi
      .fn<() => Promise<BasePromptTraceResult>>()
      .mockResolvedValueOnce(result("trace-a"))
      .mockResolvedValueOnce(result("trace-b"));

    const first = await cache.getOrLoad(load);
    const second = await cache.getOrLoad(load);
    const refreshed = await cache.getOrLoad(load, { refresh: true });

    expect(first).toBe(second);
    expect(refreshed).not.toBe(first);
    expect(refreshed.result.fingerprint).toBe("trace-b");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
