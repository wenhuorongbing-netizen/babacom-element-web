/*
Copyright 2024 New Vector Ltd.
Copyright 2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { fireEvent, render, screen } from "test-utils-rtl";
import { flushPromises } from "test-utils";
import fetchMock from "@fetch-mock/vitest";
import { vi, describe, it, expect, beforeEach } from "vitest";

import ServerPickerDialog from "./ServerPickerDialog";
import SdkConfig from "../../../SdkConfig";
import { type ValidatedServerConfig } from "../../../utils/ValidatedServerConfig";

/** The matrix versions our mock server claims to support */
const SERVER_SUPPORTED_MATRIX_VERSIONS = ["v1.1", "v1.5", "v1.6", "v1.8", "v1.9"];

describe("<ServerPickerDialog />", () => {
    const defaultServerConfig = {
        hsUrl: "https://matrix.org",
        hsName: "matrix.org",
        hsNameIsDifferent: true,
        isUrl: "https://is.org",
        isDefault: true,
        isNameResolvable: true,
        warning: "",
    };
    const wkHsUrl = "https://hsbaseurlfrom.wk";
    const wkIsUrl = "https://isbaseurlfrom.wk";
    const validWellKnown = {
        "m.homeserver": {
            base_url: wkHsUrl,
        },
        "m.identity_server": {
            base_url: wkIsUrl,
        },
    };
    const defaultProps = {
        serverConfig: defaultServerConfig,
        onFinished: vi.fn(),
    };
    const getComponent = (
        props: Partial<{
            onFinished: any;
            serverConfig: ValidatedServerConfig;
        }> = {},
    ) => render(<ServerPickerDialog {...defaultProps} {...props} />);

    beforeEach(() => {
        SdkConfig.add({
            validated_server_config: defaultServerConfig,
        });

        fetchMock.clearHistory();
        fetchMock.catch({
            status: 404,
            body: '{"errcode": "M_UNRECOGNIZED", "error": "Unrecognized request"}',
            headers: { "content-type": "application/json" },
        });
    });

    it("should render dialog", () => {
        const { container } = getComponent();
        expect(container).toMatchSnapshot();
    });

    // checkbox and text input have the same aria-label
    const getOtherHomeserverCheckBox = () =>
        screen.getAllByLabelText("Other account server").find((node) => node.getAttribute("type") === "radio")!;
    const getOtherHomeserverInput = () =>
        screen.getAllByLabelText("Other account server").find((node) => node.getAttribute("type") === "text")!;

    it("should cancel explicitly without changing or discovering an account server", () => {
        const onFinished = vi.fn();
        getComponent({ onFinished });

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(onFinished).toHaveBeenCalledExactlyOnceWith();
        expect(fetchMock).not.toHaveFetched();
    });

    it("should dismiss with Escape without changing the account server", () => {
        const onFinished = vi.fn();
        getComponent({ onFinished });

        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });

        expect(onFinished).toHaveBeenCalledExactlyOnceWith();
        expect(fetchMock).not.toHaveFetched();
    });

    it("should ignore a validation result after the account server address is edited", async () => {
        const firstServer = "https://first.example.org";
        const secondServer = "https://second.example.org";
        const versions = { versions: SERVER_SUPPORTED_MATRIX_VERSIONS };
        const firstResponse = Promise.withResolvers<typeof versions>();
        fetchMock.get(`${firstServer}/_matrix/client/versions`, () => firstResponse.promise);
        fetchMock.get(`${secondServer}/_matrix/client/versions`, versions);
        const onFinished = vi.fn();
        getComponent({ onFinished });

        const input = getOtherHomeserverInput();
        const submit = screen.getByRole("button", { name: "Continue" });
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: firstServer } });
        fireEvent.click(submit);
        await flushPromises();
        expect(fetchMock).toHaveFetched(`${firstServer}/_matrix/client/versions`);

        fireEvent.change(input, { target: { value: secondServer } });
        firstResponse.resolve(versions);
        await flushPromises();
        expect(onFinished).not.toHaveBeenCalled();

        fireEvent.click(submit);
        await flushPromises();
        expect(onFinished).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ hsUrl: secondServer }));
    });

    it("should ignore a validation result after the account server dialog is canceled", async () => {
        const server = "https://canceled.example.org";
        const versions = { versions: SERVER_SUPPORTED_MATRIX_VERSIONS };
        const response = Promise.withResolvers<typeof versions>();
        fetchMock.get(`${server}/_matrix/client/versions`, () => response.promise);
        const onFinished = vi.fn();
        getComponent({ onFinished });

        const input = getOtherHomeserverInput();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: server } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        await flushPromises();
        expect(fetchMock).toHaveFetched(`${server}/_matrix/client/versions`);

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        response.resolve(versions);
        await flushPromises();

        expect(onFinished).toHaveBeenCalledExactlyOnceWith();
    });

    it("should keep an invalid server address open for correction", async () => {
        const onFinished = vi.fn();
        const { container } = getComponent({ onFinished });

        fireEvent.focus(getOtherHomeserverInput());
        fireEvent.change(getOtherHomeserverInput(), { target: { value: "https://" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        await flushPromises();

        expect(container.querySelector(".mx_ServerPickerDialog_otherHomeserver.mx_Field_invalid")).toBeTruthy();
        expect(screen.getByText("Enter a complete account server address, such as https://example.org.")).toBeVisible();
        expect(getOtherHomeserverInput()).toHaveDisplayValue("https://");
        expect(fetchMock).not.toHaveFetched();
        expect(onFinished).not.toHaveBeenCalled();
        expect(getOtherHomeserverInput()).toHaveFocus();
    });

    it("should validate a corrected address after a format error", async () => {
        const homeserver = "https://corrected.example.org";
        fetchMock.get(`${homeserver}/_matrix/client/versions`, {
            unstable_features: {},
            versions: SERVER_SUPPORTED_MATRIX_VERSIONS,
        });
        const onFinished = vi.fn();
        getComponent({ onFinished });

        fireEvent.focus(getOtherHomeserverInput());
        fireEvent.change(getOtherHomeserverInput(), { target: { value: "https://" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        await flushPromises();
        expect(onFinished).not.toHaveBeenCalled();

        fireEvent.change(getOtherHomeserverInput(), { target: { value: homeserver } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        await flushPromises();

        expect(onFinished).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ hsUrl: homeserver }));
        expect(fetchMock).toHaveFetched(`${homeserver}/_matrix/client/versions`);
    });

    it("should not report a reachable address with a failed discovery response as a format error", async () => {
        const homeserver = "https://unavailable.example.org";
        const onFinished = vi.fn();
        getComponent({ onFinished });

        fireEvent.focus(getOtherHomeserverInput());
        fireEvent.change(getOtherHomeserverInput(), { target: { value: homeserver } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        await flushPromises();

        expect(fetchMock).toHaveFetched(`${homeserver}/_matrix/client/versions`);
        expect(screen.queryByText("Enter a complete account server address, such as https://example.org.")).toBeNull();
        expect(getOtherHomeserverInput()).toHaveDisplayValue(homeserver);
        expect(onFinished).not.toHaveBeenCalled();
    });

    it("should retain and focus the current custom account server", () => {
        getComponent({
            serverConfig: {
                ...defaultServerConfig,
                hsName: "custom.org",
                hsUrl: "https://custom.org",
                isDefault: false,
            },
        });

        expect(getOtherHomeserverCheckBox()).toBeChecked();
        expect(screen.getByTestId("defaultHomeserver")).not.toBeChecked();
        expect(getOtherHomeserverInput()).toHaveDisplayValue("custom.org");
        expect(getOtherHomeserverInput()).toHaveFocus();
        expect(fetchMock).not.toHaveFetched();
    });

    describe("when default server config is selected", () => {
        it("should retain the default account server on open", () => {
            getComponent();
            expect(screen.getByTestId("defaultHomeserver")).toBeChecked();
            expect(getOtherHomeserverCheckBox()).not.toBeChecked();
            expect(getOtherHomeserverInput()).not.toHaveFocus();
            // empty field
            expect(getOtherHomeserverInput()).toHaveDisplayValue("");
        });

        it("should display an error when trying to continue with an empty homeserver field", async () => {
            const onFinished = vi.fn();
            const { container } = getComponent({ onFinished });

            fireEvent.focus(getOtherHomeserverInput());
            fireEvent.click(screen.getByText("Continue"));

            await flushPromises();

            // error on field
            expect(container.querySelector(".mx_ServerPickerDialog_otherHomeserver.mx_Field_invalid")).toBeTruthy();

            // didn't close dialog
            expect(onFinished).not.toHaveBeenCalled();
        });

        it("should close when selecting default homeserver and clicking continue", async () => {
            const onFinished = vi.fn();
            getComponent({ onFinished });

            fireEvent.click(screen.getByTestId("defaultHomeserver"));
            expect(screen.getByTestId("defaultHomeserver")).toBeChecked();

            fireEvent.click(screen.getByText("Continue"));

            // closed dialog with default server
            expect(onFinished).toHaveBeenCalledWith(defaultServerConfig);
        });

        it("should allow user to revert from a custom server to the default", async () => {
            fetchMock.get(`https://custom.org/_matrix/client/versions`, {
                unstable_features: {},
                versions: SERVER_SUPPORTED_MATRIX_VERSIONS,
            });

            const onFinished = vi.fn();
            const serverConfig = {
                hsUrl: "https://custom.org",
                hsName: "custom.org",
                hsNameIsDifferent: true,
                isUrl: "https://is.org",
                isDefault: false,
                isNameResolvable: true,
                warning: "",
            };
            getComponent({ onFinished, serverConfig });

            fireEvent.click(screen.getByTestId("defaultHomeserver"));
            expect(screen.getByTestId("defaultHomeserver")).toBeChecked();

            fireEvent.click(screen.getByText("Continue"));
            await flushPromises();

            // closed dialog with default server and nothing else
            expect(onFinished).toHaveBeenCalledWith(defaultServerConfig);
            expect(onFinished).toHaveBeenCalledTimes(1);
        });

        it("should submit successfully with a valid custom homeserver", async () => {
            const homeserver = "https://myhomeserver.site";
            fetchMock.get(`${homeserver}/_matrix/client/versions`, {
                unstable_features: {},
                versions: SERVER_SUPPORTED_MATRIX_VERSIONS,
            });
            const onFinished = vi.fn();
            getComponent({ onFinished });

            fireEvent.focus(getOtherHomeserverInput());
            fireEvent.change(getOtherHomeserverInput(), { target: { value: homeserver } });
            expect(getOtherHomeserverInput()).toHaveDisplayValue(homeserver);

            fireEvent.click(screen.getByText("Continue"));

            // validation on submit is async
            await flushPromises();

            // closed dialog with validated custom server
            expect(onFinished).toHaveBeenCalledWith({
                hsName: "myhomeserver.site",
                hsUrl: homeserver,
                hsNameIsDifferent: false,
                warning: null,
                isDefault: false,
                isNameResolvable: false,
                isUrl: defaultServerConfig.isUrl,
            });
        });

        describe("validates custom homeserver", () => {
            it("should lookup .well-known for homeserver without protocol", async () => {
                const homeserver = "myhomeserver1.site";
                const wellKnownUrl = `https://${homeserver}/.well-known/matrix/client`;
                fetchMock.get(wellKnownUrl, {});
                getComponent();

                fireEvent.focus(getOtherHomeserverInput());
                fireEvent.change(getOtherHomeserverInput(), { target: { value: homeserver } });
                expect(getOtherHomeserverInput()).toHaveDisplayValue(homeserver);
                // trigger validation
                fireEvent.blur(getOtherHomeserverInput());

                // validation on submit is async
                await flushPromises();

                expect(fetchMock).toHaveFetched(wellKnownUrl);
            });

            it("should submit using validated config from a valid .well-known", async () => {
                const homeserver = "myhomeserver2.site";
                const wellKnownUrl = `https://${homeserver}/.well-known/matrix/client`;

                // urls from homeserver well-known
                const versionsUrl = `${wkHsUrl}/_matrix/client/versions`;
                const isWellKnownUrl = `${wkIsUrl}/_matrix/identity/v2`;

                fetchMock.getOnce(wellKnownUrl, validWellKnown);
                fetchMock.getOnce(versionsUrl, {
                    versions: SERVER_SUPPORTED_MATRIX_VERSIONS,
                });
                fetchMock.getOnce(isWellKnownUrl, {});
                const onFinished = vi.fn();
                getComponent({ onFinished });

                fireEvent.focus(getOtherHomeserverInput());
                fireEvent.change(getOtherHomeserverInput(), { target: { value: homeserver } });
                fireEvent.click(screen.getByText("Continue"));

                // validation on submit is async
                await flushPromises();

                expect(fetchMock).toHaveFetched(wellKnownUrl);
                // fetched using urls from .well-known
                expect(fetchMock).toHaveFetched(versionsUrl);
                expect(fetchMock).toHaveFetched(isWellKnownUrl);

                expect(onFinished).toHaveBeenCalledWith({
                    hsName: homeserver,
                    hsUrl: wkHsUrl,
                    hsNameIsDifferent: true,
                    warning: null,
                    isDefault: false,
                    isNameResolvable: true,
                    isUrl: wkIsUrl,
                });

                await flushPromises();
            });

            it("should fall back to static config when well-known lookup fails", async () => {
                const homeserver = "myhomeserver3.site";
                // this server returns 404 for well-known
                const wellKnownUrl = `https://${homeserver}/.well-known/matrix/client`;
                fetchMock.get(wellKnownUrl, { status: 404 });
                // but is otherwise live (happy versions response)
                fetchMock.get(`https://${homeserver}/_matrix/client/versions`, {
                    versions: SERVER_SUPPORTED_MATRIX_VERSIONS,
                });
                const onFinished = vi.fn();
                getComponent({ onFinished });

                fireEvent.focus(getOtherHomeserverInput());
                fireEvent.change(getOtherHomeserverInput(), { target: { value: homeserver } });
                fireEvent.click(screen.getByText("Continue"));

                // validation on submit is async
                await flushPromises();

                expect(fetchMock).toHaveFetched(wellKnownUrl);
                expect(fetchMock).toHaveFetched(`https://${homeserver}/_matrix/client/versions`);

                expect(onFinished).toHaveBeenCalledWith({
                    hsName: homeserver,
                    hsUrl: "https://" + homeserver,
                    hsNameIsDifferent: false,
                    warning: null,
                    isDefault: false,
                    isNameResolvable: false,
                    isUrl: defaultServerConfig.isUrl,
                });
            });
        });
    });
});
