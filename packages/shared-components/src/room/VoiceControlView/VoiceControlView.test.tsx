/*
 * Copyright 2026 Jack
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React from "react";
import { render } from "@test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { VoiceControlView, type VoiceControlViewSnapshot } from "./VoiceControlView";
import { MockViewModel } from "../../core/viewmodel";

interface VoiceControlActions {
    openCall: () => void;
    toggleMicrophone: () => void;
    leaveCall: () => void;
}

const createSnapshot = (overrides: Partial<VoiceControlViewSnapshot> = {}): VoiceControlViewSnapshot => ({
    roomName: "Design Room",
    connectionLabel: "Connected",
    microphoneLabel: "Mute microphone",
    microphoneEnabled: true,
    microphoneStatus: "Microphone on",
    microphonePending: false,
    shareLabel: "Open call to share your screen",
    leaveLabel: "Leave call",
    leavePending: false,
    ...overrides,
});

const createViewModel = (
    snapshot: VoiceControlViewSnapshot,
): MockViewModel<VoiceControlViewSnapshot> & VoiceControlActions => {
    const vm = new MockViewModel(snapshot);
    return Object.assign(vm, {
        openCall: vi.fn(),
        toggleMicrophone: vi.fn(),
        leaveCall: vi.fn(),
    });
};

describe("VoiceControlView", () => {
    it("renders nothing when there is no room", () => {
        const vm = createViewModel(createSnapshot({ roomName: null, platformNotice: "Sharing unavailable" }));
        const { container, queryByText } = render(<VoiceControlView vm={vm} />);
        expect(container).toBeEmptyDOMElement();
        expect(queryByText("Sharing unavailable")).not.toBeInTheDocument();
    });

    it("renders the connection label, microphone status and room name", () => {
        const vm = createViewModel(createSnapshot());
        const { getByRole, getByText } = render(<VoiceControlView vm={vm} />);
        expect(getByText("Connected")).toBeInTheDocument();
        expect(getByText("Microphone on")).toBeInTheDocument();
        expect(getByRole("button", { name: "Design Room" })).toBeInTheDocument();
    });

    it("calls openCall when the room button is clicked", async () => {
        const vm = createViewModel(createSnapshot());
        const { getByRole } = render(<VoiceControlView vm={vm} />);

        await userEvent.click(getByRole("button", { name: "Design Room" }));
        expect(vm.openCall).toHaveBeenCalledTimes(1);
        expect(vm.openCall).toHaveBeenCalledWith();
    });

    it("opens the active call for screen sharing", async () => {
        const vm = createViewModel(createSnapshot());
        const { getByRole } = render(<VoiceControlView vm={vm} />);

        await userEvent.click(getByRole("button", { name: "Open call to share your screen" }));
        expect(vm.openCall).toHaveBeenCalledExactlyOnceWith();
    });
    it("calls toggleMicrophone when the microphone button is clicked", async () => {
        const vm = createViewModel(createSnapshot());
        const { getByRole } = render(<VoiceControlView vm={vm} />);

        await userEvent.click(getByRole("button", { name: "Mute microphone" }));
        expect(vm.toggleMicrophone).toHaveBeenCalledTimes(1);
        expect(vm.toggleMicrophone).toHaveBeenCalledWith();
    });

    it("disables the microphone button while a microphone change is pending", async () => {
        const vm = createViewModel(createSnapshot({ microphonePending: true }));
        const { getByRole } = render(<VoiceControlView vm={vm} />);

        const button = getByRole("button", { name: "Mute microphone" });
        expect(button).toBeDisabled();

        await userEvent.click(button);
        expect(vm.toggleMicrophone).not.toHaveBeenCalled();
    });

    it("calls leaveCall when the leave button is clicked", async () => {
        const vm = createViewModel(createSnapshot());
        const { getByRole } = render(<VoiceControlView vm={vm} />);

        await userEvent.click(getByRole("button", { name: "Leave call" }));
        expect(vm.leaveCall).toHaveBeenCalledTimes(1);
        expect(vm.leaveCall).toHaveBeenCalledWith();
    });

    it("shows the platform notice and links it to the share button", () => {
        const vm = createViewModel(createSnapshot({ platformNotice: "Sharing unavailable" }));
        const { getByRole, getByText } = render(<VoiceControlView vm={vm} />);

        const notice = getByText("Sharing unavailable");
        expect(notice).toBeVisible();
        expect(notice.id).not.toBe("");

        const shareButton = getByRole("button", { name: "Open call to share your screen" });
        expect(shareButton.getAttribute("aria-describedby")).toBe(notice.id);
    });

    it("does not describe the share button without a platform notice", () => {
        const vm = createViewModel(createSnapshot());
        const { getByRole } = render(<VoiceControlView vm={vm} />);

        const shareButton = getByRole("button", { name: "Open call to share your screen" });
        expect(shareButton.getAttribute("aria-describedby")).toBeNull();
    });
});
