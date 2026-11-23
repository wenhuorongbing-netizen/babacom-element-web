/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Narrow view of Electron's globalShortcut. Only register/unregister are
 * exposed, so unregisterAll is unreachable. Real Electron objects satisfy
 * these shapes structurally; Electron is never imported at runtime here.
 */
export interface GlobalShortcutApi {
    register(accelerator: string, callback: () => void): boolean;
    unregister(accelerator: string): void;
}

/** Narrow view of a renderer's WebContents used to deliver the toggle IPC. */
export interface ShortcutWebContents {
    isDestroyed(): boolean;
    send(channel: string, ...args: unknown[]): void;
}

/** Narrow view of the main BrowserWindow, resolved fresh on every toggle. */
export interface ShortcutWindow {
    isDestroyed(): boolean;
    readonly webContents: ShortcutWebContents | null | undefined;
}

/** Narrow view of Electron's before-input-event Input. */
export interface ShortcutInput {
    readonly type: string;
    readonly key: string;
    readonly control: boolean;
    readonly shift: boolean;
    readonly alt: boolean;
    readonly meta: boolean;
    readonly isAutoRepeat: boolean;
}

/** Narrow view of Electron's before-input-event Event. */
export interface ShortcutInputEvent {
    preventDefault(): void;
}

/** Injected dependencies; keep Electron out of the runtime graph. */
export interface GlobalShortcutDeps {
    readonly globalShortcut: GlobalShortcutApi;
    readonly getMainWindow: () => ShortcutWindow | null | undefined;
    readonly platform: string;
    readonly warn: (message: string) => void;
}

/** Lifecycle handle: create once after app.ready, dispose on will-quit. */
export interface GlobalShortcutController {
    /** @returns true when the event was consumed, so the caller can early-return. */
    handleBeforeInput(event: ShortcutInputEvent, input: ShortcutInput): boolean;
    /** Releases only the accelerator this controller registered; idempotent. */
    dispose(): void;
}

/**
 * Creates the Control+Shift+M toggle controller. Native registration belongs
 * here, so call only after app.ready. Focused input is a fallback when the
 * native accelerator is unavailable, and never sends a second toggle.
 */
export function createGlobalShortcuts(deps: GlobalShortcutDeps): GlobalShortcutController {
    const accelerator = "Control+Shift+M";
    let registered = false;
    let disposed = false;

    const toggleMicrophone = (): void => {
        if (disposed) return;
        const window = deps.getMainWindow();
        if (!window || window.isDestroyed()) return;
        const webContents = window.webContents;
        if (!webContents || webContents.isDestroyed()) return;
        webContents.send("babacom-toggle-microphone");
    };

    if (deps.platform === "win32") {
        try {
            registered = deps.globalShortcut.register(accelerator, toggleMicrophone);
        } catch {
            // Keep the existing focused shortcut when native registration fails.
        }
        if (!registered) {
            deps.warn("Could not register Control+Shift+M globally; using the focused microphone shortcut.");
        }
    }

    return {
        handleBeforeInput: (event, input): boolean => {
            if (
                disposed ||
                deps.platform !== "win32" ||
                input.type !== "keyDown" ||
                !input.control ||
                !input.shift ||
                input.alt ||
                input.meta ||
                input.key.toLowerCase() !== "m"
            ) {
                return false;
            }
            event.preventDefault();
            if (!registered && !input.isAutoRepeat) toggleMicrophone();
            return true;
        },
        dispose: (): void => {
            if (disposed) return;
            disposed = true;
            if (registered) {
                registered = false;
                deps.globalShortcut.unregister(accelerator);
            }
        },
    };
}
