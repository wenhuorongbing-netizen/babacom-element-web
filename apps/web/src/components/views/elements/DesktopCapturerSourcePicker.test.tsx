/*
Copyright 2024 New Vector Ltd.
Copyright 2024 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";

import DesktopCapturerSourcePicker from "./DesktopCapturerSourcePicker";
import PlatformPeg from "../../../PlatformPeg";
import type BasePlatform from "../../../BasePlatform";

const SOURCES = [
    {
        id: "screen1",
        name: "Screen 1",
        thumbnailURL: "data:image/png;base64,",
    },
    {
        id: "window1",
        name: "Window 1",
        thumbnailURL: "data:image/png;base64,",
    },
];

describe("DesktopCapturerSourcePicker", () => {
    beforeEach(() => {
        const plaf = {
            getDesktopCapturerSources: vi.fn().mockResolvedValue(SOURCES),
            supportsSetting: vi.fn().mockReturnValue(false),
        };
        vi.spyOn(PlatformPeg, "get").mockReturnValue(plaf as unknown as BasePlatform);
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("stops refreshing when the picker closes before the first source list arrives", async () => {
        vi.useFakeTimers();
        const firstRequest = Promise.withResolvers<typeof SOURCES>();
        const getSources = vi.mocked(PlatformPeg.get()!.getDesktopCapturerSources);
        getSources.mockReturnValueOnce(firstRequest.promise);

        const { unmount } = render(<DesktopCapturerSourcePicker onFinished={() => {}} />);
        expect(getSources).toHaveBeenCalledTimes(1);

        unmount();
        await act(async () => {
            firstRequest.resolve(SOURCES);
            await firstRequest.promise;
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1_000);
        });

        expect(getSources).toHaveBeenCalledTimes(1);
    });

    it("waits for a pending refresh to settle before scheduling another", async () => {
        vi.useFakeTimers();
        const firstRequest = Promise.withResolvers<typeof SOURCES>();
        const refreshRequest = Promise.withResolvers<typeof SOURCES>();
        const getSources = vi.mocked(PlatformPeg.get()!.getDesktopCapturerSources);
        getSources.mockReturnValueOnce(firstRequest.promise).mockReturnValueOnce(refreshRequest.promise);

        render(<DesktopCapturerSourcePicker onFinished={() => {}} />);
        await act(async () => {
            firstRequest.resolve(SOURCES);
            await firstRequest.promise;
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });
        expect(getSources).toHaveBeenCalledTimes(2);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1_000);
        });
        expect(getSources).toHaveBeenCalledTimes(2);

        await act(async () => {
            refreshRequest.reject(new Error("Source enumeration failed"));
            await vi.advanceTimersByTimeAsync(500);
        });
        expect(getSources).toHaveBeenCalledTimes(3);
    });

    it("disables sharing when the selected source disappears on refresh", async () => {
        vi.useFakeTimers();
        const getSources = vi.mocked(PlatformPeg.get()!.getDesktopCapturerSources);
        getSources.mockResolvedValueOnce(SOURCES).mockResolvedValueOnce([SOURCES[1]]);

        render(<DesktopCapturerSourcePicker onFinished={() => {}} />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        fireEvent.click(screen.getByRole("button", { name: "Screen 1" }));
        expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });

        expect(screen.queryByRole("button", { name: "Screen 1" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    });

    it("should render the component", async () => {
        render(<DesktopCapturerSourcePicker onFinished={() => {}} />);
        await screen.findByRole("button", { name: "Screen 1" });
        expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    });

    it("names the call and source at confirmation and leaves system audio off", async () => {
        const onFinished = vi.fn();
        render(
            <DesktopCapturerSourcePicker
                elementCallRoomName="Team voice"
                canShareSystemAudio
                onFinished={onFinished}
            />,
        );
        const shareButton = screen.getByRole("button", { name: "Share screen" });
        expect(shareButton).toBeDisabled();
        expect(screen.getByText("Sharing to Team voice")).toBeInTheDocument();
        expect(screen.getByRole("checkbox")).not.toBeChecked();
        await userEvent.click(await screen.findByRole("button", { name: "Screen 1" }));
        expect(screen.getByText("Selected source: Screen 1")).toBeInTheDocument();
        await userEvent.click(shareButton);
        expect(onFinished).toHaveBeenCalledExactlyOnceWith(SOURCES[0], false);
    });
    it("should disable share button until a source is selected", async () => {
        render(<DesktopCapturerSourcePicker onFinished={() => {}} />);
        await screen.findByRole("button", { name: "Screen 1" });
        expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    });

    it("should contain a screen source in the default tab", async () => {
        render(<DesktopCapturerSourcePicker onFinished={() => {}} />);

        const screen1Button = await screen.findByRole("button", { name: "Screen 1" });

        expect(screen1Button).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Window 1" })).not.toBeInTheDocument();
    });

    it("should contain a window source in the window tab", async () => {
        render(<DesktopCapturerSourcePicker onFinished={() => {}} />);

        await userEvent.click(screen.getByRole("tab", { name: "Application window" }));

        const window1Button = await screen.findByRole("button", { name: "Window 1" });

        expect(window1Button).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Screen 1" })).not.toBeInTheDocument();
    });

    it("should call onFinished with no arguments if cancelled", async () => {
        const onFinished = vi.fn();
        render(<DesktopCapturerSourcePicker onFinished={onFinished} />);

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onFinished).toHaveBeenCalledWith();
    });

    it("should call onFinished with the selected source when share clicked", async () => {
        const onFinished = vi.fn();
        render(<DesktopCapturerSourcePicker onFinished={onFinished} />);

        const screen1Button = await screen.findByRole("button", { name: "Screen 1" });

        await userEvent.click(screen1Button);
        await userEvent.click(screen.getByRole("button", { name: "Share" }));
        expect(onFinished).toHaveBeenCalledWith(SOURCES[0], false);
    });

    it("defaults system audio to off for every new picker", async () => {
        const onFinished = vi.fn();
        const first = render(<DesktopCapturerSourcePicker onFinished={onFinished} canShareSystemAudio={true} />);
        const checkbox = screen.getByRole("checkbox", { name: "Share system audio from this computer" });
        expect(checkbox).not.toBeChecked();
        await userEvent.click(checkbox);
        first.unmount();

        render(<DesktopCapturerSourcePicker onFinished={onFinished} canShareSystemAudio={true} />);
        await screen.findByRole("button", { name: "Screen 1" });
        expect(screen.getByRole("checkbox", { name: "Share system audio from this computer" })).not.toBeChecked();
    });

    it("shares system audio only after the checkbox is selected", async () => {
        const onFinished = vi.fn();
        render(<DesktopCapturerSourcePicker onFinished={onFinished} canShareSystemAudio={true} />);
        await userEvent.click(await screen.findByRole("button", { name: "Screen 1" }));
        await userEvent.click(screen.getByRole("checkbox", { name: "Share system audio from this computer" }));
        await userEvent.click(screen.getByRole("button", { name: "Share" }));

        expect(onFinished).toHaveBeenCalledExactlyOnceWith(SOURCES[0], true);
    });

    it("does not pass system audio consent when canceled after checking the box", async () => {
        const onFinished = vi.fn();
        render(<DesktopCapturerSourcePicker onFinished={onFinished} canShareSystemAudio={true} />);
        await userEvent.click(screen.getByRole("checkbox", { name: "Share system audio from this computer" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(onFinished).toHaveBeenCalledExactlyOnceWith();
    });

    it.each([false, undefined])("hides the audio option when availability is %s", async (canShareSystemAudio) => {
        render(<DesktopCapturerSourcePicker onFinished={() => {}} canShareSystemAudio={canShareSystemAudio} />);
        await screen.findByRole("button", { name: "Screen 1" });
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });
});
