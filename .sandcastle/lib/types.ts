import type { IssueRoute } from './enums.js';

/** Result returned by a GitHub CLI adapter invocation. */
export interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** Adapter seam for invoking GitHub CLI commands. */
export type GitHubExecutor = (args: readonly string[]) => Promise<CommandResult>;

/** Issue context needed after discovery and routing. */
export interface IssueContext {
  readonly body: string;
  readonly createdAt: string;
  readonly labels: string[];
  readonly number: number;
  readonly title: string;
}

/** One cited fact in a research artifact. */
export interface ResearchEvidence {
  readonly claim: string;
  readonly source: string;
}

/** Machine-readable outcome from the research route. */
export interface ResearchResult {
  readonly artifactPath: string;
  readonly automationGaps: string[];
  readonly axis: 'research';
  readonly decisions: string[];
  readonly evidence: ResearchEvidence[];
  readonly openQuestions: string[];
  readonly summary: string;
}

/** One actionable reviewer finding. */
export interface ReviewFinding {
  readonly file: string;
  readonly issue: string;
  readonly line: number;
  readonly requiredFix: string;
  readonly severity: string;
}

/** Machine-readable result from one review axis. */
export interface ReviewResult {
  readonly axis: 'spec' | 'standards';
  readonly blocking: boolean;
  readonly findings: ReviewFinding[];
  readonly verdict: 'fail' | 'pass';
}

/** Captured result for one runner-owned validation command. */
export interface ValidationCommandResult {
  readonly output: string;
  readonly passed: boolean;
}

/** Runner-owned implementation validation outcome. */
export interface ValidationResult {
  readonly check: ValidationCommandResult;
  readonly testE2E: ValidationCommandResult;
}

/** An eligible issue paired with its execution route. */
export interface RoutedIssue {
  readonly issue: IssueContext;
  readonly route: IssueRoute;
}
