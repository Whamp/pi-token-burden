import { isRecord } from '../utils.js';
import type { ExtensionToolContribution } from './types.js';

interface LoadedExtensionLike {
  path: string;
  tools: ReadonlyMap<string, { definition: unknown }>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

/**
 * Extract tool contributions from loaded extension objects.
 *
 * Each tool's promptSnippet and promptGuidelines are collected along
 * with the extension path that registered them.
 */
export function extractContributions(
  extensions: LoadedExtensionLike[],
): ExtensionToolContribution[] {
  const contributions: ExtensionToolContribution[] = [];

  for (const ext of extensions) {
    for (const [toolName, registered] of ext.tools) {
      const definition = isRecord(registered.definition) ? registered.definition : {};
      const snippet =
        typeof definition.promptSnippet === 'string' ? definition.promptSnippet : undefined;
      contributions.push({
        toolName,
        ...(snippet === undefined ? {} : { snippet }),
        guidelines: stringArray(definition.promptGuidelines),
        extensionPath: ext.path,
      });
    }
  }

  return contributions;
}
