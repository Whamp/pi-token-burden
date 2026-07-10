import type { BasePromptTraceResult, TraceBucket, TraceLineEvidence } from './base-trace/index.js';

/** Present Source Trace buckets, labels, and line evidence to the overlay. */
export class SourceTraceReport {
  readonly result: BasePromptTraceResult;

  constructor(result: BasePromptTraceResult) {
    this.result = result;
  }

  get buckets(): TraceBucket[] {
    return this.result.buckets;
  }

  get errors(): BasePromptTraceResult['errors'] {
    return this.result.errors;
  }

  bucketLabel(bucket: TraceBucket): string {
    if (bucket.id === 'built-in') {
      return 'Built-in/core';
    }
    if (bucket.id === 'shared') {
      return 'Shared (multi-extension)';
    }
    if (bucket.id === 'unattributed') {
      return 'Unattributed';
    }

    const parts = bucket.id.split('/');
    const extensionName = parts.findLast(
      (part) => part !== 'index.ts' && part !== 'index.js' && part !== 'src',
    );
    return extensionName ?? bucket.id;
  }

  bucketLabels(): string[] {
    return this.buckets.map((bucket) => this.bucketLabel(bucket));
  }

  evidenceForBucket(bucket: TraceBucket): TraceLineEvidence[] {
    return this.result.evidence.filter((evidence) => {
      if (bucket.id === 'built-in') {
        return evidence.bucket === 'built-in';
      }
      if (bucket.id === 'shared') {
        return evidence.bucket === 'shared';
      }
      if (bucket.id === 'unattributed') {
        return evidence.bucket === 'unattributed';
      }
      return evidence.bucket === 'extension' && evidence.contributors.includes(bucket.id);
    });
  }
}
