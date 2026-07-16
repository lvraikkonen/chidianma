import {
  existsSync,
  readFileSync,
  statSync
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import {
  DEV_EXTENSION_NAME,
  INTERNAL_EXTENSION_NAME,
  INTERNAL_EXTENSION_VERSION,
  PRODUCTION_API_ORIGIN,
  assertRelease,
  extensionIdFromManifestKey,
  relativeFiles,
  sha256File,
  validateManifest,
  validateReleaseMetadata
} from "./lib/extension-release.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");
const extensionRoot = join(workspaceRoot, "apps", "extension");
const extensionDist = join(extensionRoot, "dist");
const artifactDir = join(workspaceRoot, "artifacts", "extension");
const artifactBase =
  `chidianma-extension-${INTERNAL_EXTENSION_VERSION}-internal`;
const zipPath = join(artifactDir, `${artifactBase}.zip`);
const shaPath = join(artifactDir, `${artifactBase}.sha256`);
const metadataPath = join(artifactDir, `${artifactBase}.release.json`);
const releaseSchemaPath = join(
  workspaceRoot,
  "schemas",
  "extension-internal-release.schema.json"
);
const skipBuilds = process.env.STAGE7C_SKIP_BUILDS === "1";
const requireArtifacts = process.env.STAGE7C_REQUIRE_ARTIFACTS !== "0";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? workspaceRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.capture ? "pipe" : "inherit"
  });
  assertRelease(
    result.status === 0,
    `${command}_failed:${result.status ?? "unknown"}`
  );
  return result.stdout?.trim() ?? "";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readDistText() {
  return relativeFiles(extensionDist)
    .filter((path) => /\.(?:css|html|js|json|map|svg)$/.test(path))
    .map((path) => readFileSync(join(extensionDist, path), "utf8"))
    .join("\n");
}

function validateBuildProfile(profile) {
  const manifest = readJson(join(extensionDist, "manifest.json"));
  const metadata = readJson(join(extensionDist, "build-profile.json"));
  validateManifest(manifest, profile);
  assertRelease(metadata.schemaVersion === "1.0", "build_profile_schema_invalid");
  assertRelease(metadata.profile === profile, "build_profile_name_invalid");
  assertRelease(metadata.version === manifest.version, "build_profile_version_mismatch");
  assertRelease(metadata.name === manifest.name, "build_profile_manifest_mismatch");
  assertRelease(
    metadata.productionOrigin === PRODUCTION_API_ORIGIN,
    "build_profile_production_origin_invalid"
  );
  assertRelease(
    metadata.advancedApiEditing === (profile === "dev"),
    "build_profile_advanced_setting_invalid"
  );
  assertRelease(
    metadata.defaultApiBaseUrl === (
      profile === "dev" ? "http://localhost:3000" : PRODUCTION_API_ORIGIN
    ),
    "build_profile_default_api_invalid"
  );
  const text = readDistText();
  assertRelease(
    text.includes("advanced-connection-settings"),
    "advanced_connection_markup_missing"
  );
  if (profile === "internal") {
    const optionsHtml = readFileSync(join(extensionDist, "options.html"), "utf8");
    assertRelease(
      /id="advanced-connection-settings"[^>]*hidden/.test(optionsHtml),
      "internal_advanced_settings_not_hidden"
    );
    assertRelease(!text.includes("http://localhost:3000"), "internal_contains_localhost");
    assertRelease(!text.includes("https://*.up.railway.app"), "internal_contains_wildcard");
  }
  return manifest;
}

async function validateIcons() {
  const expectedSizes = [16, 32, 48, 128];
  const manifest = readJson(join(extensionDist, "manifest.json"));
  for (const size of expectedSizes) {
    const iconPath = join(extensionDist, `icon-${size}.png`);
    assertRelease(existsSync(iconPath), `icon_missing:${size}`);
    const { data, info } = await sharp(iconPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assertRelease(info.width === size && info.height === size, `icon_size_invalid:${size}`);
    assertRelease(info.channels === 4, `icon_alpha_missing:${size}`);
    let minX = size;
    let minY = size;
    let maxX = -1;
    let maxY = -1;
    let accentPixels = 0;
    let paperPixels = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const alpha = data[offset + 3];
        if (alpha > 16) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        if (alpha > 220 && red > 210 && green > 70 && green < 150 && blue < 100) {
          accentPixels += 1;
        }
        if (alpha > 180 && red > 235 && green > 220 && blue > 195) {
          paperPixels += 1;
        }
      }
    }
    const minimumMargin = Math.max(1, Math.floor(size * 0.125));
    assertRelease(
      minX >= minimumMargin
        && minY >= minimumMargin
        && maxX <= size - 1 - minimumMargin
        && maxY <= size - 1 - minimumMargin,
      `icon_safe_margin_invalid:${size}`
    );
    assertRelease(accentPixels > 0 && paperPixels > 0, `icon_brand_pixels_invalid:${size}`);
    assertRelease(
      manifest.icons[String(size)] === `icon-${size}.png`
        && manifest.action.default_icon[String(size)] === `icon-${size}.png`,
      `icon_manifest_reference_invalid:${size}`
    );
  }
}

