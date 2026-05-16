import type {
  BasePromptTraceResult,
  TraceBucket,
  TraceLineEvidence,
} from "./base-trace/index.js";
import { SourceTraceReport } from "./source-trace-report.js";

function bucket(id: string): TraceBucket {
  return {
    id,
    label: id,
    tokens: 10,
    lineCount: 1,
    pctOfBase: 25,
  };
}

function evidence(
  bucketName: TraceLineEvidence["bucket"],
  contributors: string[] = []
): TraceLineEvidence {
  return {
    line: `- ${bucketName}`,
    tokens: 5,
    kind: "tool-line",
    contributors,
    bucket: bucketName,
  };
}

function result(): BasePromptTraceResult {
  return {
    fingerprint: "trace-a",
    generatedAt: "2026-01-01T00:00:00.000Z",
    baseTokens: 100,
    buckets: [
      bucket("built-in"),
      bucket("shared"),
      bucket("unattributed"),
      bucket("/repo/extensions/example/src/index.ts"),
    ],
    evidence: [
      evidence("built-in", ["built-in"]),
      evidence("shared", ["/a", "/b"]),
      evidence("unattributed"),
      evidence("extension", ["/repo/extensions/example/src/index.ts"]),
      evidence("extension", ["/other/extensions/unselected/index.ts"]),
    ],
    errors: [],
  };
}

describe("source trace report", () => {
  it("formats bucket labels for built-in, shared, unattributed, and extension buckets", () => {
    const report = new SourceTraceReport(result());

    expect(report.bucketLabels()).toStrictEqual([
      "Built-in/core",
      "Shared (multi-extension)",
      "Unattributed",
      "example",
    ]);
  });

  it("returns evidence for a selected bucket", () => {
    const report = new SourceTraceReport(result());

    const counts = report.buckets.map((traceBucket) =>
      report.evidenceForBucket(traceBucket).map((item) => item.line)
    );

    expect(counts).toStrictEqual([
      ["- built-in"],
      ["- shared"],
      ["- unattributed"],
      ["- extension"],
    ]);
  });
});
