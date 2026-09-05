import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTERNAL_EXTENSION_VERSION,
  MINIMAL_EXTENSION_PERMISSIONS,
  extensionIdFromManifestKey,
  validateManifest
// @ts-expect-error The release helper is an intentionally shared JavaScript module.
} from "../../../scripts/lib/extension-release.mjs";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const readJson = (path: string) => JSON.parse(
  readFileSync(resolve(workspaceRoot, path), "utf8")
) as Record<string, any>;

describe("Extension 0.4.0 release metadata", () => {
  it("uses one canonical version across the package, manifest and release schema", () => {
    const packageJson = readJson("apps/extension/package.json");
    const manifest = readJson("apps/extension/manifest.base.json");
    const schema = readJson("schemas/extension-internal-release.schema.json");

    expect(INTERNAL_EXTENSION_VERSION).toBe("0.4.0");
    expect(packageJson.version).toBe(INTERNAL_EXTENSION_VERSION);
    expect(manifest.version).toBe(INTERNAL_EXTENSION_VERSION);
    expect(schema.properties.version.pattern).toBe("^0\\.4\\.0$");
    expect(schema.properties.artifact.properties.file.pattern).toBe(
      "^chidianma-extension-0\\.4\\.0-internal\\.zip$"
    );
  });

  it("retains the stable ID and exact permissions for the internal manifest", () => {
    const manifest = readJson("apps/extension/manifest.base.json");
    const key = readFileSync(
      resolve(workspaceRoot, "apps/extension/internal-public-key.txt"),
      "utf8"
    ).trim();
    const internalManifest = {
      ...manifest,
      name: "中午吃点啥（内部测试）",
      key,
      host_permissions: ["https://lunchserver-production.up.railway.app/*"]
    };

    expect(() => validateManifest(internalManifest, "internal")).not.toThrow();
    expect(extensionIdFromManifestKey(key)).toBe(
      "bbkeaogleldgfnkgebdhdbiohlmonbkk"
    );
    expect(manifest.permissions).toEqual(MINIMAL_EXTENSION_PERMISSIONS);
  });
});