function validateBrandMarkup() {
  const canonical = readFileSync(
    join(workspaceRoot, "assets", "brand", "brand-mark.svg"),
    "utf8"
  );
  assertRelease(
    readFileSync(join(extensionRoot, "public", "brand-mark.svg"), "utf8") === canonical,
    "extension_brand_copy_mismatch"
  );
  assertRelease(
    readFileSync(
      join(workspaceRoot, "apps", "admin", "public", "brand-mark.svg"),
      "utf8"
    ) === canonical,
    "admin_brand_copy_mismatch"
  );
  const uiFiles = [
    "apps/extension/index.html",
    "apps/extension/options.html",
    "apps/extension/detail.html",
    "apps/admin/src/components/BrandLockup.tsx",
    "apps/admin/src/components/Modal.tsx",
    "apps/admin/src/pages/SettingsPage.tsx"
  ].map((path) => readFileSync(join(workspaceRoot, path), "utf8")).join("\n");
  assertRelease(
    (uiFiles.match(/brand-mark\.svg/g) ?? []).length >= 4,
    "brand_markup_usage_missing"
  );
  for (const forbidden of ["♨", "⚙", "Stage 5C", "提醒 override", "插件设置"]) {
    assertRelease(!uiFiles.includes(forbidden), `forbidden_brand_markup:${forbidden}`);
  }
  assertRelease(!/>\s*餐\s*</.test(uiFiles), "standalone_meal_glyph_forbidden");
  assertRelease(!uiFiles.includes(">×<"), "character_close_icon_forbidden");
  assertRelease(
    readFileSync(
      join(workspaceRoot, "apps", "extension", "src", "background.ts"),
      "utf8"
    ).includes('chrome.runtime.getURL("icon-128.png")'),
    "notification_brand_icon_missing"
  );
  const popupHtml = readFileSync(join(extensionRoot, "index.html"), "utf8");
  const detailHtml = readFileSync(join(extensionRoot, "detail.html"), "utf8");
  const optionsHtml = readFileSync(join(extensionRoot, "options.html"), "utf8");
  assertRelease((popupHtml.match(/<h1\b/g) ?? []).length === 1, "popup_h1_count_invalid");
  assertRelease((detailHtml.match(/<h1\b/g) ?? []).length === 1, "detail_h1_count_invalid");
  assertRelease((optionsHtml.match(/<h1\b/g) ?? []).length === 1, "options_h1_count_invalid");
}

function validateBuildScripts() {
  const packageJson = readJson(join(extensionRoot, "package.json"));
  assertRelease(
    packageJson.version === INTERNAL_EXTENSION_VERSION,
    "extension_package_version_invalid"
  );
  assertRelease(
    packageJson.scripts?.build === "pnpm run build:internal",
    "extension_default_build_not_internal"
  );
  assertRelease(
    packageJson.scripts?.["build:dev"]?.includes("LUNCH_EXTENSION_PROFILE=dev"),
    "extension_dev_build_missing"
  );
}

function validateInternalRuntimeText() {
  const text = readDistText().toLowerCase();
  for (const forbidden of [
    "x-lunch-read-token",
    "extension_read_token",
    "dev-read-token",
    "/api/session",
    "https://*.up.railway.app",
    "http://localhost:3000",
    "fonts.googleapis.com",
    "@font-face"
  ]) {
    assertRelease(!text.includes(forbidden), `internal_runtime_residue:${forbidden}`);
  }
}

function validateArtifacts(manifest) {
  const schema = readJson(releaseSchemaPath);
  assertRelease(
    schema.properties?.schema?.const === "extension-internal-release/1.0",
    "release_schema_contract_invalid"
  );
  const allPresent = [zipPath, shaPath, metadataPath].every(existsSync);
  if (!allPresent) {
    assertRelease(!requireArtifacts, "stage7c_release_artifacts_missing");
    return { status: "not-required" };
  }
  const sha256 = sha256File(zipPath);
  const shaRecord = readFileSync(shaPath, "utf8").trim();
  assertRelease(
    shaRecord === `${sha256}  ${basename(zipPath)}`,
    "release_sha_file_invalid"
  );
  const zipEntries = run("unzip", ["-Z1", zipPath], { capture: true })
    .split("\n")
    .filter(Boolean);
  assertRelease(zipEntries.includes("manifest.json"), "zip_root_manifest_missing");
  assertRelease(
    !zipEntries.some((entry) => entry.split("/").length > 1
      && entry.endsWith("/manifest.json")),
    "zip_nested_manifest_detected"
  );
  assertRelease(!zipEntries.some((entry) => entry.startsWith("/")), "zip_absolute_path_detected");
  const commit = run("git", ["rev-parse", "HEAD"], { capture: true });
  const metadata = readJson(metadataPath);
  validateReleaseMetadata(metadata, manifest, {
    commit,
    fileCount: zipEntries.filter((entry) => !entry.endsWith("/")).length,
    artifactFile: basename(zipPath),
    sha256
  });
  return { status: "validated", sha256 };
}

if (!skipBuilds) {
  run("pnpm", ["--filter", "@lunch/extension", "build:dev"]);
  const devManifest = validateBuildProfile("dev");
  assertRelease(devManifest.name === DEV_EXTENSION_NAME, "dev_profile_not_built");
  run("pnpm", ["--filter", "@lunch/extension", "build:internal"]);
}

const internalManifest = validateBuildProfile("internal");
assertRelease(internalManifest.name === INTERNAL_EXTENSION_NAME, "internal_profile_not_built");
await validateIcons();
validateBrandMarkup();
validateBuildScripts();
validateInternalRuntimeText();
const artifacts = validateArtifacts(internalManifest);
const files = relativeFiles(extensionDist);
assertRelease(files.includes("manifest.json"), "internal_manifest_missing");
assertRelease(files.includes("build-profile.json"), "internal_build_profile_missing");
assertRelease(statSync(join(extensionDist, "assets", "background.js")).isFile(), "background_missing");

console.log(JSON.stringify({
  ok: true,
  version: internalManifest.version,
  extensionId: extensionIdFromManifestKey(internalManifest.key),
  permissions: internalManifest.permissions,
  hostPermissions: internalManifest.host_permissions,
  files: files.length,
  artifacts
}));
