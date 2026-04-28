import { readFile } from "node:fs/promises";

const LOCAL_IMAGE_REFERENCE =
  /(?:src=|]\()"?\.\/(?<path>[^")]+\.(?:png|jpg|jpeg|gif|webp|svg))/gi;

interface PackageManifest {
  files: string[];
}

async function readPackageManifest(): Promise<PackageManifest> {
  return JSON.parse(await readFile("package.json", "utf8")) as PackageManifest;
}

describe("package manifest", () => {
  it("publishes local images referenced by the README", async () => {
    const readme = await readFile("README.md", "utf8");
    const packageManifest = await readPackageManifest();
    const referencedImages = Array.from(
      readme.matchAll(LOCAL_IMAGE_REFERENCE),
      (match) => match.groups?.path
    ).filter((path): path is string => path !== undefined);

    expect(referencedImages).not.toHaveLength(0);
    expect(packageManifest.files).toStrictEqual(
      expect.arrayContaining(referencedImages)
    );
  });
});
