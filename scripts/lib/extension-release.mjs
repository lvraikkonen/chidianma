import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { join, relative } from "node:path";

export const INTERNAL_EXTENSION_NAME = "中午吃点啥（内部测试）";
export const DEV_EXTENSION_NAME = "中午吃点啥（开发版）";
export const INTERNAL_EXTENSION_VERSION = "0.3.0";
export const PRODUCTION_API_ORIGIN =
  "https://lunchserver-production.up.railway.app";
export const MINIMAL_EXTENSION_PERMISSIONS = [
  "alarms",
  "notifications",
  "storage"
];

export function assertRelease(condition, code) {
  if (!condition) throw new Error(code);
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function extensionIdFromManifestKey(key) {
  const publicKey = Buffer.from(key.replace(/\s+/g, ""), "base64");
  assertRelease(publicKey.length > 0, "extension_public_key_invalid");
  const digest = createHash("sha256").update(publicKey).digest();
  return [...digest.subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
    .join("");
}

export function walkFiles(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

export function relativeFiles(root) {
  return walkFiles(root)
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .sort();
}

export function validateManifest(manifest, profile) {
  assertRelease(manifest.manifest_version === 3, "manifest_version_invalid");
  assertRelease(
    manifest.version === INTERNAL_EXTENSION_VERSION,
    "extension_version_invalid"
  );
  assertRelease(
    JSON.stringify(manifest.permissions) ===
      JSON.stringify(MINIMAL_EXTENSION_PERMISSIONS),
    "extension_permissions_invalid"
  );
  assertRelease(
    manifest.background?.service_worker === "assets/background.js",
    "extension_background_invalid"
  );
  assertRelease(
    manifest.description ===
      "为小团队提供 2–3 个有理由的午饭选择和适度提醒。",
    "extension_description_invalid"
  );
  assertRelease(
    !manifest.host_permissions.includes("<all_urls>"),
    "extension_all_urls_forbidden"
  );

  if (profile === "internal") {
    assertRelease(
      manifest.name === INTERNAL_EXTENSION_NAME,
      "internal_extension_name_invalid"
    );
    assertRelease(
      typeof manifest.key === "string" && manifest.key.length > 0,
      "internal_extension_key_missing"
    );
    assertRelease(
      JSON.stringify(manifest.host_permissions) ===
        JSON.stringify([`${PRODUCTION_API_ORIGIN}/*`]),
      "internal_host_permissions_invalid"
    );
  } else {
    assertRelease(
      manifest.name === DEV_EXTENSION_NAME,
      "dev_extension_name_invalid"
    );
    assertRelease(manifest.key === undefined, "dev_extension_key_forbidden");
    assertRelease(
      JSON.stringify(manifest.host_permissions) === JSON.stringify([
        "http://localhost:3000/*",
        `${PRODUCTION_API_ORIGIN}/*`
      ]),
      "dev_host_permissions_invalid"
    );
  }
}

export function validateReleaseMetadata(metadata, manifest, expected) {
  assertRelease(
    metadata.schema === "extension-internal-release/1.0",
    "release_schema_invalid"
  );
  assertRelease(metadata.schemaVersion === "1.0", "release_schema_version_invalid");
  assertRelease(metadata.product === "chidianma-extension", "release_product_invalid");
  assertRelease(metadata.version === manifest.version, "release_version_mismatch");
  assertRelease(metadata.commit === expected.commit, "release_commit_mismatch");
  assertRelease(
    metadata.extensionId === extensionIdFromManifestKey(manifest.key),
    "release_extension_id_mismatch"
  );
  assertRelease(metadata.buildProfile === "internal", "release_profile_invalid");
  assertRelease(metadata.name === manifest.name, "release_name_mismatch");
  assertRelease(
    JSON.stringify(metadata.permissions) === JSON.stringify(manifest.permissions),
    "release_permissions_mismatch"
  );
  assertRelease(
    JSON.stringify(metadata.hostPermissions) ===
      JSON.stringify(manifest.host_permissions),
    "release_hosts_mismatch"
  );
  assertRelease(metadata.fileCount === expected.fileCount, "release_file_count_mismatch");
  assertRelease(
    metadata.artifact?.file === expected.artifactFile,
    "release_artifact_name_mismatch"
  );
  assertRelease(
    metadata.artifact?.sha256 === expected.sha256,
    "release_sha256_mismatch"
  );
  assertRelease(
    typeof metadata.builtAt === "string"
      && Number.isFinite(Date.parse(metadata.builtAt)),
    "release_build_time_invalid"
  );
}
