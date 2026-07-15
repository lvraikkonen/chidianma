import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const adminDist = join(workspaceRoot, "apps", "admin", "dist");
const extensionDist = join(workspaceRoot, "apps", "extension", "dist");
const extensionSourceManifest = join(workspaceRoot, "apps", "extension", "public", "manifest.json");
const serverDist = join(workspaceRoot, "apps", "server", "dist");

function assert(condition, code) {
  if (!condition) {
    throw new Error(code);
  }
}

function walkFiles(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

const adminFiles = walkFiles(adminDist);
assert(adminFiles.some((path) => basename(path) === "index.html"), "admin_index_missing");
assert(
  adminFiles.some((path) => /assets\/.+-[A-Za-z0-9_-]{6,}\.(?:js|css)$/.test(path)),
  "admin_hashed_asset_missing"
);

const adminText = adminFiles
  .filter((path) => /\.(?:css|html|js|json|map)$/.test(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const forbiddenAdminValues = [
  "TEAM_INVITE_CODE",
  "SESSION_SECRET",
  "EXTENSION_READ_TOKEN",
  "localhost",
  process.env.TEAM_INVITE_CODE,
  process.env.SESSION_SECRET,
  process.env.EXTENSION_READ_TOKEN
].filter((value) => typeof value === "string" && value.length > 0);
for (const value of forbiddenAdminValues) {
  assert(!adminText.includes(value), "admin_bundle_contains_forbidden_value");
}
assert(!/https:\/\/[^\s"']+\.up\.railway\.app/i.test(adminText), "admin_bundle_contains_railway_api_url");

const builtManifest = JSON.parse(readFileSync(join(extensionDist, "manifest.json"), "utf8"));
const sourceManifest = JSON.parse(readFileSync(extensionSourceManifest, "utf8"));
assert(
  JSON.stringify(builtManifest.permissions) === JSON.stringify(["alarms", "notifications", "storage"]),
  "extension_permissions_changed"
);
assert(
  JSON.stringify(builtManifest.host_permissions) === JSON.stringify(sourceManifest.host_permissions),
  "extension_host_permissions_changed"
);

const railway = JSON.parse(readFileSync(join(workspaceRoot, "railway.json"), "utf8"));
assert(railway.$schema === "https://railway.com/railway.schema.json", "railway_schema_missing");
assert(railway.build?.builder === "RAILPACK", "railway_builder_invalid");
assert(railway.deploy?.healthcheckPath === "/api/ready", "railway_healthcheck_invalid");
assert(statSync(join(serverDist, "routes", "adminStatic.js")).isFile(), "server_admin_static_build_missing");
assert(statSync(join(serverDist, "checkEnvironment.js")).isFile(), "server_environment_check_build_missing");
assert(statSync(join(serverDist, "verifyDatabase.js")).isFile(), "server_database_verifier_build_missing");

console.log(JSON.stringify({
  ok: true,
  adminFiles: adminFiles.length,
  extensionPermissions: builtManifest.permissions.length,
  railwayConfig: "valid"
}));
