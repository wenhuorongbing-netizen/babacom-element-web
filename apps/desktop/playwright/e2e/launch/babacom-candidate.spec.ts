/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "../../element-desktop-test.js";

/**
 * Start/quit smoke test for the packaged BabaCom internal test candidate, run in an isolated profile.
 * Needs ELEMENT_DESKTOP_EXECUTABLE pointing at a build made with the babacom/build.json variant.
 */
const variantPath = fileURLToPath(import.meta.resolve("../../../babacom/build.json"));
const { productName } = JSON.parse(fs.readFileSync(variantPath, "utf8")) as { productName: string };
const widgetScript = fileURLToPath(import.meta.resolve("../../../../web/scripts/build-babacom-call-widget.mjs"));

const samePath = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// Electron's default profile, worked out without the app so its state is recorded before launch: by the time the app
// is running, a leak into the default profile has already happened.
const appData =
    process.platform === "win32"
        ? process.env.APPDATA!
        : process.platform === "darwin"
          ? path.join(os.homedir(), "Library", "Application Support")
          : (process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"));
const defaultProfile = path.join(appData, productName);
const defaultProfileExistedBeforeLaunch = fs.existsSync(defaultProfile);

test.describe("BabaCom internal test candidate", () => {
    test.skip(!process.env.ELEMENT_DESKTOP_EXECUTABLE, "Runs against a packaged BabaCom build only");
    test.slow();
    test.use({ extraArgs: ["--babacom-isolated-candidate", "--no-update"] });

    test("starts in the isolated profile with the BabaCom web app and quits cleanly", async ({ app, page, tmpDir }) => {
        const running = await app.evaluate(({ app }) => ({
            name: app.getName(),
            userData: app.getPath("userData"),
            appData: app.getPath("appData"),
        }));
        expect(running.name).toBe(productName);
        expect(samePath(running.userData, tmpDir)).toBe(true);
        expect(samePath(running.appData, appData)).toBe(true);

        await page.locator("#matrixchat").waitFor();
        await expect(page).toHaveURL(/^vector:\/\/vector\/webapp\//);

        // The packaged web app carries the patched Element Call widget for this checkout, and BabaCom's strings
        const provenance = await page.evaluate(async () => {
            const response = await fetch("widgets/element-call/babacom-call-widget.json");
            return (await response.json()) as { key: string };
        });
        const expectedKey = execFileSync(process.execPath, [widgetScript, "--print-key"], { encoding: "utf8" }).trim();
        expect(provenance.key).toBe(expectedKey);
        const translationsOk = await page.evaluate(async () => (await fetch("babacom-translations.json")).ok);
        expect(translationsOk).toBe(true);

        const appProcess = app.process();
        await app.close();
        expect(appProcess.exitCode).toBe(0);
        expect(fs.readdirSync(tmpDir).length).toBeGreaterThan(0);
        if (!defaultProfileExistedBeforeLaunch) expect(fs.existsSync(defaultProfile)).toBe(false);
    });
});
