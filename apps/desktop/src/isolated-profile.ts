/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// BabaCom's isolated candidate profile (`--babacom-isolated-candidate --profile-dir <absolute path>`).
// electron-main.ts imports this module before anything else: reading app.getPath("userData") creates the default
// profile directory, and several modules read it while loading, so the isolated profile must already be in place.

import minimist, { type ParsedArgs } from "minimist";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * Validates the opt-in candidate profile from parsed arguments.
 * Returns undefined for ordinary startup; it does not read or create profile files.
 */
export function getIsolatedCandidateProfileFromArgs(argv: ParsedArgs): string | undefined {
    const isolated = argv["babacom-isolated-candidate"];
    if (isolated === undefined || isolated === false || isolated === "false") return undefined;
    if (isolated !== true && isolated !== "true") {
        throw new Error("--babacom-isolated-candidate must be a boolean flag");
    }

    const profile = argv["profile-dir"];
    if (typeof profile !== "string" || !profile.trim() || profile !== profile.trim() || !path.isAbsolute(profile)) {
        throw new Error("--babacom-isolated-candidate requires an explicit absolute --profile-dir");
    }

    const profilePath = path.resolve(profile);
    // Windows strips trailing dots/spaces from ordinary path components.
    if (process.platform === "win32" && profilePath.split(/[\\/]/).some((part) => /[. ]$/.test(part))) {
        throw new Error("--profile-dir must not contain Windows path aliases");
    }
    const normalise = (value: string): string => {
        const resolved = path.resolve(value);
        return process.platform === "win32" ? path.toNamespacedPath(resolved).toLowerCase() : resolved;
    };
    // Electron's default profile is <appData>/<app name>; built here without reading (and so creating) it.
    const defaultPath = path.join(app.getPath("appData"), app.getName());
    const legacyPath = path.join(app.getPath("appData"), app.getName().replace("Element", "Riot"));
    if ([defaultPath, legacyPath].some((value) => normalise(value) === normalise(profilePath))) {
        throw new Error("--profile-dir must differ from the default and legacy profiles in isolated candidate mode");
    }
    return profilePath;
}

/**
 * Validates the opt-in candidate profile from the process arguments.
 * Returns undefined for ordinary startup; it does not read or create profile files.
 */
export function getIsolatedCandidateProfile(): string | undefined {
    return getIsolatedCandidateProfileFromArgs(minimist(process.argv, { alias: { help: "h" } }));
}

/**
 * Points Electron's profile and session storage at the isolated candidate profile, if one was requested.
 * @returns the isolated profile, or undefined for ordinary startup
 */
export function applyIsolatedCandidateProfile(): string | undefined {
    const profile = getIsolatedCandidateProfile();
    if (profile) {
        fs.mkdirSync(profile, { recursive: true });
        app.setPath("userData", profile);
        app.setPath("sessionData", profile);
    }
    return profile;
}

/** The isolated candidate profile in use, applied as this module loads (see the note at the top). */
export const isolatedCandidateProfile = applyIsolatedCandidateProfile();
