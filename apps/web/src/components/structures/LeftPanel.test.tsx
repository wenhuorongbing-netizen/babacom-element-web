/*
 * Copyright 2026 Jack
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

// @vitest-environment jsdom
import React from "react";
import { type ListenerMap, type Room, RoomEvent, TypedEventEmitter } from "matrix-js-sdk/src/matrix";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LeftPanel from "./LeftPanel";
import type ResizeNotifier from "../../utils/ResizeNotifier";
import { render, screen } from "test-utils-rtl";
import { CallEvent, ConnectionState, type ElementCall } from "../../models/Call";
import { CallStore, CallStoreEvent } from "../../stores/CallStore";
import PlatformPeg from "../../PlatformPeg";

const mocks = vi.hoisted(() => ({
    spaceStore: { activeSpace: null, on: vi.fn(), off: vi.fn() },
    client: { getRoom: vi.fn() },
}));

vi.mock("../../contexts/SDKContext.ts", async () => {
    const React = await vi.importActual<typeof import("react")>("react");
    return { SDKContext: React.createContext({ spaceStore: mocks.spaceStore }) };
});

vi.mock("../../contexts/MatrixClientContext", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../contexts/MatrixClientContext")>()),
    useMatrixClientContext: () => mocks.client,
}));

vi.mock("../views/rooms/RoomListPanel", () => ({ RoomListPanel: () => null }));

type FakeEvents = CallEvent | RoomEvent;
type FakeHandlerMap = ListenerMap<FakeEvents>;

/** Fake calls and rooms share one typed emitter so listener counts can be checked. */
function fakeEmitter(): TypedEventEmitter<FakeEvents, FakeHandlerMap> {
    return new TypedEventEmitter<FakeEvents, FakeHandlerMap>();
}

function mockCall(roomId: string): ElementCall {
    return Object.assign(fakeEmitter(), {
        roomId,
        connectionState: ConnectionState.Connected,
        microphoneState: { enabled: false, pending: false, error: false },
        toggleMicrophone: vi.fn(),
        disconnect: vi.fn().mockResolvedValue(undefined),
    }) as unknown as ElementCall;
}

function mockRoom(name: string): Room {
    return Object.assign(fakeEmitter(), { name }) as unknown as Room;
}

type Platform = ReturnType<typeof PlatformPeg.get>;

const platformWith = (supportsDesktopCapturer: boolean | undefined): Platform =>
    ({ supportsDesktopCapturer: () => supportsDesktopCapturer }) as unknown as Platform;

describe("LeftPanel", () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([
        { label: "Web active call", electron: false, hasCall: true },
        { label: "Electron active call", electron: true, hasCall: true },
        { label: "Web without a call", electron: false, hasCall: false },
        { label: "Electron without a call", electron: true, hasCall: false },
    ])("renders the expected voice controls for $label", ({ electron, hasCall }) => {
        const call = mockCall("!voice:example.org");
        const room = mockRoom("Voice room");
        const store = CallStore.instance;
        const before = {
            microphone: call.listenerCount(CallEvent.MicrophoneState),
            connection: call.listenerCount(CallEvent.ConnectionState),
            roomName: room.listenerCount(RoomEvent.Name),
            connectedCalls: store.listenerCount(CallStoreEvent.ConnectedCalls),
        };
        vi.spyOn(PlatformPeg, "get").mockReturnValue(platformWith(electron));
        vi.spyOn(store, "getActiveElementCall").mockReturnValue(hasCall ? call : undefined);
        mocks.client.getRoom.mockReturnValue(room);

        const originalElectronDescriptor = Object.getOwnPropertyDescriptor(window, "electron");
        Reflect.deleteProperty(window, "electron");
        if (electron) Object.defineProperty(window, "electron", { configurable: true, value: {} });

        let unmount: () => void = () => {};
        try {
            ({ unmount } = render(<LeftPanel isMinimized={false} resizeNotifier={{} as ResizeNotifier} />));
            const notice = screen.queryByText(
                "System audio sharing depends on your browser. If sound sharing fails, share your screen without sound.",
            );
            if (hasCall) {
                expect(screen.getByRole("button", { name: "Voice room" })).toBeVisible();
                expect(call.listenerCount(CallEvent.MicrophoneState)).toBeGreaterThan(before.microphone);
                expect(call.listenerCount(CallEvent.ConnectionState)).toBeGreaterThan(before.connection);
                expect(room.listenerCount(RoomEvent.Name)).toBeGreaterThan(before.roomName);
                expect(mocks.client.getRoom).toHaveBeenCalledWith(call.roomId);
            } else {
                expect(screen.queryByRole("region")).toBeNull();
                expect(screen.queryByRole("button")).toBeNull();
                expect(mocks.client.getRoom).not.toHaveBeenCalled();
            }
            if (hasCall && !electron) expect(notice).toBeVisible();
            else expect(notice).toBeNull();
            expect(store.listenerCount(CallStoreEvent.ConnectedCalls)).toBeGreaterThan(before.connectedCalls);
        } finally {
            unmount();
            if (originalElectronDescriptor) {
                Object.defineProperty(window, "electron", originalElectronDescriptor);
            } else {
                Reflect.deleteProperty(window, "electron");
            }
            vi.restoreAllMocks();
        }
        expect(call.listenerCount(CallEvent.MicrophoneState)).toBe(before.microphone);
        expect(call.listenerCount(CallEvent.ConnectionState)).toBe(before.connection);
        expect(room.listenerCount(RoomEvent.Name)).toBe(before.roomName);
        expect(store.listenerCount(CallStoreEvent.ConnectedCalls)).toBe(before.connectedCalls);
    });
});
