/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// Shared by build-babacom-call-widget.mjs and webpack.config.ts: where the patched Element Call widget lives and
// how to tell that a built copy matches the current pins and patch.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CALL_REVISION = "71593f1a245b1afa971e3940596e1c500edf9548"; // Element Call v0.26.0
export const SDK_REVISION = "24929be0e741be6a5d0a7226f1c682e245263b8a"; // Element Call's frozen lockfile
export const PROVENANCE_FILE = "babacom-call-widget.json";

const root = fileURLToPath(new URL("../../../", import.meta.url));
export const PATCH_PATH = path.join(root, "patches", "babacom-element-call-v0.26.0.patch");

/** Hash of everything the widget build depends on. Line endings are ignored so Windows and CI agree. */
export function callWidgetKey(): string {
    const patch = readFileSync(PATCH_PATH, "utf8").replaceAll("\r\n", "\n");
    return createHash("sha256").update(`${CALL_REVISION}\n${SDK_REVISION}\n${patch}`).digest("hex");
}

/** The build directory for the current key; the widget itself is its `element-call/dist`. */
export function callWidgetBuildRoot(): string {
    return path.join(root, ".tmp", "babacom-call-widget", callWidgetKey().slice(0, 16));
}

export function callWidgetDir(): string {
    return path.join(callWidgetBuildRoot(), "element-call", "dist");
}

/** Returns why `dir` is not a usable patched widget for the current key, or null when it is. */
export function callWidgetProblem(dir: string): string | null {
    if (!existsSync(path.join(dir, "index.html"))) return `no index.html in ${dir}`;
    const provenancePath = path.join(dir, PROVENANCE_FILE);
    if (!existsSync(provenancePath)) return `no ${PROVENANCE_FILE} in ${dir}`;
    const { key } = JSON.parse(readFileSync(provenancePath, "utf8")) as { key?: string };
    if (key !== callWidgetKey()) return `${dir} was built from a different Element Call revision or patch`;
    return null;
}
