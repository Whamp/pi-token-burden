/** Extracted tool and guideline bullet lines from Base prompt text. */
export interface BaseLines {
  toolLines: string[];
  guidelineLines: string[];
}

/** A single line from the Base prompt with attribution metadata. */
export interface TraceLineEvidence {
  /** The raw line text from the Base prompt. */
  line: string;
  /** Token count for this line. */
  tokens: number;
  /** Whether this is a tool bullet or a guideline bullet. */
  kind: "tool-line" | "guideline-line";
  /** Extension paths that contributed this line, or ["built-in"]. */
  contributors: string[];
  /** Which bucket this line falls into. */
  bucket: "extension" | "shared" | "built-in" | "unattributed";
}

/** Aggregated token burden for one source bucket. */
export interface TraceBucket {
  /** Extension path, "built-in", "shared", or "unattributed". */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Total tokens in this bucket. */
  tokens: number;
  /** Number of evidence lines in this bucket. */
  lineCount: number;
  /** Percentage of Base prompt tokens. */
  pctOfBase: number;
}

/** Full result of a Base prompt trace. */
export interface BasePromptTraceResult {
  /** Cache fingerprint. */
  fingerprint: string;
  /** When the trace was generated. */
  generatedAt: string;
  /** Total Base prompt tokens (the denominator). */
  baseTokens: number;
  /** Aggregated buckets. */
  buckets: TraceBucket[];
  /** Per-line evidence. */
  evidence: TraceLineEvidence[];
  /** Errors encountered during tracing. */
  errors: TraceError[];
}

/** An error encountered while inspecting an extension. */
export interface TraceError {
  source: string;
  message: string;
}

/** A tool contribution extracted from a loaded extension. */
export interface ExtensionToolContribution {
  /** Tool name. */
  toolName: string;
  /** One-line snippet (promptSnippet). */
  snippet?: string;
  /** Guideline strings (promptGuidelines). */
  guidelines: string[];
  /** Path of the extension that registered this tool. */
  extensionPath: string;
}

/**
 * Minimal shape of a loaded Extension object from pi's extension loader.
 * Used for extracting tool contributions without requiring exact type matching.
 */
export interface LoadedExtension {
  path: string;
  tools: Map<
    string,
    {
      definition: { promptSnippet?: string; promptGuidelines?: string[] };
      extensionPath: string;
    }
  >;
}
