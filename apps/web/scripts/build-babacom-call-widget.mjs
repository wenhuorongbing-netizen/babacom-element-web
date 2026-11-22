/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const callRevision = "71593f1a245b1afa971e3940596e1c500edf9548";
const sdkRevision = "24929be0e741be6a5d0a7226f1c682e245263b8a"; // Element Call's frozen lockfile
const root = fileURLToPath(new URL("../../../", import.meta.url));
const cache = join(root, ".tmp");
mkdirSync(cache, { recursive: true });
const buildRoot = mkdtempSync(join(cache, "babacom-call-widget-"));
const call = join(buildRoot, "element-call");
const sdk = join(buildRoot, "matrix-js-sdk");

checkout("https://github.com/element-hq/element-call.git", callRevision, call);
const patch = join(root, "patches", "babacom-element-call-v0.26.0.patch");
run("git", ["apply", "--check", patch], call);
run("git", ["apply", patch], call);

install(call);

// Git-hosted SDK preparation invokes a nested package manager. Build the
// exact locked SDK explicitly so Windows does not need a global pnpm shim.
checkout("https://github.com/matrix-org/matrix-js-sdk.git", sdkRevision, sdk);
install(sdk, "pnpm@11.9.0");
run(process.execPath, ["node_modules/@babel/cli/bin/babel.js", "-d", "lib", "--extensions", ".ts,.js", "src"], sdk);
run(
    process.execPath,
    ["node_modules/typescript/bin/tsc6", "--project", "tsconfig-build.json", "--emitDeclarationOnly"],
    sdk,
);
cpSync(join(sdk, "lib"), join(call, "node_modules", "matrix-js-sdk", "lib"), { recursive: true });

run(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--config", "vite-embedded.config.ts"], call, {
    ...process.env,
    VITE_BABACOM_VOICE: "1",
    VITE_APP_VERSION: "embedded-v0.26.0-babacom",
});

const dist = join(call, "dist");
if (!existsSync(join(dist, "index.html"))) throw new Error("The Element Call build did not produce index.html");
console.log(`BABACOM_CALL_WIDGET_DIR=${dist}`);

function checkout(remote, revision, destination) {
    mkdirSync(destination);
    run("git", ["init", "--quiet"], destination);
    run("git", ["fetch", "--quiet", "--depth", "1", remote, revision], destination);
    run("git", ["-c", "core.autocrlf=false", "checkout", "--quiet", "--detach", revision], destination);
}

function install(cwd, packageManager = "pnpm") {
    const args = [
        packageManager,
        "install",
        "--frozen-lockfile",
        "--ignore-pnpmfile",
        "--ignore-scripts",
        "--reporter=append-only",
    ];
    const env = { ...process.env, CI: "true" };
    if (process.platform !== "win32") {
        run("corepack", args, cwd, env);
        return;
    }

    const bundledCorepack = join(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js");
    if (existsSync(bundledCorepack)) {
        run(process.execPath, [bundledCorepack, ...args], cwd, env);
    } else {
        execSync(`corepack.cmd ${args.join(" ")}`, { cwd, env, stdio: "inherit" });
    }
}

function run(executable, args, cwd, env = process.env) {
    execFileSync(executable, args, { cwd, env, stdio: "inherit" });
}
