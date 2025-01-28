import core from "@actions/core";

import { readFile } from "fs/promises";
import { Octokit } from "octokit";
import { env } from "bun";

const sourceRepo = {
  owner: "MarlinFirmware",
  repo: "Marlin",
};

const currentRepo = env.GITHUB_REPOSITORY!
  .split("/")
  .reduce((acc, _v, _i, array) => acc = { owner: array[0], repo: array[1] }, { owner: "", repo: "" });

export async function getLatestStable(client: Octokit): Promise<string> {
  const res = await client.rest.repos.getLatestRelease(sourceRepo);

  core.debug("Getting latest stable Marlin release");

  if (isMarlin2(res.data.tag_name)) {
    return res.data.tag_name;
  }

  throw new Error("No valid stable release tag found");
}

function isMarlin2(version: string) {
  try {
    return parseInt(version.split("")[0]) >= 2;
  } catch (_e) {
    return false;
  }
}

export async function getLatestNightly(client: Octokit): Promise<string> {
  const res = await client.rest.repos.getBranch({
    ...sourceRepo,
    branch: "bugfix-2.1.x",
  });

  core.debug("Getting latest bugfix-2.1.x commit");

  return res.data.commit.sha;
}

export async function createRelease(
  client: Octokit,
  version: string,
  kind: "stable" | "nightly",
  currentDateTime: string,
): Promise<number> {
  try {
    const release = await client.rest.repos.getReleaseByTag({
      ...currentRepo,
      tag: `${kind}-${version}`,
    });

    if (release.data && release.data.id) {
      return release.data.id;
    }
  } catch (_) {}

  const res = await client.rest.repos.createRelease({
    ...currentRepo,
    tag_name: `${kind}-${version}`,
    name:
      kind === "stable" ? `${kind}-${version}` : `${kind}-${currentDateTime}`,
    body: `https://github.com/${sourceRepo.owner}/${sourceRepo.repo}/${kind === "stable" ? `releases/tag/${version}` : `tree/${version}`}`,
    prerelease: kind !== "stable",
  });

  if (res.data && res.data.id) {
    return res.data.id;
  }

  throw new Error("Could not create github release");
}

export async function uploadAsset(
  client: Octokit,
  releaseId: number,
  asset: {
    filename: string;
    buildPath: string;
    action: "update" | "create";
    assetId?: number;
  },
): Promise<number> {
  const file = await readFile(asset.buildPath);

  if (asset.action === "update") {
    console.assert(asset.assetId !== undefined);

    await client.rest.repos.deleteReleaseAsset({
      ...currentRepo,
      asset_id: asset.assetId,
    });
  }

  const res = await client.rest.repos.uploadReleaseAsset({
    ...currentRepo,
    release_id: releaseId,
    name: asset.filename,
    // @ts-expect-error file is a Buffer, that's fine
    data: file,
  });

  if (res.data && res.data.id) {
    return res.data.id;
  }

  throw new Error("Could not upload github asset");
}
