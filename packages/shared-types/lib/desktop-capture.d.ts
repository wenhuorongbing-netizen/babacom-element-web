/*
Copyright 2026 BabaCom contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** Main-process request for a display source and optional system audio consent. */
export interface DesktopCaptureRequest {
    requestId: string;
    canShareSystemAudio: boolean;
    /** Present for requests originating in the packaged Element Call widget. */
    elementCallRoomId?: string;
}

/** Renderer response bound to the picker request that the user completed. */
export interface DesktopCaptureSelection {
    requestId: string;
    source?: {
        id: string;
        name: string;
        thumbnailURL: string;
    };
    shareSystemAudio: boolean;
}
