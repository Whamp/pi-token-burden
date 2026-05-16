import type { BasePromptTraceResult } from "./base-trace/index.js";
import { SourceTraceReport } from "./source-trace-report.js";

export class SourceTraceReportCache {
  private cached: SourceTraceReport | undefined;

  async getOrLoad(
    load: () => Promise<BasePromptTraceResult>,
    options?: { refresh?: boolean }
  ): Promise<SourceTraceReport> {
    if (this.cached && !options?.refresh) {
      return this.cached;
    }

    this.cached = new SourceTraceReport(await load());
    return this.cached;
  }

  clear(): void {
    this.cached = undefined;
  }
}
