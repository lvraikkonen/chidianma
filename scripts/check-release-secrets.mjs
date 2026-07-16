import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const workspaceRoot = resolve(import.meta.dirname, "..");
const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".md"]);
const excludedDirectories = new Set([".git", "node_modules"]);

function assert(condition, code) {
  if (!condition) {
    throw new Error(code);
  }
}

const trackedFilesResult = spawnSync(
  "git",
  ["ls-files"],
  { cwd: workspaceRoot, encoding: "utf8" }
);
assert(trackedFilesResult.status === 0, "tracked_file_scan_failed");
const trackedFiles = trackedFilesResult.stdout.split("\n").filter(Boolean);
assert(
  !trackedFiles.some((path) => /\.(?:pem|p12|pfx)$/i.test(path)),
  "tracked_private_key_file_detected"
);

function walkTextFiles(root) {
  return readdirSync(root).flatMap((name) => {
    if (excludedDirectories.has(name)) {
      return [];
    }
    const path = join(root, name);
    if (statSync(path).isDirectory()) {
      return walkTextFiles(path);
    }
    return textExtensions.has(extname(path)) ? [path] : [];
  });
}

const files = walkTextFiles(workspaceRoot).filter((path) => {
  const workspacePath = relative(workspaceRoot, path).replaceAll("\\", "/");
  return workspacePath.endsWith(".md") ||
    workspacePath.startsWith("apps/admin/dist/") ||
    workspacePath.startsWith("apps/extension/dist/");
});
const documents = files.map((path) => ({ path, text: readFileSync(path, "utf8") }));

const suppliedSecretValues = [
  process.env.DATABASE_URL,
  process.env.TEAM_INVITE_CODE,
  process.env.SESSION_SECRET,
  process.env.EXTENSION_READ_TOKEN
].filter((value) => typeof value === "string" && value.length > 0);

for (const { text } of documents) {
  assert(!text.includes("-----BEGIN PRIVATE KEY-----"), "private_key_material_detected");
  assert(!/\bgh[opusr]_[A-Za-z0-9]{30,}\b/.test(text), "github_token_detected");
  assert(!/\brailway_[A-Za-z0-9_-]{24,}\b/i.test(text), "railway_token_detected");
  for (const value of suppliedSecretValues) {
    assert(!text.includes(value), "supplied_secret_value_detected");
  }

  for (const match of text.matchAll(/postgres(?:ql)?:\/\/([^\s"'`)]+)/gi)) {
    let url;
    try {
      url = new URL(`postgresql://${match[1]}`);
    } catch {
      continue;
    }
    const isLocalExample = ["localhost", "127.0.0.1", "example"].includes(url.hostname);
    assert(isLocalExample || (!url.username && !url.password), "credentialed_database_url_detected");
  }
}

console.log(JSON.stringify({
  ok: true,
  files: files.length,
  suppliedSecretValues: suppliedSecretValues.length
}));
