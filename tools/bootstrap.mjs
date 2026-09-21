import { execFileSync } from "node:child_process";
execFileSync(
  "rustup",
  ["target", "add", "wasm32-unknown-unknown", "--toolchain", "1.96.0"],
  { stdio: "inherit" },
);
execFileSync(
  "cargo",
  [
    "install",
    "wasm-bindgen-cli",
    "--version",
    "0.2.128",
    "--locked",
    "--root",
    "tools/bin",
  ],
  { stdio: "inherit" },
);
