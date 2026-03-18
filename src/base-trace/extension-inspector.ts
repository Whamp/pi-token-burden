import type { ExtensionToolContribution, LoadedExtension } from "./types.js";

/**
 * Extract tool contributions from loaded extension objects.
 *
 * Each tool's promptSnippet and promptGuidelines are collected along
 * with the extension path that registered them.
 */
export function extractContributions(
  extensions: LoadedExtension[]
): ExtensionToolContribution[] {
  const contributions: ExtensionToolContribution[] = [];

  for (const ext of extensions) {
    for (const [toolName, registered] of ext.tools) {
      contributions.push({
        toolName,
        snippet: registered.definition.promptSnippet,
        guidelines: registered.definition.promptGuidelines ?? [],
        extensionPath: ext.path,
      });
    }
  }

  return contributions;
}
