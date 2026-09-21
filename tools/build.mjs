import { mkdir, readFile, writeFile, cp, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import Ajv from "ajv/dist/2020.js";
import standalone from "ajv/dist/standalone/index.js";
export async function sourceHash() {
  const paths = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (
        dir === "tools" &&
        ["bin", "oracle-env", "__pycache__"].includes(e.name)
      )
        continue;
      const p = dir + "/" + e.name;
      if (e.isDirectory()) await walk(p);
      else paths.push(p);
    }
  }
  for (const d of ["crates", "web", "contracts", "tools", "tests", "fixtures"])
    await walk(d);
  paths.push(
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    "package.json",
    "package-lock.json",
    "playwright.config.js",
  );
  const h = createHash("sha256");
  for (const p of paths.sort()) {
    h.update(p);
    h.update(await readFile(p));
  }
  return h.digest("hex");
}
if (process.argv[1]?.endsWith("/build.mjs")) {
  const hash = await sourceHash();
  const env = { ...process.env, WORKBENCH_SOURCE_HASH: hash };
  execFileSync(
    "cargo",
    [
      "build",
      "--release",
      "--locked",
      "--target",
      "wasm32-unknown-unknown",
      "-p",
      "workbench-wasm-api",
    ],
    { stdio: "inherit", env },
  );
  execFileSync(
    "cargo",
    ["build", "--release", "--locked", "-p", "workbench-cli"],
    { stdio: "inherit", env },
  );
  await rm("dist-previous", { recursive: true, force: true });
  try {
    await cp("dist", "dist-previous", { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await rm("dist", { recursive: true, force: true });
  await mkdir("dist/pkg", { recursive: true });
  execFileSync(
    "tools/bin/bin/wasm-bindgen",
    [
      "target/wasm32-unknown-unknown/release/workbench_wasm_api.wasm",
      "--target",
      "web",
      "--out-dir",
      "dist/pkg",
    ],
    { stdio: "inherit" },
  );
  await cp("web", "dist", { recursive: true });
  await cp("fixtures/models", "dist/examples", { recursive: true });
  for (const name of ["project", "request", "response"]) {
    const schema = JSON.parse(await readFile(`contracts/${name}.schema.json`));
    const ajv = new Ajv({
      code: { source: true, esm: true },
      allErrors: true,
      strict: false,
    });
    const validate = ajv.compile(schema);
    const out = name === "project" ? "schema-validator" : `${name}-validator`;
    await writeFile(`dist/${out}.raw.js`, standalone(ajv, validate));
    await build({
      entryPoints: [`dist/${out}.raw.js`],
      outfile: `dist/${out}.js`,
      bundle: true,
      format: "esm",
      platform: "browser",
    });
    await rm(`dist/${out}.raw.js`);
  }

  const manifest = {
    sourceHash: hash,
    hashAlgorithmVersion: 1,
    exclusions: [
      "evidence",
      "delivery",
      "dist",
      "target",
      "node_modules",
      "tools/bin",
      "docs",
      "capabilities.json",
      "release-manifest.json",
    ],
    files: {},
  };
  async function files(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = dir + "/" + e.name;
      if (e.isDirectory()) await files(p);
      else
        manifest.files[p.slice(5)] = createHash("sha256")
          .update(await readFile(p))
          .digest("hex");
    }
  }
  await files("dist");
  manifest.buildHash = createHash("sha256")
    .update(JSON.stringify(manifest.files))
    .digest("hex");
  await writeFile("dist/build.json", JSON.stringify(manifest, null, 2));
  await writeFile(
    "release-manifest.json",
    JSON.stringify(
      { ...manifest, releaseStatus: "working-preview-not-accepted" },
      null,
      2,
    ),
  );
  if ((await sourceHash()) !== hash)
    throw Error("Source changed during build; rebuild the complete snapshot.");
  const { record } = await import("./evidence.mjs");
  await record("build", {
    status: "PASS",
    testCount: 5,
    testIds: [
      "locked-native-build",
      "locked-wasm-build",
      "wasm-bindgen",
      "draft2020-schema-compilation",
      "unchanged-source-snapshot",
    ],
    command: process.argv,
    outputFiles: manifest.files,
  });
  console.log("Built static app", manifest.buildHash);
}
