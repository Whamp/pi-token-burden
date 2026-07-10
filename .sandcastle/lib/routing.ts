import { EXCLUSION_LABELS, IMPLEMENTATION_LABELS } from './constants.js';
import { IssueRoute } from './enums.js';
import { decodeValue, GITHUB_ISSUE_SCHEMA } from './schema.js';
import type { IssueContext, RoutedIssue } from './types.js';

function readIssue(value: unknown):
  | {
      readonly assigneeLogins: string[];
      readonly context: IssueContext;
      readonly labels: string[];
      readonly state: string;
    }
  | undefined {
  const issue = decodeValue(GITHUB_ISSUE_SCHEMA, value);
  if (issue === undefined) {
    return undefined;
  }
  const labels = issue.labels.map(({ name }) => name);
  return {
    assigneeLogins: issue.assignees.map(({ login }) => login),
    context: {
      body: issue.body,
      createdAt: issue.createdAt,
      labels,
      number: issue.number,
      title: issue.title,
    },
    labels,
    state: issue.state,
  };
}

function routeFor(labels: readonly string[]): IssueRoute | undefined {
  if (labels.includes('wayfinder:research')) {
    return IssueRoute.Research;
  }
  if (labels.some((label) => IMPLEMENTATION_LABELS.has(label))) {
    return IssueRoute.Implementation;
  }
  return undefined;
}

/** Check a fresh issue snapshot against route and exact-assignee expectations. */
export function isIssueClaimable(
  payload: unknown,
  expectedRoute: IssueRoute,
  expectedAssignees: readonly string[],
): boolean {
  const issue = readIssue(payload);
  if (
    issue === undefined ||
    issue.state !== 'OPEN' ||
    !issue.labels.includes('ready-for-agent') ||
    issue.labels.some((label) => EXCLUSION_LABELS.has(label)) ||
    routeFor(issue.labels) !== expectedRoute
  ) {
    return false;
  }

  const actualAssignees = issue.assigneeLogins.toSorted();
  const requiredAssignees = [...expectedAssignees].toSorted();
  return (
    actualAssignees.length === requiredAssignees.length &&
    actualAssignees.every((login, index) => login === requiredAssignees[index])
  );
}

/** Select the first issue that is eligible for an AFK execution route. */
export function selectNextEligibleIssue(payload: unknown): RoutedIssue | undefined {
  if (!Array.isArray(payload)) {
    return undefined;
  }

  const candidates: RoutedIssue[] = [];
  for (const value of payload) {
    const issue = readIssue(value);
    if (
      issue === undefined ||
      issue.state !== 'OPEN' ||
      issue.assigneeLogins.length !== 0 ||
      !issue.labels.includes('ready-for-agent') ||
      issue.labels.some((label) => EXCLUSION_LABELS.has(label))
    ) {
      continue;
    }

    const route = routeFor(issue.labels);
    if (route !== undefined) {
      candidates.push({ issue: issue.context, route });
    }
  }

  return candidates.toSorted((left, right) => {
    const createdAtOrder = left.issue.createdAt.localeCompare(right.issue.createdAt);
    return createdAtOrder === 0 ? left.issue.number - right.issue.number : createdAtOrder;
  })[0];
}
