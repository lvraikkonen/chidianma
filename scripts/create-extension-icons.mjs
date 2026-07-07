import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PNG } from "pngjs";

const sizes = [16, 32, 48, 128];
const outputDir = resolve("apps/extension/public");
mkdirSync(outputDir, { recursive: true });

for (const size of sizes) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (size * y + x) << 2;
      const edge = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
      png.data[index] = edge ? 37 : 245;
      png.data[index + 1] = edge ? 99 : 158;
      png.data[index + 2] = edge ? 235 : 11;
      png.data[index + 3] = 255;
    }
  }
  const file = resolve(outputDir, `icon-${size}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, PNG.sync.write(png));
}
