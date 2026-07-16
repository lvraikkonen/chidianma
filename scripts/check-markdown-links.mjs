import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = execFileSync("rg", ["--files", "-g", "*.md"], {
  cwd: root,
  encoding: "utf8"
}).trim().split("\n").filter(Boolean);

const failures = [];
let checkedLinks = 0;

for (const file of files) {
  const source = readFileSync(path.join(root, file), "utf8")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "");

  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1].trim();
    const angled = raw.startsWith("<") && raw.endsWith(">");
    const withoutAngles = angled ? raw.slice(1, -1) : raw;
    const target = angled ? withoutAngles : withoutAngles.split(/\s+["']/)[0];
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;

    const pathOnly = target.split("#", 1)[0];
    if (!pathOnly) continue;
    checkedLinks += 1;

    let decoded;
    try {
      decoded = decodeURIComponent(pathOnly);
    } catch {
      failures.push(`${file}: invalid URL encoding in ${target}`);
      continue;
    }

    const absolute = decoded.startsWith("/")
      ? decoded
      : path.resolve(root, path.dirname(file), decoded);
    if (!existsSync(absolute)) {
      failures.push(`${file}: missing ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, markdownFiles: files.length, localLinks: checkedLinks }));
