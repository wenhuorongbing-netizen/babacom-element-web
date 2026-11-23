/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// Builds BabaCom's patched Element Call widget into a directory named after its inputs (see babacom-call-widget.ts),
// so repeated runs and CI caches reuse it. `--print-dir` and `--print-key` only print where the widget belongs and
// the key a matching build records in its provenance file.

import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
    CALL_REVISION,
    PATCH_PATH,
    PROVENANCE_FILE,
    SDK_REVISION,
    callWidgetBuildRoot,
    callWidgetDir,
    callWidgetKey,
    callWidgetProblem,
} from "./babacom-call-widget.ts";

const dist = callWidgetDir();
if (process.argv.includes("--print-dir")) {
    console.log(dist);
    process.exit(0);
}
if (process.argv.includes("--print-key")) {
    console.log(callWidgetKey());
    process.exit(0);
}
if (callWidgetProblem(dist) === null) {
    console.log(`Patched Element Call widget is up to date: ${dist}`);
    process.exit(0);
}

const buildRoot = callWidgetBuildRoot();
rmSync(buildRoot, { recursive: true, force: true });
mkdirSync(buildRoot, { recursive: true });
const call = path.join(buildRoot, "element-call");
const sdk = path.join(buildRoot, "matrix-js-sdk");

checkout("https://github.com/element-hq/element-call.git", CALL_REVISION, call);
run("git", ["apply", "--check", PATCH_PATH], call);
run("git", ["apply", PATCH_PATH], call);

install(call);

// Git-hosted SDK preparation invokes a nested package manager. Build the
// exact locked SDK explicitly so Windows does not need a global pnpm shim.
checkout("https://github.com/matrix-org/matrix-js-sdk.git", SDK_REVISION, sdk);
install(sdk, "pnpm@11.9.0");
run(process.execPath, ["node_modules/@babel/cli/bin/babel.js", "-d", "lib", "--extensions", ".ts,.js", "src"], sdk);
run(
    process.execPath,
    ["node_modules/typescript/bin/tsc6", "--project", "tsconfig-build.json", "--emitDeclarationOnly"],
    sdk,
);
cpSync(path.join(sdk, "lib"), path.join(call, "node_modules", "matrix-js-sdk", "lib"), { recursive: true });

run(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--config", "vite-embedded.config.ts"], call, {
    ...process.env,
    VITE_BABACOM_VOICE: "1",
    VITE_APP_VERSION: "embedded-v0.26.0-babacom",
});

writeFileSync(
    path.join(dist, PROVENANCE_FILE),
    JSON.stringify({ key: callWidgetKey(), callRevision: CALL_REVISION, sdkRevision: SDK_REVISION }, null, 4) + "\n",
);
const problem = callWidgetProblem(dist);
if (problem) throw new Error(`The Element Call build is not usable: ${problem}`);
console.log(`Built patched Element Call widget: ${dist}`);

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

    const bundledCorepack = path.join(
        path.dirname(process.execPath),
        "node_modules",
        "corepack",
        "dist",
        "corepack.js",
    );
    if (existsSync(bundledCorepack)) {
        run(process.execPath, [bundledCorepack, ...args], cwd, env);
    } else {
        execSync(`corepack.cmd ${args.join(" ")}`, { cwd, env, stdio: "inherit" });
    }
}

function run(executable, args, cwd, env = process.env) {
    execFileSync(executable, args, { cwd, env, stdio: "inherit" });
}
