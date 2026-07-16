import { rmSync } from "node:fs";
import { basename, resolve } from "node:path";

const requested = process.argv[2] ?? "dist";
const target = resolve(process.cwd(), requested);
if (basename(target) !== "dist") {
  throw new Error("clean_target_must_be_dist");
}
rmSync(target, { recursive: true, force: true });
