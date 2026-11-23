/*
Copyright 2026 hayaksi1

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeDisplayMediaCallback, getEmbeddedCallRoomId, setDisplayMediaCallback } from "./displayMediaCallback.js";

describe("displayMediaCallback", () => {
    beforeEach(() => {
        setDisplayMediaCallback(null);
        vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    });

    afterEach(() => {
        setDisplayMediaCallback(null);
        vi.restoreAllMocks();
    });

    it("starts empty", () => {
        expect(consumeDisplayMediaCallback("missing")).toBeNull();
    });

    it("only binds desktop capture requests from the packaged Element Call frame", () => {
        const fragment = "#?roomId=%21voice%3Aexample.org";
        expect(getEmbeddedCallRoomId("vector://vector/webapp/widgets/element-call/" + fragment)).toBe(
            "!voice:example.org",
        );
        expect(getEmbeddedCallRoomId("https://vector/webapp/widgets/element-call/" + fragment)).toBeUndefined();
        expect(getEmbeddedCallRoomId("vector://vector/webapp/elsewhere/" + fragment)).toBeUndefined();
        expect(
            getEmbeddedCallRoomId("vector://vector/webapp/widgets/element-call/" + fragment + "&roomId=other"),
        ).toBeUndefined();
    });

    it("carries the packaged call room on the single picker request", () => {
        const request = setDisplayMediaCallback(vi.fn(), true, "!voice:example.org")!;
        expect(request.elementCallRoomId).toBe("!voice:example.org");
        expect(consumeDisplayMediaCallback(request.requestId)?.elementCallRoomId).toBe("!voice:example.org");
    });
    it("returns the stored callback once, then clears it (consume-once)", () => {
        const callback = (): void => {};
        const request = setDisplayMediaCallback(callback, true)!;

        expect(consumeDisplayMediaCallback(request.requestId)?.callback).toBe(callback);
        expect(consumeDisplayMediaCallback(request.requestId)).toBeNull();
    });

    it("setDisplayMediaCallback(null) clears a pending callback", () => {
        const callback = vi.fn();
        const request = setDisplayMediaCallback(callback, true)!;
        setDisplayMediaCallback(null);

        expect(callback).toHaveBeenCalledExactlyOnceWith({ video: { id: "", name: "" } });
        expect(consumeDisplayMediaCallback(request.requestId)).toBeNull();
    });

    it("cancels the previous request and does not let its late result consume the new request", () => {
        const firstCallback = vi.fn();
        const first = setDisplayMediaCallback(firstCallback, true)!;
        const secondCallback = vi.fn();
        const second = setDisplayMediaCallback(secondCallback, false)!;

        expect(firstCallback).toHaveBeenCalledExactlyOnceWith({ video: { id: "", name: "" } });
        expect(first.requestId).not.toBe(second.requestId);
        expect(consumeDisplayMediaCallback(first.requestId)).toBeNull();
        expect(secondCallback).not.toHaveBeenCalled();
        expect(consumeDisplayMediaCallback(second.requestId)).toMatchObject({
            callback: secondCallback,
            canShareSystemAudio: false,
        });
    });

    it.each([
        ["win32", true, true],
        ["win32", false, false],
        ["darwin", true, false],
        ["linux", true, false],
    ] as const)("offers system audio on %s with audioRequested=%s: %s", (platform, audioRequested, expected) => {
        vi.spyOn(process, "platform", "get").mockReturnValue(platform);
        const request = setDisplayMediaCallback(() => {}, audioRequested, "!voice:example.org")!;

        expect(request.canShareSystemAudio).toBe(expected);
    });

    it.each([
        undefined,
        "https://app.element.io/#/room/!voice:example.org",
        "vector://vector/webapp/#?roomId=!voice:example.org",
        "vector://vector/webapp/widgets/element-call/#?roomId=voice:example.org",
        "vector://vector/webapp/widgets/element-call/#?roomId=!a:example.org&roomId=!b:example.org",
    ])("keeps system audio off without a trusted Call room (%s)", (frameUrl) => {
        const elementCallRoomId = getEmbeddedCallRoomId(frameUrl);
        expect(elementCallRoomId).toBeUndefined();
        const request = setDisplayMediaCallback(() => {}, true, elementCallRoomId)!;
        expect(request.canShareSystemAudio).toBe(false);
        expect(request.elementCallRoomId).toBeUndefined();
    });

    it("never reuses a request ID after cancellation", () => {
        const first = setDisplayMediaCallback(() => {}, true)!;
        setDisplayMediaCallback(null);
        const second = setDisplayMediaCallback(() => {}, true)!;

        expect(second.requestId).not.toBe(first.requestId);
        expect(consumeDisplayMediaCallback(first.requestId)).toBeNull();
        expect(consumeDisplayMediaCallback(second.requestId)).not.toBeNull();
    });
});
