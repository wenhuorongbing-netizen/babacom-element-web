/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { expect, describe, it, beforeEach, afterEach, vi } from "vitest";
import { desktopCapturer, nativeImage, TouchBar } from "electron";

import { getConfig } from "./config.js";
import { setDisplayMediaCallback } from "./displayMediaCallback.js";
import { clearData } from "./store.js";

const { ipcHandlers, mockStore, send, randomArray } = vi.hoisted(() => ({
    ipcHandlers: {} as Record<string, (...args: unknown[]) => unknown>,
    mockStore: {
        isSecretUndecryptable: vi.fn<(key: string) => Promise<boolean>>(),
        setSecret: vi.fn<(key: string, secret: string) => Promise<void>>(),
        getSecret: vi.fn<(key: string) => Promise<string | undefined>>(),
        deleteSecret: vi.fn<(key: string) => Promise<void>>(),
        set: vi.fn<(key: string, value: unknown) => void>(),
        get: vi.fn<(key: string) => unknown>(),
    },
    send: vi.fn(),
    randomArray: vi.fn<(len: number) => Promise<string>>(),
}));

vi.mock("electron", () => ({
    app: { getVersion: vi.fn(() => "1.0.0") },
    autoUpdater: { getFeedURL: vi.fn() },
    desktopCapturer: { getSources: vi.fn() },
    ipcMain: {
        on: vi.fn((channel: string, cb: (...a: unknown[]) => unknown) => {
            ipcHandlers[channel] = cb;
        }),
        once: vi.fn((channel: string, cb: (...a: unknown[]) => unknown) => {
            ipcHandlers[channel] = cb;
        }),
        handle: vi.fn((channel: string, cb: (...a: unknown[]) => unknown) => {
            ipcHandlers[channel] = cb;
        }),
    },
    powerSaveBlocker: { isStarted: vi.fn(), start: vi.fn(), stop: vi.fn() },
    TouchBar: class {
        static TouchBarPopover = class {};
        static TouchBarButton = vi.fn(function () {});
    },
    nativeImage: { createFromBuffer: vi.fn() },
}));

vi.mock("./store.js", () => ({
    default: { instance: mockStore },
    clearData: vi.fn(),
    SafeStorageDecryptionError: class SafeStorageDecryptionError extends Error {},
}));
vi.mock("./utils.js", () => ({ randomArray }));
vi.mock("./config.js");

await import("./ipc.js");

const ARGS = ["@alice:example.org", "DEVICEID"];

async function callIpc(name: string, id = 1, args: unknown[] = ARGS): Promise<void> {
    await ipcHandlers["ipcCall"]({}, { id, name, args });
}

describe("ipc pickle key handling", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        randomArray.mockResolvedValue("GENERATEDKEY");
        (global as unknown as { mainWindow: unknown }).mainWindow = { webContents: { send } };
    });

    describe("createPickleKey", () => {
        it("refuses to overwrite an existing but undecryptable pickle key", async () => {
            mockStore.isSecretUndecryptable.mockResolvedValue(true);

            await callIpc("createPickleKey", 7);

            expect(mockStore.setSecret).not.toHaveBeenCalled();
            expect(send).toHaveBeenCalledWith("ipcReply", { id: 7, reply: null });
        });

        it("creates and stores a new pickle key when none is present", async () => {
            mockStore.isSecretUndecryptable.mockResolvedValue(false);

            await callIpc("createPickleKey", 8);

            expect(mockStore.setSecret).toHaveBeenCalledWith("@alice:example.org|DEVICEID", "GENERATEDKEY");
            expect(send).toHaveBeenCalledWith("ipcReply", { id: 8, reply: "GENERATEDKEY" });
        });
    });

    describe("getPickleKey", () => {
        it("returns null when getSecret throws", async () => {
            mockStore.getSecret.mockRejectedValue(new Error("safeStorage unavailable"));

            await callIpc("getPickleKey", 9);

            expect(send).toHaveBeenCalledWith("ipcReply", { id: 9, reply: null });
        });

        it("returns null when the secret is present but cannot be decrypted", async () => {
            const { SafeStorageDecryptionError } = await import("./store.js");
            mockStore.getSecret.mockRejectedValue(
                new SafeStorageDecryptionError("Failed to decrypt safeStorage secret"),
            );

            await callIpc("getPickleKey", 10);

            expect(send).toHaveBeenCalledWith("ipcReply", { id: 10, reply: null });
        });
    });
});

