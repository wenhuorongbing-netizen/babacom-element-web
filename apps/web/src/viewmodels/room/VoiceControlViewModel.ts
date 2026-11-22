/*
 * Copyright 2026 Jack
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import {
    BaseViewModel,
    Disposables,
    type VoiceControlViewModel as VoiceControlViewModelContract,
    type VoiceControlViewSnapshot,
} from "@element-hq/web-shared-components";
import { type MatrixClient, type Room, RoomEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { CallEvent, ConnectionState, type ElementCall } from "../../models/Call";
import { CallStore, CallStoreEvent } from "../../stores/CallStore";
import { _t } from "../../languageHandler";
import { Action } from "../../dispatcher/actions";
import defaultDispatcher from "../../dispatcher/dispatcher";
import { type ViewRoomPayload } from "../../dispatcher/payloads/ViewRoomPayload";
import PlatformPeg from "../../PlatformPeg";

interface Props {
    client: Pick<MatrixClient, "getRoom">;
}

/** Binds the sidebar to the active call even when the user navigates elsewhere. */
export class VoiceControlViewModel
    extends BaseViewModel<VoiceControlViewSnapshot, Props>
    implements VoiceControlViewModelContract
{
    private call?: ElementCall;
    private room?: Room | null;
    private callDisposables?: Disposables;
    private leaving = false;
    private leaveFailed = false;

    public constructor(props: Props) {
        super(props, {
            roomName: null,
            connectionLabel: "",
            microphoneLabel: "",
            microphoneEnabled: null,
            microphoneStatus: "",
            microphonePending: false,
            shareLabel: _t("voip|voice_bar_open_to_share"),
            leaveLabel: _t("voip|voice_bar_leave"),
            leavePending: false,
            platformNotice:
                PlatformPeg.get()?.supportsDesktopCapturer() === false
                    ? _t("voip|voice_bar_browser_notice")
                    : undefined,
        });
        this.disposables.trackListener(CallStore.instance, CallStoreEvent.ConnectedCalls, this.updateActiveCall);
        this.disposables.track(() => this.callDisposables?.dispose());
        this.updateActiveCall();
    }

    public openCall = (): void => {
        if (!this.call) return;
        defaultDispatcher.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: this.call.roomId,
            view_call: true,
            metricsTrigger: "RoomList",
        });
    };

    public toggleMicrophone = (): void => this.call?.toggleMicrophone();

    public leaveCall = (): void => {
        const call = this.call;
        if (!call || this.snapshot.current.leavePending) return;
        this.leaving = true;
        this.leaveFailed = false;
        this.updateStatus();
        void call.disconnect().catch((error: unknown) => {
            if (this.call !== call || this.isDisposed) return;
            logger.warn("Could not leave the voice call", error);
            this.leaving = false;
            this.leaveFailed = true;
            this.updateStatus();
        });
    };

    private readonly updateActiveCall = (): void => {
        const nextCall = CallStore.instance.getActiveElementCall();
        if (nextCall !== this.call) {
            this.callDisposables?.dispose();
            this.callDisposables = undefined;
            this.call = nextCall;
            this.room = nextCall ? this.props.client.getRoom(nextCall.roomId) : null;
            this.leaving = false;
            this.leaveFailed = false;
            if (nextCall) {
                const listeners = (this.callDisposables = new Disposables());
                listeners.trackListener(nextCall, CallEvent.ConnectionState, this.updateStatus);
                listeners.trackListener(nextCall, CallEvent.MicrophoneState, this.updateStatus);
                if (this.room) listeners.trackListener(this.room, RoomEvent.Name, this.updateStatus);
            }
        }
        this.updateStatus();
    };

    private readonly updateStatus = (): void => {
        const call = this.call;
        if (!call) {
            this.snapshot.merge({ roomName: null });
            return;
        }
        const { enabled, pending, error } = call.microphoneState;
        const disconnecting = this.leaving || call.connectionState === ConnectionState.Disconnecting;
        let connectionLabel = _t("voip|voice_bar_connected");
        if (this.leaveFailed) connectionLabel = _t("voip|voice_bar_disconnect_failed");
        else if (disconnecting) connectionLabel = _t("voip|voice_bar_disconnecting");

        let microphoneStatus = _t("voip|microphone_state_unknown");
        if (error) microphoneStatus = _t("voip|microphone_change_failed");
        else if (pending) microphoneStatus = _t("voip|microphone_pending");
        else if (enabled === true) microphoneStatus = _t("voip|microphone_on");
        else if (enabled === false) microphoneStatus = _t("voip|microphone_off");

        this.snapshot.merge({
            roomName: this.room?.name ?? call.roomId,
            connectionLabel,
            microphoneLabel: _t(enabled === false ? "voip|enable_microphone" : "voip|disable_microphone"),
            microphoneEnabled: enabled,
            microphoneStatus,
            microphonePending: pending,
            leavePending: disconnecting && !this.leaveFailed,
        });
    };
}
