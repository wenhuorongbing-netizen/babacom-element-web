/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import path from "node:path";
import { expect, describe, it, beforeEach, afterEach, vi } from "vitest";
import { fs as memfs, vol } from "memfs";
import { app } from "electron";

import { type Args, getArgs, getArgsForProtocolRegistration, getIsolatedCandidateProfile } from "./args.js";
import type ProtocolHandler from "./protocol.js";

vi.mock("node:fs", () => ({ default: memfs }));
vi.mock("electron", () => ({
    app: {
        getPath: vi.fn().mockImplementation((dirName) => {
            if (dirName === "userData") return "/Users/name/Library/Application Support/Element";
            if (dirName === "appData") return "/Users/name/Library/Application Support";
            throw new Error("Not implemented");
        }),
        getName: vi.fn().mockReturnValue("Element"),
        exit: vi.fn(),
    },
}));

beforeEach(() => {
    // Reset the state of the in-memory fs
    vol.reset();
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("getArgsForProtocolRegistration", () => {
    it("should return an empty array for default args", () => {
        expect(
            getArgsForProtocolRegistration({
                userDataPath: "/Users/name/Library/Application Support/Element",
                devtools: false,
                update: true,
                hidden: false,
                positional: [],
            }),
        ).toStrictEqual([]);
    });

    it("should handle standard args", () => {
        expect(
            getArgsForProtocolRegistration({
                userDataPath: "/Users/name/Library/Application Support/Custom",
                localConfigPath: "/root/config.json",
                devtools: true,
                update: false,
                hidden: false,
                positional: [],
            }),
        ).toStrictEqual([
            "--no-update",
            "--config",
            "/root/config.json",
            "--profile-dir",
            "/Users/name/Library/Application Support/Custom",
        ]);
    });

    it("should ignore hidden=true", () => {
        expect(
            getArgsForProtocolRegistration({
                userDataPath: "/Users/name/Library/Application Support/Element",
                devtools: false,
                update: true,
                hidden: true,
                positional: [],
            }),
        ).toStrictEqual([]);
    });

    it("should ignore positional args", () => {
        expect(
            getArgsForProtocolRegistration({
                userDataPath: "/Users/name/Library/Application Support/Element",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["element://foobar"],
            }),
        ).toStrictEqual([]);
    });
});

describe("getArgs", () => {
    function run(...args: string[]): Args {
        vi.spyOn(process, "argv", "get").mockReturnValue(["/path/to/app", ...args]);
        const mockProtocolHandler = {
            getProfileFromDeeplink: vi.fn(),
        } as unknown as ProtocolHandler;
        return getArgs(mockProtocolHandler);
    }

    it("should handle '--help'", () => {
        const args = run("--help");
        expect(args).toEqual({
            userDataPath: "/Users/name/Library/Application Support/Element",
            devtools: false,
            update: true,
            hidden: false,
            positional: ["/path/to/app"],
        });
        expect(app.exit).toHaveBeenCalled();
    });

    it("should handle no command line args", () => {
        const args = run();
        expect(args).toEqual({
            userDataPath: "/Users/name/Library/Application Support/Element",
            devtools: false,
            update: true,
            hidden: false,
            positional: ["/path/to/app"],
        });
        expect(app.exit).not.toHaveBeenCalled();
    });

    it("should handle '--hidden'", () => {
        const args = run("--hidden");
        expect(args).toEqual({
            userDataPath: "/Users/name/Library/Application Support/Element",
            devtools: false,
            update: true,
            hidden: true,
            positional: ["/path/to/app"],
        });
    });

    it("should handle '--no-update'", () => {
        const args = run("--no-update");
        expect(args).toEqual({
            userDataPath: "/Users/name/Library/Application Support/Element",
            devtools: false,
            update: false,
            hidden: false,
            positional: ["/path/to/app"],
        });
    });

    describe("storageMode", () => {
        it("should handle valid '--storage-mode'", () => {
            const args = run("--storage-mode=force-plaintext");
            expect(args).toEqual({
                userDataPath: "/Users/name/Library/Application Support/Element",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
                storageMode: "force-plaintext",
            });
        });

        it("should ignore invalid '--storage-mode'", () => {
            const args = run("--storage-mode=magic");
            expect(args).toEqual({
                userDataPath: "/Users/name/Library/Application Support/Element",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
                storageMode: undefined,
            });
        });
    });

    describe("userDataPath", () => {
        it("should handle deeplinks", () => {
            vi.spyOn(process, "argv", "get").mockReturnValue([
                "/path/to/app",
                "protocol:/#state=foo:element-desktop-ssoid:XXYYZZ&code=bar",
            ]);
            const mockProtocolHandler = {
                getProfileFromDeeplink: vi.fn().mockReturnValue("/path/to/deeplinked-profile"),
            } as unknown as ProtocolHandler;
            const args = getArgs(mockProtocolHandler);

            expect(mockProtocolHandler.getProfileFromDeeplink).toHaveBeenCalledWith(process.argv);
            expect(args).toEqual({
                userDataPath: "/path/to/deeplinked-profile",
                devtools: false,
                update: true,
                hidden: false,
                positional: [...process.argv],
            });
        });

        it("should handle '--profile-dir'", () => {
            const args = run("--profile-dir", "/path/to/profile");
            expect(args).toEqual({
                userDataPath: "/path/to/profile",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
            });
        });

        it("should handle '--profile'", () => {
            const args = run("--profile", "work");
            expect(args).toEqual({
                userDataPath: "/Users/name/Library/Application Support/Element-work",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
            });
        });

        it("should handle ELEMENT_PROFILE_DIR", () => {
            vi.spyOn(process, "env", "get").mockReturnValue({
                ELEMENT_PROFILE_DIR: "/mnt/foo/profile",
            });
            const args = run();
            expect(args).toEqual({
                userDataPath: "/mnt/foo/profile",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
            });
        });

        it("should prefer deeplink over ELEMENT_PROFILE_DIR", () => {
            vi.spyOn(process, "argv", "get").mockReturnValue(["/path/to/app", "protocol:/#state=foo&code=bar"]);
            vi.spyOn(process, "env", "get").mockReturnValue({
                ELEMENT_PROFILE_DIR: "/mnt/foo/profile",
            });
            const mockProtocolHandler = {
                getProfileFromDeeplink: vi.fn().mockReturnValue("/path/to/deeplinked-profile"),
            } as unknown as ProtocolHandler;
            const args = getArgs(mockProtocolHandler);

            expect(mockProtocolHandler.getProfileFromDeeplink).toHaveBeenCalledWith(process.argv);
            expect(args).toEqual({
                userDataPath: "/path/to/deeplinked-profile",
                devtools: false,
                update: true,
                hidden: false,
                positional: [...process.argv],
            });
        });

        it("should combine ELEMENT_PROFILE_DIR with '--profile'", () => {
            vi.spyOn(process, "env", "get").mockReturnValue({
                ELEMENT_PROFILE_DIR: "/mnt/foo/profile",
            });
            const args = run("--profile", "play");
            expect(args).toEqual({
                userDataPath: "/mnt/foo/profile-play",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
            });
        });

        it("should handle old Riot data dirs", () => {
            vol.fromJSON({
                "/Users/name/Library/Application Support/Riot/IndexedDB": "This is a real IDB. I promise.",
            });

            const args = run();
            expect(args).toEqual({
                userDataPath: path.join("/Users/name/Library/Application Support", "Riot"),
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
            });
        });
    });

    describe("localConfigPath", () => {
        it("should handle '--config'", () => {
            const args = run("--config", "/path/to/config.json");
            expect(args).toEqual({
                userDataPath: "/Users/name/Library/Application Support/Element",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
                localConfigPath: "/path/to/config.json",
            });
        });

        it("should handle ELEMENT_DESKTOP_CONFIG_JSON", () => {
            vi.spyOn(process, "env", "get").mockReturnValue({
                ELEMENT_DESKTOP_CONFIG_JSON: "/path/for/config.json",
            });
            const args = run();
            expect(args).toEqual({
                userDataPath: "/Users/name/Library/Application Support/Element",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
                localConfigPath: "/path/for/config.json",
            });
        });

        it("should prefer arg over env", () => {
            vi.spyOn(process, "env", "get").mockReturnValue({
                ELEMENT_DESKTOP_CONFIG_JSON: "/path/for/config.json",
            });
            const args = run("--config", "/path/to/config.json");
            expect(args).toEqual({
                userDataPath: "/Users/name/Library/Application Support/Element",
                devtools: false,
                update: true,
                hidden: false,
                positional: ["/path/to/app"],
                localConfigPath: "/path/to/config.json",
            });
        });
    });
});

describe("isolated candidate arguments", () => {
    const candidatePath = path.resolve("/path/to/babacom-candidate");
    const defaultPath = "/Users/name/Library/Application Support/Element";

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    function run(args: string[]): { args: Args; handler: ProtocolHandler } {
        vi.spyOn(process, "argv", "get").mockReturnValue(["/path/to/app", ...args]);
        const handler = {
            getProfileFromDeeplink: vi.fn().mockReturnValue("/path/to/live-profile"),
        } as unknown as ProtocolHandler;
        return { args: getArgs(handler), handler };
    }

    it("uses only the explicit candidate profile without consulting SSO, migration, or the environment", () => {
        vi.stubEnv("ELEMENT_PROFILE_DIR", "/path/to/environment-profile");
        const exists = vi.spyOn(memfs, "existsSync");
        const result = run([
            "--babacom-isolated-candidate",
            "--profile-dir",
            candidatePath,
            "element://vector/webapp/?element-desktop-ssoid=synthetic-session",
        ]);

        expect(result.args).toMatchObject({ userDataPath: candidatePath, isolatedCandidate: true });
        expect(result.handler.getProfileFromDeeplink).not.toHaveBeenCalled();
        expect(exists).not.toHaveBeenCalled();
    });

    it.each([
        ["missing", []],
        ["relative", ["--profile-dir", "relative-profile"]],
        ["default", ["--profile-dir", defaultPath]],
        ["normalised default", ["--profile-dir", path.join(defaultPath, "..", "Element")]],
        ["legacy default", ["--profile-dir", path.join(path.dirname(defaultPath), "Riot")]],
        ["empty", ["--profile-dir="]],
        ["whitespace", ["--profile-dir", "   "]],
        ["missing value", ["--profile-dir"]],
        ["repeated", ["--profile-dir", candidatePath, "--profile-dir", candidatePath]],
    ])("rejects a %s candidate profile before consulting SSO", (_name, profileArgs) => {
        vi.spyOn(process, "argv", "get").mockReturnValue([
            "/path/to/app",
            "--babacom-isolated-candidate",
            ...profileArgs,
        ]);
        const handler = { getProfileFromDeeplink: vi.fn() } as unknown as ProtocolHandler;
        expect(() => getArgs(handler)).toThrow(/profile-dir/);
        expect(handler.getProfileFromDeeplink).not.toHaveBeenCalled();
    });

    it("rejects arbitrary truthy flag values", () => {
        expect(() => run(["--babacom-isolated-candidate=garbage", "--profile-dir", candidatePath])).toThrow(
            /babacom-isolated-candidate/,
        );
    });

    it("exposes the validated profile before a protocol handler exists", () => {
        vi.spyOn(process, "argv", "get").mockReturnValue([
            "/path/to/app",
            "--babacom-isolated-candidate=true",
            "--profile-dir",
            candidatePath,
        ]);
        const exists = vi.spyOn(memfs, "existsSync");
        expect(getIsolatedCandidateProfile()).toBe(candidatePath);
        expect(exists).not.toHaveBeenCalled();
    });

    it("leaves ordinary startup preflight inactive", () => {
        vi.spyOn(process, "argv", "get").mockReturnValue(["/path/to/app"]);
        expect(getIsolatedCandidateProfile()).toBeUndefined();
    });

    it
        .skipIf(process.platform !== "win32")
        .each([
            path.resolve(defaultPath).toUpperCase(),
            path.toNamespacedPath(path.resolve(defaultPath)),
            path.resolve(defaultPath) + ".",
            path.resolve(defaultPath) + " ",
            path.join(defaultPath + " ", "child"),
            "D:relative-profile",
        ])("rejects a Windows default-profile alias or drive-relative path: %s", (profile) => {
        expect(() => run(["--babacom-isolated-candidate", "--profile-dir", profile])).toThrow(/profile-dir/);
    });

    it.each(["--no-babacom-isolated-candidate", "--babacom-isolated-candidate=false"])(
        "keeps normal SSO routing for %s",
        (flag) => {
            const result = run([flag]);
            expect(result.args.userDataPath).toBe("/path/to/live-profile");
            expect(result.args).not.toHaveProperty("isolatedCandidate");
            expect(result.handler.getProfileFromDeeplink).toHaveBeenCalledOnce();
        },
    );
});
