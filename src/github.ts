import core from "@actions/core";

import { readFile } from "fs/promises";
import { Octokit } from "octokit";

const repo = {
  owner: "MarlinFirmware",
  repo: "Marlin",
};

export async function getLatestStable(client: Octokit): Promise<string> {
  const res = await client.rest.repos.getLatestRelease(repo);

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
    ...repo,
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
      ...repo,
      tag: `${kind}-${version}`,
    });

    if (release.data && release.data.id) {
      return release.data.id;
    }
  } catch (_) {}

  const res = await client.rest.repos.createRelease({
    ...repo,
    tag_name: `${kind}-${version}`,
    name:
      kind === "stable" ? `${kind}-${version}` : `${kind}-${currentDateTime}`,
    body: `https://github.com/${repo.owner}/${repo.repo}/${kind === "stable" ? `releases/tag/${version}` : `tree/${version}`}`,
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
      ...repo,
      asset_id: asset.assetId,
    });
  }

  const res = await client.rest.repos.uploadReleaseAsset({
    ...repo,
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
