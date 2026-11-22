/*
 * Copyright 2026 Jack
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type ComponentProps } from "react";
import { type Meta, type StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { VoiceControlView, type VoiceControlViewSnapshot } from "./VoiceControlView";
import { useMockedViewModel } from "../../core/viewmodel";

type Props = VoiceControlViewSnapshot &
    Pick<ComponentProps<typeof VoiceControlView>["vm"], "openCall" | "toggleMicrophone" | "leaveCall">;

const Wrapper = ({ openCall, toggleMicrophone, leaveCall, ...state }: Props) => (
    <VoiceControlView vm={useMockedViewModel(state, { openCall, toggleMicrophone, leaveCall })} />
);

const meta = {
    title: "Room/VoiceControlView",
    component: Wrapper,
    args: {
        roomName: "Voice room",
        connectionLabel: "Voice connected",
        microphoneLabel: "Unmute microphone",
        microphoneEnabled: false,
        microphoneStatus: "Microphone muted",
        microphonePending: false,
        shareLabel: "Open call to share your screen",
        leaveLabel: "Leave voice call",
        leavePending: false,
        openCall: fn(),
        toggleMicrophone: fn(),
        leaveCall: fn(),
    },
} satisfies Meta<typeof Wrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
export const ChangingMicrophone: Story = {
    args: { microphonePending: true, microphoneStatus: "Changing microphone…" },
};
