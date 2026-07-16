import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  INTERNAL_EXTENSION_VERSION,
  extensionIdFromManifestKey,
  relativeFiles,
  sha256File,
  validateManifest
} from "./lib/extension-release.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");
const extensionDist = join(workspaceRoot, "apps", "extension", "dist");
const artifactDir = join(workspaceRoot, "artifacts", "extension");
const artifactBase =
  `chidianma-extension-${INTERNAL_EXTENSION_VERSION}-internal`;
const zipPath = join(artifactDir, `${artifactBase}.zip`);
const shaPath = join(artifactDir, `${artifactBase}.sha256`);
const metadataPath = join(artifactDir, `${artifactBase}.release.json`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command}_failed:${result.status ?? "unknown"}`);
  }
  return result.stdout?.trim() ?? "";
}

function assertCleanCommittedWorktree() {
  const status = run(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { capture: true }
  );
  if (status) throw new Error("extension_package_requires_clean_worktree");
  const commit = run("git", ["rev-parse", "HEAD"], { capture: true });
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("extension_package_commit_invalid");
  }
  return commit;
}

const commit = assertCleanCommittedWorktree();
run("pnpm", ["--filter", "@lunch/shared", "build"]);
run("pnpm", ["--filter", "@lunch/extension", "build:internal"]);
assertCleanCommittedWorktree();

const manifest = JSON.parse(
  readFileSync(join(extensionDist, "manifest.json"), "utf8")
);
validateManifest(manifest, "internal");
const files = relativeFiles(extensionDist);
if (files[0] === undefined || !files.includes("manifest.json")) {
  throw new Error("extension_package_manifest_missing");
}

mkdirSync(artifactDir, { recursive: true });
for (const path of [zipPath, shaPath, metadataPath]) {
  rmSync(path, { force: true });
}
run("zip", ["-X", "-q", zipPath, ...files], { cwd: extensionDist });

const sha256 = sha256File(zipPath);
const artifactFile = `${artifactBase}.zip`;
writeFileSync(shaPath, `${sha256}  ${artifactFile}\n`);
writeFileSync(metadataPath, `${JSON.stringify({
  schema: "extension-internal-release/1.0",
  schemaVersion: "1.0",
  product: "chidianma-extension",
  version: manifest.version,
  commit,
  extensionId: extensionIdFromManifestKey(manifest.key),
  buildProfile: "internal",
  name: manifest.name,
  permissions: manifest.permissions,
  hostPermissions: manifest.host_permissions,
  fileCount: files.length,
  artifact: {
    file: artifactFile,
    sha256
  },
  builtAt: new Date().toISOString()
}, null, 2)}\n`);

run("node", ["scripts/check-stage7c-release.mjs"], {
  env: {
    ...process.env,
    STAGE7C_SKIP_BUILDS: "1",
    STAGE7C_REQUIRE_ARTIFACTS: "1"
  }
});

console.log(JSON.stringify({
  ok: true,
  commit,
  extensionId: extensionIdFromManifestKey(manifest.key),
  files: files.length,
  zip: zipPath,
  sha256
}));
