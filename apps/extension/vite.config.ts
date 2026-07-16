import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const profile = process.env.LUNCH_EXTENSION_PROFILE === "dev"
  ? "dev"
  : "internal";
const productionOrigin = "https://lunchserver-production.up.railway.app";
const baseManifest = JSON.parse(readFileSync(
  resolve(__dirname, "manifest.base.json"),
  "utf8"
));
const internalPublicKey = readFileSync(
  resolve(__dirname, "internal-public-key.txt"),
  "utf8"
).trim();

function manifestForProfile() {
  if (profile === "dev") {
    return {
      ...baseManifest,
      name: "中午吃点啥（开发版）",
      host_permissions: [
        "http://localhost:3000/*",
        `${productionOrigin}/*`
      ]
    };
  }
  return {
    ...baseManifest,
    name: "中午吃点啥（内部测试）",
    key: internalPublicKey,
    host_permissions: [`${productionOrigin}/*`]
  };
}

function buildProfileMetadata() {
  const manifest = manifestForProfile();
  return {
    schemaVersion: "1.0",
    profile,
    name: manifest.name,
    version: manifest.version,
    defaultApiBaseUrl: profile === "internal"
      ? productionOrigin
      : "http://localhost:3000",
    advancedApiEditing: profile === "dev",
    productionOrigin
  };
}

export default defineConfig({
  define: {
    __LUNCH_EXTENSION_PROFILE__: JSON.stringify(profile),
    __LUNCH_PRODUCTION_API_ORIGIN__: JSON.stringify(productionOrigin)
  },
  plugins: [{
    name: "stage7c-extension-manifest",
    apply: "build",
    closeBundle() {
      writeFileSync(
        resolve(__dirname, "dist/manifest.json"),
        `${JSON.stringify(manifestForProfile(), null, 2)}\n`
      );
      writeFileSync(
        resolve(__dirname, "dist/build-profile.json"),
        `${JSON.stringify(buildProfileMetadata(), null, 2)}\n`
      );
    }
  }],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"),
        detail: resolve(__dirname, "detail.html"),
        options: resolve(__dirname, "options.html"),
        background: resolve(__dirname, "src/background.ts")
      },
      output: {
        entryFileNames: "assets/[name].js"
      }
    }
  }
});
