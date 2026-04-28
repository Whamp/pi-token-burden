import { readFile } from "node:fs/promises";

const README_IMAGE_REFERENCE =
  /<img[^>]+src="(?<htmlSrc>[^"]+)"|!\[[^\]]*]\((?<markdownSrc>[^)\s]+)(?:\s+"[^"]*")?\)/gi;
const ABSOLUTE_IMAGE_URL = /^https:\/\//;

function extractReadmeImageReferences(readme: string): string[] {
  return Array.from(
    readme.matchAll(README_IMAGE_REFERENCE),
    (match) => match.groups?.htmlSrc ?? match.groups?.markdownSrc
  ).filter((path): path is string => path !== undefined);
}

function findNonAbsoluteImageReferences(imageReferences: string[]): string[] {
  return imageReferences.filter((path) => !ABSOLUTE_IMAGE_URL.test(path));
}

describe("readme images", () => {
  it("uses absolute image URLs so npm can render them", async () => {
    const readme = await readFile("README.md", "utf8");
    const imageReferences = extractReadmeImageReferences(readme);

    expect(imageReferences).not.toHaveLength(0);
    expect(findNonAbsoluteImageReferences(imageReferences)).toStrictEqual([]);
  });
});
