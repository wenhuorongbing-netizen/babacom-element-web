/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { Behaviours } from "./behaviours";
import { CollapseOnCallResizeBehaviour } from "./CollapseOnCallResizeBehaviour";
import { CollapseOnWindowResizeBehaviour } from "./CollapseOnWindowResizeBehaviour";

describe("Behaviours", () => {
    it("keeps the left panel open when a call starts, so the voice controls stay usable", () => {
        expect(Behaviours).not.toContain(CollapseOnCallResizeBehaviour);
    });

    it("still collapses the left panel on narrow windows", () => {
        expect(Behaviours).toContain(CollapseOnWindowResizeBehaviour);
    });
});
