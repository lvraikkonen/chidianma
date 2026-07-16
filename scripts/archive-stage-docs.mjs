import { execFileSync } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apply = process.argv.includes("--apply");

const moves = new Map([
  ["specs/2026-07-07-lunch-chrome-extension-design.md", "docs/archive/stages/pre-stage/2026-07-07-lunch-chrome-extension-design-spec.md"],
  ["plans/2026-07-07-lunch-vertical-slice.md", "docs/archive/stages/pre-stage/2026-07-07-lunch-vertical-slice-plan.md"],
  ["docs/superpowers/specs/2026-07-07-lunch-chrome-extension-design.md", "docs/archive/stages/pre-stage/legacy-superpowers-copy/2026-07-07-lunch-chrome-extension-design-spec.md"],
  ["docs/superpowers/plans/2026-07-07-lunch-vertical-slice.md", "docs/archive/stages/pre-stage/legacy-superpowers-copy/2026-07-07-lunch-vertical-slice-plan.md"],
  ["specs/2026-07-08-multi-group-prototype-implementation-design.md", "docs/archive/stages/stage-1/2026-07-08-multi-group-prototype-implementation-design.md"],
  ["plans/2026-07-08-multi-group-foundation-stage1.md", "docs/archive/stages/stage-1/2026-07-08-multi-group-foundation-stage1-plan.md"],
  ["plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md", "docs/archive/stages/stage-2/2026-07-09-group-scoped-restaurant-knowledge-stage2-plan.md"],
  ["plans/2026-07-09-today-recommendation-batch-participation-stage3.md", "docs/archive/stages/stage-3/2026-07-09-today-recommendation-batch-participation-stage3-plan.md"],
  ["specs/2026-07-09-subagent-model-policy-design.md", "docs/archive/stages/cross-cutting/2026-07-09-subagent-model-policy-design.md"],
  ["plans/2026-07-09-subagent-model-policy.md", "docs/archive/stages/cross-cutting/2026-07-09-subagent-model-policy-plan.md"],
  ["specs/2026-07-10-prototype-ui-wiring-stage4-design.md", "docs/archive/stages/stage-4/2026-07-10-prototype-ui-wiring-stage4-design.md"],
  ["plans/2026-07-10-extension-prototype-ui-wiring-stage4a.md", "docs/archive/stages/stage-4/2026-07-10-extension-prototype-ui-wiring-stage4a-plan.md"],
  ["plans/2026-07-10-admin-prototype-ui-wiring-stage4b.md", "docs/archive/stages/stage-4/2026-07-10-admin-prototype-ui-wiring-stage4b-plan.md"],
  ["qa/2026-07-10-extension-prototype-ui-wiring-stage4a.md", "docs/archive/stages/stage-4/2026-07-10-extension-prototype-ui-wiring-stage4a-qa.md"],
  ["qa/2026-07-10-admin-prototype-ui-wiring-stage4b.md", "docs/archive/stages/stage-4/2026-07-10-admin-prototype-ui-wiring-stage4b-qa.md"],
  ["qa/2026-07-14-railway-dev-stage4a-qa.md", "docs/archive/stages/stage-4/2026-07-14-railway-dev-stage4a-qa.md"],
  ["specs/2026-07-14-dashboard-settings-weights-stage5-design.md", "docs/archive/stages/stage-5/2026-07-14-dashboard-settings-weights-stage5-design.md"],
  ["plans/2026-07-14-dashboard-settings-weights-stage5a.md", "docs/archive/stages/stage-5/2026-07-14-dashboard-settings-weights-stage5a-plan.md"],
  ["plans/2026-07-14-admin-dashboard-settings-stage5b.md", "docs/archive/stages/stage-5/2026-07-14-admin-dashboard-settings-stage5b-plan.md"],
  ["plans/2026-07-14-extension-history-reminders-stage5c.md", "docs/archive/stages/stage-5/2026-07-14-extension-history-reminders-stage5c-plan.md"],
  ["qa/2026-07-14-dashboard-settings-weights-stage5a.md", "docs/archive/stages/stage-5/2026-07-14-dashboard-settings-weights-stage5a-qa.md"],
  ["qa/2026-07-14-admin-dashboard-settings-stage5b.md", "docs/archive/stages/stage-5/2026-07-14-admin-dashboard-settings-stage5b-qa.md"],
  ["qa/2026-07-15-extension-history-reminders-stage5c.md", "docs/archive/stages/stage-5/2026-07-15-extension-history-reminders-stage5c-qa.md"],
  ["specs/2026-07-15-deploy-hardening-stage6-design.md", "docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-design.md"],
  ["plans/2026-07-15-deploy-hardening-stage6.md", "docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-plan.md"],
  ["qa/2026-07-15-deploy-hardening-stage6.md", "docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-qa.md"],
  ["reviews/2026-07-15-production-baseline-autoplan-review.md", "qa/2026-07-15-production-baseline-autoplan-review.md"]
]);

