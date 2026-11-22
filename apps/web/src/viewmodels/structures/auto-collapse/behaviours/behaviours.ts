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
 * BabaCom: upstream also collapses the left panel when a call starts. That is removed here because a collapsed
 * panel is inert, which disabled the persistent voice controls in the left panel for the whole call.
 */
export const Behaviours = [CollapseOnWindowResizeBehaviour];
