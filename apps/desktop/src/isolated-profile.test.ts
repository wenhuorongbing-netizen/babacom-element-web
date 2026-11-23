/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fs as memfs, vol } from "memfs";
import { app } from "electron";

import { applyIsolatedCandidateProfile } from "./isolated-profile.js";

vi.mock("node:fs", () => ({ default: memfs }));
vi.mock("electron", () => ({
    app: {
        getPath: vi.fn().mockImplementation((dirName) => {
            if (dirName === "appData") return "/Users/name/Library/Application Support";
            throw new Error(`Reading ${dirName} would create the default profile directory`);
        }),
        getName: vi.fn().mockReturnValue("BabaCom Internal Test"),
        setPath: vi.fn(),
    },
}));

describe("applyIsolatedCandidateProfile", () => {
    const candidatePath = path.resolve("/path/to/babacom-candidate");

    afterEach(() => {
        vi.restoreAllMocks();
        vol.reset();
    });

    it("points profile and session storage at the candidate profile without reading the default profile", () => {
        vi.spyOn(process, "argv", "get").mockReturnValue([
            "/path/to/app",
            "--babacom-isolated-candidate",
            "--profile-dir",
            candidatePath,
        ]);

        expect(applyIsolatedCandidateProfile()).toBe(candidatePath);
        expect(memfs.existsSync(candidatePath)).toBe(true);
        expect(app.setPath).toHaveBeenCalledWith("userData", candidatePath);
        expect(app.setPath).toHaveBeenCalledWith("sessionData", candidatePath);
        expect(vi.mocked(app.getPath).mock.calls.map(([name]) => name)).not.toContain("userData");
    });

    it("rejects the default profile as the candidate profile", () => {
        const defaultProfile = path.join("/Users/name/Library/Application Support", "BabaCom Internal Test");
        vi.spyOn(process, "argv", "get").mockReturnValue([
            "/path/to/app",
            "--babacom-isolated-candidate",
            "--profile-dir",
            path.resolve(defaultProfile),
        ]);

        expect(() => applyIsolatedCandidateProfile()).toThrow("must differ from the default and legacy profiles");
    });

    it("leaves ordinary startup untouched", () => {
        vi.mocked(app.setPath).mockClear();
        vi.spyOn(process, "argv", "get").mockReturnValue(["/path/to/app"]);

        expect(applyIsolatedCandidateProfile()).toBeUndefined();
        expect(app.setPath).not.toHaveBeenCalled();
    });
});