const markdownFiles = execFileSync("rg", ["--files", "-g", "*.md"], {
  cwd: root,
  encoding: "utf8"
}).trim().split("\n").filter(Boolean).map(normalize);

const oldPaths = new Set(markdownFiles);
const newPaths = new Set(moves.values());
const contents = new Map();
for (const file of markdownFiles) {
  contents.set(file, await readFile(path.join(root, file), "utf8"));
}

for (const source of moves.keys()) {
  if (!contents.has(source)) {
    throw new Error(`archive_source_missing:${source}`);
  }
}

const outputs = new Map();
for (const [source, content] of contents) {
  const destination = moves.get(source) ?? source;
  outputs.set(destination, rewriteLinks(source, destination, content));
}

console.log(JSON.stringify({
  ok: true,
  mode: apply ? "apply" : "dry-run",
  movedFiles: moves.size,
  rewrittenMarkdownFiles: [...outputs.entries()].filter(([destination, content]) => {
    const source = [...moves.entries()].find(([, moved]) => moved === destination)?.[0] ?? destination;
    return source !== destination || contents.get(source) !== content;
  }).length
}, null, 2));

if (apply) {
  for (const [destination, content] of outputs) {
    await mkdir(path.dirname(path.join(root, destination)), { recursive: true });
    await writeFile(path.join(root, destination), content);
  }
  for (const [source, destination] of moves) {
    if (source !== destination) await unlink(path.join(root, source));
  }
}

function rewriteLinks(source, destination, content) {
  return content.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (match, prefix, rawTarget, suffix) => {
    const trimmed = rawTarget.trim();
    const angled = trimmed.startsWith("<") && trimmed.endsWith(">");
    const target = angled ? trimmed.slice(1, -1) : trimmed;
    if (!target || target.startsWith("#") || target.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
      return match;
    }

    const hashAt = target.indexOf("#");
    const targetPath = hashAt >= 0 ? target.slice(0, hashAt) : target;
    const fragment = hashAt >= 0 ? target.slice(hashAt) : "";
    if (!targetPath) return match;

    const relativeCandidate = normalize(path.posix.join(path.posix.dirname(source), targetPath));
    const rootCandidate = normalize(targetPath);
    let resolved;
    if (oldPaths.has(relativeCandidate) || moves.has(relativeCandidate) || newPaths.has(relativeCandidate)) {
      resolved = relativeCandidate;
    } else if (oldPaths.has(rootCandidate) || moves.has(rootCandidate) || newPaths.has(rootCandidate)) {
      resolved = rootCandidate;
    } else {
      return match;
    }

    const movedTarget = moves.get(resolved) ?? resolved;
    let nextTarget = path.posix.relative(path.posix.dirname(destination), movedTarget);
    if (!nextTarget) nextTarget = path.posix.basename(movedTarget);
    const rendered = `${nextTarget}${fragment}`;
    return `${prefix}${angled ? `<${rendered}>` : rendered}${suffix}`;
  });
}

function normalize(value) {
  return value.replaceAll(path.sep, "/").replace(/^\.\//, "");
}
