import type { BasePromptTraceResult } from "./types.js";

/**
 * In-memory cache for trace results, keyed by extension fingerprint.
 * Simple single-entry cache — only the most recent result is kept.
 */
export class TraceCache {
  private cached: BasePromptTraceResult | undefined;

  get(fingerprint: string): BasePromptTraceResult | undefined {
    if (this.cached && this.cached.fingerprint === fingerprint) {
      return this.cached;
    }
    return undefined;
  }

  set(result: BasePromptTraceResult): void {
    this.cached = result;
  }

  clear(): void {
    this.cached = undefined;
  }
}
