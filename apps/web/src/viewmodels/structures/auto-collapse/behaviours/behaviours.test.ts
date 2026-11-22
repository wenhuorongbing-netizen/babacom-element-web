/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { Behaviours } from "./behaviours";
import { CollapseOnWindowResizeBehaviour } from "./CollapseOnWindowResizeBehaviour";

describe("Behaviours", () => {
    it("only auto-collapses the left panel for narrow windows, never when a call starts", () => {
        expect(Behaviours).toEqual([CollapseOnWindowResizeBehaviour]);
    });
});