describe("getConfig", () => {
    it("should call config.getConfig and return the value", async () => {
        const config = { brand: "BRAND", help_url: "HELP_URL", web_base_url: "WEB_BASE_URL" };
        vi.mocked(getConfig).mockReturnValue(config);

        const handler = ipcHandlers["getConfig"];
        expect(handler).toBeDefined();

        expect(handler({})).toStrictEqual(config);
        expect(getConfig).toHaveBeenCalled();
    });
});

describe("ipcCall: getDesktopCapturerSources", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(desktopCapturer.getSources).mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
        (global as unknown as { mainWindow: unknown }).mainWindow = { webContents: { send } };
    });

    afterEach(() => {
        vi.mocked(console.error).mockRestore();
    });

    it("maps the native sources to id/name/thumbnailURL", async () => {
        vi.mocked(desktopCapturer.getSources).mockResolvedValue([
            { id: "screen:1", name: "Screen 1", thumbnail: { toDataURL: (): string => "data:thumb" } },
        ] as never);

        await callIpc("getDesktopCapturerSources", 11, [{ types: ["screen"] }]);

        expect(send).toHaveBeenCalledWith("ipcReply", {
            id: 11,
            reply: [{ id: "screen:1", name: "Screen 1", thumbnailURL: "data:thumb" }],
        });
    });

    it("replies with an empty list rather than leaving the picker awaiting when getSources rejects", async () => {
        vi.mocked(desktopCapturer.getSources).mockRejectedValue(new Error("native failure"));

        await callIpc("getDesktopCapturerSources", 12, [{}]);

        expect(send).toHaveBeenCalledWith("ipcReply", { id: 12, reply: [] });
    });
});

describe("ipcCall: clearStorage", () => {
    const session = { flushStorageData: vi.fn(), clearStorageData: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(clearData).mockReset();
        (global as unknown as { mainWindow: unknown }).mainWindow = { webContents: { send, session } };
    });

    it("clears data for the window's session without relaunching", async () => {
        await callIpc("clearStorage", 15, []);

        expect(clearData).toHaveBeenCalledExactlyOnceWith(session);
        expect(send).toHaveBeenCalledWith("ipcReply", { id: 15, reply: null });
    });
});

