/*
 * Copyright 2026 Jack
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

// @vitest-environment jsdom
import { type ListenerMap, type Room, RoomEvent, TypedEventEmitter } from "matrix-js-sdk/src/matrix";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VoiceControlViewModel } from "./VoiceControlViewModel";
import { CallEvent, ConnectionState, type ElementCall } from "../../models/Call";
import { CallStore, CallStoreEvent } from "../../stores/CallStore";
import dispatcher from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { _t } from "../../languageHandler";
import PlatformPeg from "../../PlatformPeg";

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

/** An absent platform makes the optional chain evaluate to undefined. */
const absentPlatform = undefined as unknown as Platform;

describe("VoiceControlViewModel", () => {
    afterEach(() => vi.restoreAllMocks());

    it("controls the connected voice room and detaches from the previous call", () => {
        const voice = mockCall("!voice:example.org");
        const next = mockCall("!next:example.org");
        const room = mockRoom("Voice room");
        const client = { getRoom: vi.fn().mockReturnValue(room) };
        const store = CallStore.instance;
        const before = {
            voiceMic: voice.listenerCount(CallEvent.MicrophoneState),
            nextMic: next.listenerCount(CallEvent.MicrophoneState),
            nextConn: next.listenerCount(CallEvent.ConnectionState),
            roomName: room.listenerCount(RoomEvent.Name),
            connectedCalls: store.listenerCount(CallStoreEvent.ConnectedCalls),
        };
        const getActiveCall = vi.spyOn(store, "getActiveElementCall").mockReturnValue(voice);
        const dispatch = vi.spyOn(dispatcher, "dispatch").mockImplementation(() => {});
        const vm = new VoiceControlViewModel({ client });

        try {
            expect(vm.getSnapshot().roomName).toBe("Voice room");
            vm.openCall();
            expect(dispatch).toHaveBeenCalledWith(
                expect.objectContaining({ action: Action.ViewRoom, room_id: voice.roomId, view_call: true }),
            );
            vm.toggleMicrophone();
            expect(voice.toggleMicrophone).toHaveBeenCalledTimes(1);

            getActiveCall.mockReturnValue(next);
            store.emit(CallStoreEvent.ConnectedCalls, new Set([next]), new Set([voice]));
            vm.toggleMicrophone();
            expect(next.toggleMicrophone).toHaveBeenCalledTimes(1);
            expect(voice.listenerCount(CallEvent.MicrophoneState)).toBe(before.voiceMic);

            getActiveCall.mockReturnValue(undefined);
            store.emit(CallStoreEvent.ConnectedCalls, new Set(), new Set([next]));
            expect(vm.getSnapshot().roomName).toBeNull();
        } finally {
            vm.dispose();
        }
        expect(next.listenerCount(CallEvent.MicrophoneState)).toBe(before.nextMic);
        expect(next.listenerCount(CallEvent.ConnectionState)).toBe(before.nextConn);
        expect(room.listenerCount(RoomEvent.Name)).toBe(before.roomName);
        expect(store.listenerCount(CallStoreEvent.ConnectedCalls)).toBe(before.connectedCalls);
    });

    it.each([
        { label: "no desktop capturer", platform: platformWith(false), expectNotice: true },
        { label: "desktop capturer", platform: platformWith(true), expectNotice: false },
        { label: "no platform", platform: absentPlatform, expectNotice: false },
    ])("sets the platform notice when $label", ({ platform, expectNotice }) => {
        const call = mockCall("!voice:example.org");
        const room = mockRoom("Voice room");
        const store = CallStore.instance;
        const before = {
            microphone: call.listenerCount(CallEvent.MicrophoneState),
            connection: call.listenerCount(CallEvent.ConnectionState),
            roomName: room.listenerCount(RoomEvent.Name),
            connectedCalls: store.listenerCount(CallStoreEvent.ConnectedCalls),
        };
        vi.spyOn(PlatformPeg, "get").mockReturnValue(platform);
        vi.spyOn(store, "getActiveElementCall").mockReturnValue(call);
        const vm = new VoiceControlViewModel({ client: { getRoom: vi.fn().mockReturnValue(room) } });

        try {
            expect(vm.getSnapshot().platformNotice).toBe(
                expectNotice ? _t("voip|voice_bar_browser_notice") : undefined,
            );
        } finally {
            vm.dispose();
        }
        expect(call.listenerCount(CallEvent.MicrophoneState)).toBe(before.microphone);
        expect(call.listenerCount(CallEvent.ConnectionState)).toBe(before.connection);
        expect(room.listenerCount(RoomEvent.Name)).toBe(before.roomName);
        expect(store.listenerCount(CallStoreEvent.ConnectedCalls)).toBe(before.connectedCalls);
    });
});
