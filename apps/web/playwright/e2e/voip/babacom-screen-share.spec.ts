/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import path from "node:path";

import { type FrameLocator, type Page } from "@playwright/test";
import {
    closeReleaseAnnouncementIfExists,
    populateLocalStorageWithCredentials,
    rejectToast,
    routeConfigJson,
} from "@element-hq/element-web-playwright-common";

import { test, expect } from "../../element-web-test";
import { callWidgetBuildRoot } from "../../../scripts/babacom-call-widget";

/**
 * BabaCom M24: one screen share per call, enforced by the SFU. Runs against BabaCom's lk-jwt-service fork with its
 * share arbiter (BABACOM_LK_JWT_IMAGE), a real LiveKit SFU and Synapse, and BabaCom's patched Element Call.
 *
 * Two users share through the real UI. Two raw LiveKit clients, which bypass every client-side check, prove that the
 * SFU itself refuses screen tracks that the arbiter has not granted, including from a token LiveKit refreshed while
 * an earlier share was held. What counts is what a second participant actually receives, not buttons or JWTs.
 */
test.use({
    matrixRTC: true,
    displayName: "Alice",
    permissions: ["microphone", "camera"],
});

test.skip(({ homeserverType }) => homeserverType !== "synapse", "Needs Synapse's matrix_rtc configuration");
test.skip(!process.env.BABACOM_LK_JWT_IMAGE, "Needs BabaCom's lk-jwt-service image (BABACOM_LK_JWT_IMAGE)");

const SLOT_ID = "m.call#ROOM";
/** How long a refused screen track is given to show up at an observer before we accept that it never will. */
const FORWARDING_GRACE_MS = 5_000;

async function settleNewSession(page: Page): Promise<void> {
    await rejectToast(page, "Verify this device");
    await rejectToast(page, "Notifications");
    await closeReleaseAnnouncementIfExists(page, "Introducing Sections");
}

/**
 * The browser's fake screen capture comes with a system audio track that BabaCom rightly refuses, because it cannot
 * prove the track excludes the call's own playback. Tests share the way a user would after that error: without sound.
 * Runs in every frame, including Element Call's.
 */
function shareWithoutSound(): void {
    const devices = navigator.mediaDevices;
    if (!devices?.getDisplayMedia) return;
    const getDisplayMedia = devices.getDisplayMedia.bind(devices);
    devices.getDisplayMedia = (options?: DisplayMediaStreamOptions) =>
        getDisplayMedia({ ...options, audio: false, systemAudio: "exclude" } as DisplayMediaStreamOptions);
}

function callFrame(page: Page): FrameLocator {
    return page.frameLocator('iframe[title="Element Call"]');
}

interface OpenIdToken {
    access_token: string;
    token_type: string;
    matrix_server_name: string;
    expires_in: number;
}

/** A LiveKit client driven directly through the SDK, outside Element Call. */
interface RawClient {
    page: Page;
    identity: string;
    share(action: "claim" | "release"): Promise<{ status: number; body: unknown }>;
}

