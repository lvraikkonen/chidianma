import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const reportPath = process.argv[2];
if (!reportPath) {
  throw new Error("usage: pnpm check:production-vulnerabilities <osv-json-report>");
}

const report = JSON.parse(readFileSync(resolve(reportPath), "utf8"));
const listOutput = execFileSync(
  "pnpm",
  ["--filter", "@lunch/server", "list", "--prod", "--depth", "Infinity", "--json"],
  { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" }
);
const roots = JSON.parse(listOutput);
const productionVersions = new Set();

function visitDependencies(node) {
  for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
    if (/^\d/.test(dependency.version)) {
      productionVersions.add(`${name}@${dependency.version}`);
    }
    visitDependencies(dependency);
  }
}

for (const root of roots) {
  visitDependencies(root);
}

const findings = [];
for (const result of report.results ?? []) {
  for (const entry of result.packages ?? []) {
    const packageKey = `${entry.package.name}@${entry.package.version}`;
    if (entry.package.ecosystem !== "npm" || !productionVersions.has(packageKey)) {
      continue;
    }
    for (const group of entry.groups ?? []) {
      findings.push({
        package: packageKey,
        advisory: group.ids?.[0] ?? "unknown",
        cvss: Number(group.max_severity ?? 0)
      });
    }
  }
}

const severityCounts = {
  critical: findings.filter((finding) => finding.cvss >= 9).length,
  high: findings.filter((finding) => finding.cvss >= 7 && finding.cvss < 9).length,
  medium: findings.filter((finding) => finding.cvss >= 4 && finding.cvss < 7).length,
  low: findings.filter((finding) => finding.cvss > 0 && finding.cvss < 4).length
};

console.log(JSON.stringify({
  ok: severityCounts.critical === 0 && severityCounts.high === 0,
  productionPackageVersions: productionVersions.size,
  severityCounts,
  findings
}));

if (severityCounts.critical > 0 || severityCounts.high > 0) {
  process.exitCode = 1;
}
