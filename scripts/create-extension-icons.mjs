import {
  copyFileSync,
  mkdirSync,
  readFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const sizes = [16, 32, 48, 128];
const workspaceRoot = resolve(import.meta.dirname, "..");
const masterPath = resolve(workspaceRoot, "assets/brand/brand-mark.svg");
const extensionOutputDir = resolve(workspaceRoot, "apps/extension/public");
const adminOutputDir = resolve(workspaceRoot, "apps/admin/public");
const masterSvg = readFileSync(masterPath, "utf8");

function smallOpticalSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
    <rect x="2" y="2" width="12" height="12" rx="3.25" fill="#E86F3D"/>
    <g fill="none" stroke="#FFF8EE" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 6.2c-.6-.6-.6-1.4 0-2" stroke-width="1.2"/>
      <path d="M9.25 6.2c-.6-.6-.6-1.4 0-2" stroke-width="1.2"/>
      <path d="M4.25 8h7.5c0 2.1-1.65 3.75-3.75 3.75S4.25 10.1 4.25 8Z" stroke-width="1.2"/>
      <path d="M5.4 12h5.2" stroke-width="1.2"/>
    </g>
  </svg>`;
}

mkdirSync(extensionOutputDir, { recursive: true });
mkdirSync(adminOutputDir, { recursive: true });
copyFileSync(masterPath, resolve(extensionOutputDir, "brand-mark.svg"));
copyFileSync(masterPath, resolve(adminOutputDir, "brand-mark.svg"));

for (const size of sizes) {
  const file = resolve(extensionOutputDir, `icon-${size}.png`);
  mkdirSync(dirname(file), { recursive: true });
  const source = size === 16 ? smallOpticalSvg() : masterSvg;
  await sharp(Buffer.from(source), { density: 384 })
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({
      adaptiveFiltering: false,
      compressionLevel: 9,
      palette: false
    })
    .toFile(file);
}

console.log(JSON.stringify({
  ok: true,
  renderer: `sharp@${sharp.versions.sharp}`,
  master: masterPath,
  sizes
}));
