/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { Streams } from "electron";
import { randomUUID } from "node:crypto";
import type { DesktopCaptureRequest } from "shared-types";

type DisplayMediaCallback = (streams: Streams) => void;

interface PendingDisplayMediaRequest extends DesktopCaptureRequest {
    callback: DisplayMediaCallback;
}

let pendingRequest: PendingDisplayMediaRequest | null = null;

/** Extract the call destination from a packaged widget frame, without forwarding the URL. */
export function getEmbeddedCallRoomId(frameUrl?: string): string | undefined {
    const url = frameUrl && URL.parse(frameUrl);
    if (
        !url ||
        url.protocol !== "vector:" ||
        url.host !== "vector" ||
        url.pathname !== "/webapp/widgets/element-call/" ||
        !url.hash.startsWith("#?")
    ) {
        return undefined;
    }

    const roomIds = new URLSearchParams(url.hash.slice(2)).getAll("roomId");
    return roomIds.length === 1 && roomIds[0].startsWith("!") ? roomIds[0] : undefined;
}

/** Register a renderer picker request, rejecting any previous unresolved request. */
export const setDisplayMediaCallback = (
    callback: DisplayMediaCallback | null,
    audioRequested = false,
    elementCallRoomId?: string,
): DesktopCaptureRequest | null => {
    const previousRequest = pendingRequest;
    pendingRequest = null;
    // Keep the dummy video source so Electron settles a canceled getDisplayMedia promise.
    previousRequest?.callback({ video: { id: "", name: "" } });
    if (!callback) return null;

    const request = {
        requestId: randomUUID(),
        canShareSystemAudio: process.platform === "win32" && audioRequested === true && !!elementCallRoomId,
        ...(elementCallRoomId ? { elementCallRoomId } : {}),
    };
    pendingRequest = { ...request, callback };
    return request;
};

/**
 * Atomically consume the matching request once. A stale picker reply must not
 * consume a newer request or reuse its audio eligibility.
 */
export const consumeDisplayMediaCallback = (requestId: string): PendingDisplayMediaRequest | null => {
    if (pendingRequest?.requestId !== requestId) return null;
    const request = pendingRequest;
    pendingRequest = null;
    return request;
};
