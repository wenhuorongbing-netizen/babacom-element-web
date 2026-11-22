/*
 * Copyright 2026 Jack
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX, useId } from "react";
import { IconButton, Text } from "@vector-im/compound-web";
import {
    EndCallIcon,
    MicOffSolidIcon,
    MicOnSolidIcon,
    ShareScreenIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { type ViewModel, useViewModel } from "../../core/viewmodel";
import styles from "./VoiceControlView.module.css";

/** Display state for the current voice call, independent of the room being browsed. */
export interface VoiceControlViewSnapshot {
    roomName: string | null;
    connectionLabel: string;
    microphoneLabel: string;
    microphoneEnabled: boolean | null;
    microphoneStatus: string;
    microphonePending: boolean;
    shareLabel: string;
    leaveLabel: string;
    leavePending: boolean;
    platformNotice?: string;
}

interface VoiceControlViewActions {
    openCall: () => void;
    toggleMicrophone: () => void;
    leaveCall: () => void;
}

/** The persistent voice controls' data and actions. */
export type VoiceControlViewModel = ViewModel<VoiceControlViewSnapshot> & VoiceControlViewActions;

/** Controls the active voice call from the sidebar. */
export function VoiceControlView({ vm }: { vm: VoiceControlViewModel }): JSX.Element | null {
    const state = useViewModel(vm);
    const platformNoticeId = useId();
    if (state.roomName === null) return null;

    return (
        <section className={styles.bar} aria-label={state.roomName}>
            <div className={styles.heading}>
                <button className={styles.room} type="button" onClick={() => vm.openCall()} title={state.roomName}>
                    {state.roomName}
                </button>
                <Text as="span" size="sm" weight="regular" className={styles.status} role="status">
                    {state.connectionLabel}
                </Text>
            </div>
            <div className={styles.controls}>
                <IconButton
                    size="28px"
                    kind="secondary"
                    tooltip={state.microphoneLabel}
                    aria-keyshortcuts="Control+Shift+M"
                    onClick={() => vm.toggleMicrophone()}
                    disabled={state.microphonePending || state.leavePending}
                >
                    {state.microphoneEnabled === true ? <MicOnSolidIcon /> : <MicOffSolidIcon />}
                </IconButton>
                <IconButton
                    size="28px"
                    kind="secondary"
                    tooltip={state.shareLabel}
                    aria-describedby={state.platformNotice ? platformNoticeId : undefined}
                    onClick={() => vm.openCall()}
                    disabled={state.leavePending}
                >
                    <ShareScreenIcon />
                </IconButton>
                <IconButton
                    size="28px"
                    kind="secondary"
                    tooltip={state.leaveLabel}
                    onClick={() => vm.leaveCall()}
                    disabled={state.leavePending}
                >
                    <EndCallIcon />
                </IconButton>
                <Text as="span" size="sm" weight="regular" className={styles.status} role="status">
                    {state.microphoneStatus}
                </Text>
            </div>
            {state.platformNotice && (
                <Text as="span" size="sm" weight="regular" className={styles.status} id={platformNoticeId}>
                    {state.platformNotice}
                </Text>
            )}
        </section>
    );
}