test.describe("BabaCom screen share arbitration", () => {
    test(
        "only one participant shares at a time, and the SFU refuses everyone else",
        { tag: ["@no-firefox", "@no-webkit"] },
        async ({ page, app, user, homeserver, browser, config, matrixRTCBackend }) => {
            test.setTimeout(300_000);
            await settleNewSession(page);
            await page.context().addInitScript(shareWithoutSound);
            const serviceUrl = matrixRTCBackend!.jwtService.baseUrl;
            const livekitUmd = path.join(
                callWidgetBuildRoot(),
                "element-call",
                "node_modules",
                "livekit-client",
                "dist",
                "livekit-client.umd.js",
            );

            const bob = await homeserver.registerUser("bob-screen-share", "password", "Bob");
            const bobContext = await browser.newContext({
                baseURL: new URL(page.url()).origin,
                permissions: ["microphone", "camera"],
            });
            await bobContext.addInitScript(shareWithoutSound);
            const bobPage = await bobContext.newPage();
            await routeConfigJson(bobContext, homeserver.baseUrl, config);
            await populateLocalStorageWithCredentials(bobPage, bob);

            const roomId = await app.client.createRoom({
                name: "Call room",
                invite: [bob.userId],
                power_level_content_override: { events: { "org.matrix.msc3401.call.member": 0 } },
            });
            await homeserver.csApi.request("POST", `/v3/join/${roomId}`, bob.accessToken, {});

            const openIdToken = async (userId: string, accessToken: string): Promise<OpenIdToken> =>
                (await homeserver.csApi.request(
                    "POST",
                    `/v3/user/${encodeURIComponent(userId)}/openid/request_token`,
                    accessToken,
                    {},
                )) as OpenIdToken;

            /** Joins the call's SFU room as a raw LiveKit client of `userId`, with its own device and member. */
            const rawClient = async (
                userId: string,
                accessToken: string,
                deviceId: string,
                memberId: string,
            ): Promise<RawClient> => {
                const member = { room_id: roomId, slot_id: SLOT_ID };
                const tokenResponse = await fetch(`${serviceUrl}/get_token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...member,
                        openid_token: await openIdToken(userId, accessToken),
                        member: { id: memberId, claimed_user_id: userId, claimed_device_id: deviceId },
                    }),
                });
                expect(tokenResponse.status).toBe(200);
                const { url, jwt } = (await tokenResponse.json()) as { url: string; jwt: string };
                const rawPage = await bobContext.newPage();
                // A real file from the app server: Chromium only lets pages it fetched from a local address reach the
                // local SFU, and config.json is answered by a Playwright route.
                await rawPage.goto("/widgets/element-call/babacom-call-widget.json");
                await rawPage.addScriptTag({ path: livekitUmd });
                const identity = await rawPage.evaluate(
                    async ({ url, jwt }) => {
                        const { Room } = (window as any).LivekitClient;
                        const room = new Room({ adaptiveStream: false, dynacast: false });
                        await room.connect(url, jwt, { autoSubscribe: true });
                        (window as any).room = room;
                        (window as any).livekitUrl = url;
                        return room.localParticipant.identity as string;
                    },
                    { url, jwt },
                );
                return {
                    page: rawPage,
                    identity,
                    share: async (action) => {
                        const response = await fetch(`${serviceUrl}/babacom/share/${action}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                ...member,
                                member_id: memberId,
                                device_id: deviceId,
                                // Claim and release of the same attempt.
                                attempt_id: `${memberId}-1`,
                                openid_token: await openIdToken(userId, accessToken),
                            }),
                        });
                        return { status: response.status, body: await response.json().catch(() => null) };
                    },
                };
            };

            /** Publishes a synthetic screen track, skipping livekit-client's own permission check. */
            const publishSyntheticScreen = async (client: RawClient): Promise<string> =>
                client.page.evaluate(async () => {
                    const { LocalVideoTrack, Track } = (window as any).LivekitClient;
                    const room = (window as any).room;
                    const canvas = document.createElement("canvas");
                    canvas.width = 320;
                    canvas.height = 180;
                    const context = canvas.getContext("2d")!;
                    let frame = 0;
                    setInterval(() => {
                        context.fillStyle = frame++ % 2 ? "#f00" : "#00f";
                        context.fillRect(0, 0, canvas.width, canvas.height);
                    }, 100);
                    const track = new LocalVideoTrack(canvas.captureStream(10).getVideoTracks()[0]);
                    // Only the SFU's own enforcement is under test here.
                    room.localParticipant.hasPermissionsToPublish = () => true;
                    try {
                        await room.localParticipant.publishTrack(track, { source: Track.Source.ScreenShare });
                        return "published";
                    } catch (e) {
                        return `refused: ${e}`;
                    }
                });

            /**
             * Whether `observer` receives a screen track within the grace period: from `identity`, or from anyone
             * when it is null.
             */
            const receivesScreenFrom = async (
                observer: RawClient,
                identity: string | null,
                graceMs = FORWARDING_GRACE_MS,
            ): Promise<boolean> =>
                observer.page.evaluate(
                    async ({ identity, graceMs }) => {
                        const { Track } = (window as any).LivekitClient;
                        const room = (window as any).room;
                        const deadline = Date.now() + graceMs;
                        while (Date.now() < deadline) {
                            for (const participant of room.remoteParticipants.values()) {
                                if (identity !== null && participant.identity !== identity) continue;
                                if (participant.getTrackPublication(Track.Source.ScreenShare)?.track) return true;
                            }
                            await new Promise((resolve) => setTimeout(resolve, 100));
                        }
                        return false;
                    },
                    { identity, graceMs },
                );

            // Bob is already looking at the room when the call starts
            await bobPage.goto(`/#/room/${roomId}`);
            await bobPage.waitForSelector(".mx_MatrixChat", { timeout: 30_000 });
            await settleNewSession(bobPage);
            await expect(bobPage.getByRole("heading", { name: "Call room", level: 1 })).toBeVisible();

            // Alice starts the call, Bob joins; both see two tiles with media. With the arbiter on, this also proves
            // that the service issues the LiveKit identities that Element Call expects.
            await app.viewRoomById(roomId);
            await expect(page.getByText("Bob joined the room")).toBeVisible();
            await page.getByRole("button", { name: "Video call" }).click();
            await page.getByRole("menuitem", { name: "Element Call" }).click();
            await expect(callFrame(page).getByTestId("lobby_joinCall")).toBeVisible({ timeout: 60_000 });
            await callFrame(page).getByTestId("lobby_joinCall").click();
            await bobPage.getByTestId("join-call-button").click();
            await expect(callFrame(bobPage).getByTestId("lobby_joinCall")).toBeVisible({ timeout: 60_000 });
            await callFrame(bobPage).getByTestId("lobby_joinCall").click();
            for (const p of [page, bobPage]) {
                await expect(callFrame(p).getByTestId("videoTile")).toHaveCount(2, { timeout: 30_000 });
            }

            // A raw observer in the same SFU room sees exactly what is forwarded.
            const observer = await rawClient(user.userId, user.accessToken, "OBSERVER", "observer");

            // N1, negative: a standard participant with a valid join token cannot publish a screen without a claim.
            const intruder = await rawClient(bob.userId, bob.accessToken, "RAW", "raw");
            await publishSyntheticScreen(intruder);
            expect(await receivesScreenFrom(observer, intruder.identity)).toBe(false);

            // N3 setup: the raw client holds the share once, so LiveKit hands it a token with screen rights.
            const intruderTokenBefore = await intruder.page.evaluate(() => (window as any).room.engine.token as string);
            expect((await intruder.share("claim")).body).toEqual({ state: "held" });
            const refreshedToken = await intruder.page.evaluate(async (before) => {
                const room = (window as any).room;
                const deadline = Date.now() + 30_000;
                while (Date.now() < deadline && room.engine.token === before) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
                return room.engine.token as string;
            }, intruderTokenBefore);
            const refreshedGrant = JSON.parse(Buffer.from(refreshedToken.split(".")[1], "base64url").toString());
            expect(refreshedGrant.video.canPublishSources).toContain("screen_share");
            expect((await intruder.share("release")).body).toEqual({ state: "free" });

            // N2, positive: Alice shares through the UI and Bob receives it.
            await callFrame(page).getByTestId("incall_screenshare").click();
            await expect(callFrame(bobPage).getByRole("button", { name: "Watch screen share" })).toBeVisible({
                timeout: 30_000,
            });
            // Positive control for the observer: it does receive a granted screen track.
            expect(await receivesScreenFrom(observer, null, 30_000)).toBe(true);

            // Contention: Bob's share button still works, but the service refuses and the UI says who is sharing.
            await callFrame(bobPage).getByTestId("incall_screenshare").click();
            await expect(
                callFrame(bobPage).getByText("Alice is sharing their screen. You can share once they stop."),
            ).toBeVisible({ timeout: 15_000 });
            await expect(callFrame(page).getByRole("button", { name: "Watch screen share" })).toHaveCount(0);

            // N3: rejoining with the token refreshed during the earlier share, the raw client's screen is still
            // refused while Alice holds the share.
            await intruder.page.evaluate(async (token) => {
                const { Room } = (window as any).LivekitClient;
                await (window as any).room.disconnect();
                const room = new Room({ adaptiveStream: false, dynacast: false });
                await room.connect((window as any).livekitUrl, token, { autoSubscribe: true });
                (window as any).room = room;
            }, refreshedToken);
            await publishSyntheticScreen(intruder);
            expect(await receivesScreenFrom(observer, intruder.identity)).toBe(false);

            // Stop, then takeover: Alice stops, and Bob can share; Alice receives it.
            await callFrame(page).getByTestId("incall_screenshare").click();
            await expect(callFrame(bobPage).getByRole("button", { name: "Watch screen share" })).toHaveCount(0, {
                timeout: 30_000,
            });
            await callFrame(bobPage).getByTestId("incall_screenshare").click();
            await expect(callFrame(page).getByRole("button", { name: "Watch screen share" })).toBeVisible({
                timeout: 30_000,
            });

            // Legitimate media stays: both still see each other's camera tiles next to the share.
            for (const p of [page, bobPage]) {
                for (const name of ["Alice", "Bob"]) {
                    await expect(callFrame(p).getByTestId("videoTile").filter({ hasText: name }).first()).toBeVisible();
                }
            }

            await bobContext.close();
        },
    );
});
