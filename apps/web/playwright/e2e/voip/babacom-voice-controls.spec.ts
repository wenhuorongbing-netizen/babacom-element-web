/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type FrameLocator, type Page } from "@playwright/test";
import { closeReleaseAnnouncementIfExists, rejectToast } from "@element-hq/element-web-playwright-common";

import { test, expect } from "../../element-web-test";

/**
 * Happy path for BabaCom's persistent voice controls in the left panel, against a real call through BabaCom's
 * patched Element Call widget and a real MatrixRTC backend (see `element-call-full-call.spec.ts`).
 *
 * The patched widget joins with the microphone off, so the first assertion also fails if the build fell back to
 * the stock widget, which joins unmuted.
 *
 * The microphone status only changes once Element Call confirms the change over the widget API, so these
 * assertions cover the round trip, not just the button.
 */
test.use({
    matrixRTC: true,
    displayName: "Alice",
    permissions: ["microphone", "camera"],
});

test.skip(({ homeserverType }) => homeserverType !== "synapse", "Needs Synapse's matrix_rtc configuration");

async function settleNewSession(page: Page): Promise<void> {
    await rejectToast(page, "Verify this device");
    await rejectToast(page, "Notifications");
    await closeReleaseAnnouncementIfExists(page, "Introducing Sections");
}

function callFrame(page: Page): FrameLocator {
    return page.frameLocator('iframe[title="Element Call"]');
}

test.describe("BabaCom voice controls", () => {
    test(
        "control the microphone and leave the call from the sidebar",
        { tag: ["@no-firefox", "@no-webkit"] },
        async ({ page, app, user }) => {
            test.setTimeout(180_000);
            await settleNewSession(page);

            // Same power-level override as the full-call spec, so the raw-API room accepts call membership.
            const callRoomId = await app.client.createRoom({
                name: "Call room",
                power_level_content_override: { events: { "org.matrix.msc3401.call.member": 0 } },
            });
            await app.client.createRoom({ name: "Other room" });

            // Join a call through Element Call's lobby
            await app.viewRoomById(callRoomId);
            await page.getByRole("button", { name: "Video call" }).click();
            await page.getByRole("menuitem", { name: "Element Call" }).click();
            await expect(callFrame(page).getByTestId("lobby_joinCall")).toBeVisible({ timeout: 60_000 });
            await callFrame(page).getByTestId("lobby_joinCall").click();
            await expect(callFrame(page).getByTestId("videoTile")).toHaveCount(1, { timeout: 30_000 });

            // The sidebar shows the active call
            const voiceBar = page.locator(".mx_LeftPanel").getByRole("region", { name: "Call room" });
            await expect(voiceBar.getByText("Voice connected")).toBeVisible({ timeout: 30_000 });

            // Joined with the microphone off; turning it on is an explicit choice from the sidebar.
            // Each status waits for Element Call's confirmation.
            await expect(voiceBar.getByText("Microphone muted")).toBeVisible({ timeout: 15_000 });
            await voiceBar.getByRole("button", { name: "Unmute microphone" }).click();
            await expect(voiceBar.getByText("Microphone on")).toBeVisible({ timeout: 15_000 });

            // The controls stay while browsing another room, and still reach the call
            await page.getByTestId("room-list").getByRole("option", { name: "Open room Other room" }).click();
            await expect(page.getByRole("heading", { name: "Other room", level: 1 })).toBeVisible();
            await expect(voiceBar.getByText("Voice connected")).toBeVisible();
            await voiceBar.getByRole("button", { name: "Mute microphone" }).click();
            await expect(voiceBar.getByText("Microphone muted")).toBeVisible({ timeout: 15_000 });

            // Leave from the sidebar: the controls disappear and the call room has nothing left to rejoin
            await voiceBar.getByRole("button", { name: "Leave voice call" }).click();
            await expect(voiceBar).toHaveCount(0, { timeout: 30_000 });
            await app.viewRoomById(callRoomId);
            await expect(page.locator(".mx_BasicMessageComposer")).toBeVisible({ timeout: 30_000 });
            await expect(page.getByTestId("join-call-button")).not.toBeVisible();
        },
    );
});
