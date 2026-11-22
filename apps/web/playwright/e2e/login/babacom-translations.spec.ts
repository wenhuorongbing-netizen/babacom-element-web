/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { expect, test } from "../../element-web-test";

/**
 * BabaCom's Chinese strings ship in `res/babacom-translations.json` and load through `custom_translations_url`.
 * A failed load silently falls back to English, so check that the overrides really reach the UI.
 */
test.use({
    config: {
        custom_translations_url: "babacom-translations.json",
        // The shared test config pins the language to English
        setting_defaults: { language: "zh-hans" },
    },
});

test("shows BabaCom's Chinese wording on the login page", async ({ page }) => {
    await page.goto("/#/login");

    // Both strings are BabaCom additions: without the overrides they would appear in English.
    await expect(page.getByText("账户服务器", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "更改账户服务器" })).toBeVisible();
});
