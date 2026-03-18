import { TraceCache } from "./cache.js";
import type { BasePromptTraceResult } from "./types.js";

function makeResult(fingerprint: string): BasePromptTraceResult {
  return {
    fingerprint,
    generatedAt: new Date().toISOString(),
    baseTokens: 100,
    buckets: [],
    evidence: [],
    errors: [],
  };
}

describe("traceCache", () => {
  it("returns undefined for unknown fingerprint", () => {
    const cache = new TraceCache();
    expect(cache.get("unknown")).toBeUndefined();
  });

  it("stores and retrieves a result by fingerprint", () => {
    const cache = new TraceCache();
    const result = makeResult("fp-1");

    cache.set(result);
    expect(cache.get("fp-1")).toBe(result);
  });

  it("returns undefined when fingerprint changes (stale)", () => {
    const cache = new TraceCache();
    cache.set(makeResult("fp-1"));

    expect(cache.get("fp-2")).toBeUndefined();
  });

  it("overwrites previous result on set", () => {
    const cache = new TraceCache();
    cache.set(makeResult("fp-1"));

    const newer = makeResult("fp-1");
    cache.set(newer);

    expect(cache.get("fp-1")).toBe(newer);
  });

  it("clears the cache", () => {
    const cache = new TraceCache();
    cache.set(makeResult("fp-1"));
    cache.clear();

    expect(cache.get("fp-1")).toBeUndefined();
  });
});