describe("ipcCall: breadcrumbs", () => {
    const session = { fetch: vi.fn<typeof fetch>() };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
        vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
        (global as unknown as { mainWindow: unknown }).mainWindow = {
            webContents: { send, session },
            setTouchBar: vi.fn(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("loads avatars through the window session so authenticated media interception applies", async () => {
        const avatarUrl = "https://example.org/_matrix/media/v3/thumbnail/example.org/avatar";
        const bytes = new Uint8Array([1, 2, 3]);
        session.fetch.mockResolvedValue(new Response(bytes));
        const icon = {} as Electron.NativeImage;
        vi.mocked(nativeImage.createFromBuffer).mockReturnValue(icon);

        await callIpc("breadcrumbs", 16, [
            [
                { roomId: "!room:example.org", avatarUrl, initial: "R" },
                { roomId: "!no-avatar:example.org", avatarUrl: null, initial: "N" },
            ],
        ]);

        expect(session.fetch).toHaveBeenCalledExactlyOnceWith(avatarUrl);
        expect(global.fetch).not.toHaveBeenCalled();
        await vi.waitFor(() => {
            expect(nativeImage.createFromBuffer).toHaveBeenCalledExactlyOnceWith(Buffer.from(bytes));
            expect(vi.mocked(TouchBar.TouchBarButton).mock.instances[0]).toMatchObject({ icon, label: "" });
        });
    });
});

describe("ipcCall: callDisplayMediaCallback", () => {
    const source = { id: "screen:1", name: "Screen 1", thumbnail: { toDataURL: () => "data:thumb" } };
    const canceled = { video: { id: "", name: "" } };
    const trustedRoomId = "!room:example.org";

    beforeEach(() => {
        vi.clearAllMocks();
        setDisplayMediaCallback(null);
        vi.spyOn(process, "platform", "get").mockReturnValue("win32");
        vi.mocked(desktopCapturer.getSources).mockResolvedValue([source] as never);
        (global as unknown as { mainWindow: unknown }).mainWindow = { webContents: { send } };
    });

    afterEach(() => {
        setDisplayMediaCallback(null);
        vi.restoreAllMocks();
    });

    it.each([true, false, undefined, "true", 1])(
        "only grants system audio for explicit true consent: %s",
        async (consent) => {
            const callback = vi.fn();
            const request = setDisplayMediaCallback(callback, true, trustedRoomId)!;
            await callIpc("callDisplayMediaCallback", 13, [{ ...request, source, shareSystemAudio: consent }]);

            expect(callback).toHaveBeenCalledExactlyOnceWith(
                consent === true ? { video: source, audio: "loopback" } : { video: source },
            );
            expect(send).toHaveBeenCalledWith("ipcReply", { id: 13, reply: null });
        },
    );

    it("does not grant audio for a forged IPC selection without a trusted room", async () => {
        const callback = vi.fn();
        const request = setDisplayMediaCallback(callback, true)!;
        await callIpc("callDisplayMediaCallback", 13, [
            {
                ...request,
                source,
                shareSystemAudio: true,
                canShareSystemAudio: true,
                elementCallRoomId: trustedRoomId,
            },
        ]);

        expect(callback).toHaveBeenCalledExactlyOnceWith({ video: source });
    });

    it.each([
        ["win32", false],
        ["darwin", true],
        ["linux", true],
    ] as const)("does not grant audio on %s with original audioRequested=%s", async (platform, audioRequested) => {
        vi.spyOn(process, "platform", "get").mockReturnValue(platform);
        const callback = vi.fn();
        const request = setDisplayMediaCallback(callback, audioRequested, trustedRoomId)!;
        await callIpc("callDisplayMediaCallback", 13, [
            { ...request, source, shareSystemAudio: true, canShareSystemAudio: true },
        ]);

        expect(callback).toHaveBeenCalledExactlyOnceWith({ video: source });
    });

    it.each([undefined, null, {}, { id: "" }, { id: 1 }, { id: "screen:missing" }])(
        "rejects a canceled or invalid source without audio: %j",
        async (invalidSource) => {
            const callback = vi.fn();
            const request = setDisplayMediaCallback(callback, true, trustedRoomId)!;
            await callIpc("callDisplayMediaCallback", 13, [
                { ...request, source: invalidSource, shareSystemAudio: true },
            ]);

            expect(callback).toHaveBeenCalledExactlyOnceWith(canceled);
        },
    );

    it("resolves duplicate replies only once", async () => {
        const callback = vi.fn();
        const request = setDisplayMediaCallback(callback, true, trustedRoomId)!;
        const selection = { ...request, source, shareSystemAudio: true };
        await callIpc("callDisplayMediaCallback", 13, [selection]);
        await callIpc("callDisplayMediaCallback", 14, [selection]);

        expect(callback).toHaveBeenCalledExactlyOnceWith({ video: source, audio: "loopback" });
        expect(send).toHaveBeenCalledWith("ipcReply", { id: 14, reply: null });
    });

    it("does not let a late previous reply or malformed ID consume the current request", async () => {
        const firstCallback = vi.fn();
        const first = setDisplayMediaCallback(firstCallback, true)!;
        const secondCallback = vi.fn();
        const second = setDisplayMediaCallback(secondCallback, true)!;
        await callIpc("callDisplayMediaCallback", 13, [{ ...first, source, shareSystemAudio: true }]);
        await callIpc("callDisplayMediaCallback", 14, [{ source, shareSystemAudio: true }]);

        expect(firstCallback).toHaveBeenCalledExactlyOnceWith(canceled);
        expect(secondCallback).not.toHaveBeenCalled();
        await callIpc("callDisplayMediaCallback", 15, [{ ...second, source, shareSystemAudio: false }]);
        expect(secondCallback).toHaveBeenCalledExactlyOnceWith({ video: source });
    });

    it("does not grant an older request that is superseded while validating sources", async () => {
        const sources = Promise.withResolvers<Electron.DesktopCapturerSource[]>();
        vi.mocked(desktopCapturer.getSources).mockReturnValue(sources.promise);
        const firstCallback = vi.fn();
        const first = setDisplayMediaCallback(firstCallback, true)!;
        const pendingReply = callIpc("callDisplayMediaCallback", 13, [{ ...first, source, shareSystemAudio: true }]);
        const secondCallback = vi.fn();
        const second = setDisplayMediaCallback(secondCallback, true)!;
        sources.resolve([source] as never);
        await pendingReply;

        expect(firstCallback).toHaveBeenCalledExactlyOnceWith(canceled);
        expect(secondCallback).not.toHaveBeenCalled();
        await callIpc("callDisplayMediaCallback", 14, [{ ...second, source, shareSystemAudio: false }]);
        expect(secondCallback).toHaveBeenCalledExactlyOnceWith({ video: source });
    });

    it("rejects the request when source enumeration fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(desktopCapturer.getSources).mockRejectedValue(new Error("native failure"));
        const callback = vi.fn();
        const request = setDisplayMediaCallback(callback, true)!;
        await callIpc("callDisplayMediaCallback", 13, [{ ...request, source, shareSystemAudio: true }]);

        expect(callback).toHaveBeenCalledExactlyOnceWith(canceled);
    });
});
