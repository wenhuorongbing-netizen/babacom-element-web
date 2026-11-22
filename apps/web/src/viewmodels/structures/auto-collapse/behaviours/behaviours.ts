/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { CollapseOnWindowResizeBehaviour } from "./CollapseOnWindowResizeBehaviour";

/**
 * The auto-collapse behaviours used by the app.
 *
 * BabaCom: CollapseOnCallResizeBehaviour is deliberately left out. Collapsing the left panel when a call starts
 * makes it inert, which disables the persistent voice controls that live there for the whole call.
 */
export const Behaviours = [CollapseOnWindowResizeBehaviour];
