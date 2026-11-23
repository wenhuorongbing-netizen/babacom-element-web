/*
Copyright 2026 Jack

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, it, expect, vi } from "vitest";
import {
    createGlobalShortcuts,
    type GlobalShortcutDeps,
    type ShortcutInput,
    type ShortcutWebContents,
    type ShortcutWindow,
} from "./global-shortcuts.js";

const ACCEL = "Control+Shift+M";
const CHANNEL = "babacom-toggle-microphone";

interface Sent {
    channel: string;
    args: unknown[];
}

interface FakeWindow {
    window: ShortcutWindow;
    sent: Sent[];
    destroy(): void;
    destroyWebContents(): void;
}

function makeWindow(aggregate: Sent[]): FakeWindow {
    const sent: Sent[] = [];
    let destroyed = false;
    let wcDestroyed = false;
    const webContents: ShortcutWebContents = {
        isDestroyed: (): boolean => wcDestroyed,
        send: (channel: string, ...args: unknown[]): void => {
            const message: Sent = { channel, args };
            sent.push(message);
            aggregate.push(message);
        },
    };
    const window: ShortcutWindow = {
        isDestroyed: (): boolean => destroyed,
        get webContents(): ShortcutWebContents {
            return webContents;
        },
    };
    return {
        window,
        sent,
        destroy: (): void => {
            destroyed = true;
        },
        destroyWebContents: (): void => {
            wcDestroyed = true;
        },
    };
}

// Fakes only record calls; the real createGlobalShortcuts owns all the logic.
function createHarness(options: { platform?: string; register?: boolean | Error } = {}) {
    const sent: Sent[] = [];
    const registered = new Map<string, () => void>();
    const unregistered: string[] = [];
    const warnings: string[] = [];
    const registerResult: boolean | Error = options.register ?? true;
    const first = makeWindow(sent);
    let currentWindow: ShortcutWindow | null | undefined = first.window;
    const unregisterAll = vi.fn();

    const globalShortcut = {
        register: (accelerator: string, callback: () => void): boolean => {
            if (registerResult instanceof Error) throw registerResult;
            if (registerResult) registered.set(accelerator, callback);
            return registerResult;
        },
        unregister: (accelerator: string): void => {
            unregistered.push(accelerator);
            registered.delete(accelerator);
        },
        unregisterAll,
    };

    const deps: GlobalShortcutDeps = {
        globalShortcut,
        getMainWindow: (): ShortcutWindow | null | undefined => currentWindow,
        platform: options.platform ?? "win32",
        warn: (message: string): void => {
            warnings.push(message);
        },
    };

    return {
        deps,
        registered,
        unregistered,
        sent,
        warnings,
        first,
        unregisterAll,
        newWindow: (): FakeWindow => makeWindow(sent),
        setWindow: (window: ShortcutWindow | null | undefined): void => {
            currentWindow = window;
        },
    };
}

type Harness = ReturnType<typeof createHarness>;

function setup(options: { platform?: string; register?: boolean | Error } = {}): {
    h: Harness;
    controller: ReturnType<typeof createGlobalShortcuts>;
} {
    const h = createHarness(options);
    return { h, controller: createGlobalShortcuts(h.deps) };
}

function toggleInput(overrides: Partial<ShortcutInput> = {}): ShortcutInput {
    return {
        type: "keyDown",
        key: "m",
        control: true,
        shift: true,
        alt: false,
        meta: false,
        isAutoRepeat: false,
        ...overrides,
    };
}

function nativeCallback(h: Harness): (() => void) | undefined {
    return h.registered.get(ACCEL);
}

describe("createGlobalShortcuts (win32 Control+Shift+M)", () => {
    it("registers the literal Control+Shift+M accelerator on win32", () => {
        const { h } = setup({ platform: "win32" });
        expect([...h.registered.keys()]).toEqual([ACCEL]);
    });

    it("native callback sends the existing channel with no payload and no focus", () => {
        const { h } = setup();
        const cb = nativeCallback(h);
        expect(typeof cb).toBe("function");
        if (typeof cb !== "function") return;
        cb();
        expect(h.sent).toEqual([{ channel: CHANNEL, args: [] }]);
    });

    it("native success plus a focused before-input still sends exactly once", () => {
        const { h, controller } = setup();
        const cb = nativeCallback(h);
        expect(typeof cb).toBe("function");
        if (typeof cb !== "function") return;
        const preventDefault = vi.fn();
        cb();
        const consumed = controller.handleBeforeInput({ preventDefault }, toggleInput());
        expect(h.sent).toEqual([{ channel: CHANNEL, args: [] }]);
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(consumed).toBe(true);
    });

    it("falls back to focused input when register returns false, without owning the shortcut", () => {
        const { h, controller } = setup({ register: false });
        expect(h.registered.size).toBe(0);
        expect(h.warnings.length).toBeGreaterThan(0);
        const preventDefault = vi.fn();
        const consumed = controller.handleBeforeInput({ preventDefault }, toggleInput());
        expect(consumed).toBe(true);
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(h.sent).toEqual([{ channel: CHANNEL, args: [] }]);
        controller.dispose();
        expect(h.unregistered).toEqual([]);
    });

    it("falls back and reports a diagnostic when register throws", () => {
        const { h, controller } = setup({ register: new Error("already taken") });
        expect(h.registered.size).toBe(0);
        expect(h.warnings.length).toBeGreaterThan(0);
        const preventDefault = vi.fn();
        const consumed = controller.handleBeforeInput({ preventDefault }, toggleInput());
        expect(consumed).toBe(true);
        expect(h.sent).toEqual([{ channel: CHANNEL, args: [] }]);
        controller.dispose();
        expect(h.unregistered).toEqual([]);
        expect(h.unregisterAll).not.toHaveBeenCalled();
    });

    const nonMatching: Array<[string, Partial<ShortcutInput>]> = [
        ["keyUp", { type: "keyUp" }],
        ["wrong key", { key: "n" }],
        ["alt held", { alt: true }],
        ["meta held", { meta: true }],
        ["no control", { control: false }],
        ["no shift", { shift: false }],
    ];

    it.each(nonMatching)("ignores %s before-input (no send, no intercept)", (_label, overrides) => {
        const { h, controller } = setup({ register: false });
        const preventDefault = vi.fn();
        const consumed = controller.handleBeforeInput({ preventDefault }, toggleInput(overrides));
        expect(consumed).toBe(false);
        expect(preventDefault).not.toHaveBeenCalled();
        expect(h.sent).toEqual([]);
    });

    it("ignores auto-repeat keydowns but still sends on a fresh press", () => {
        const { h, controller } = setup({ register: false });
        const preventDefault = vi.fn();
        const consumed = controller.handleBeforeInput({ preventDefault }, toggleInput({ isAutoRepeat: true }));
        expect(consumed).toBe(true);
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(h.sent).toEqual([]);
        controller.handleBeforeInput({ preventDefault: vi.fn() }, toggleInput());
        expect(h.sent).toEqual([{ channel: CHANNEL, args: [] }]);
    });

    it("is inert on non-win32 (no register, no intercept)", () => {
        const { h, controller } = setup({ platform: "darwin" });
        expect(h.registered.size).toBe(0);
        const preventDefault = vi.fn();
        const consumed = controller.handleBeforeInput({ preventDefault }, toggleInput());
        expect(consumed).toBe(false);
        expect(preventDefault).not.toHaveBeenCalled();
        expect(h.sent).toEqual([]);
    });

    it("no-ops when the window or its webContents is absent or destroyed", () => {
        const { h } = setup();
        const cb = nativeCallback(h);
        expect(typeof cb).toBe("function");
        if (typeof cb !== "function") return;
        cb();
        expect(h.sent).toHaveLength(1);
        h.setWindow(null);
        cb();
        const destroyed = h.newWindow();
        destroyed.destroy();
        h.setWindow(destroyed.window);
        cb();
        const deadContents = h.newWindow();
        deadContents.destroyWebContents();
        h.setWindow(deadContents.window);
        cb();
        h.setWindow({ isDestroyed: (): boolean => false, webContents: null });
        cb();
        h.setWindow({ isDestroyed: (): boolean => false, webContents: undefined });
        cb();
        expect(h.sent).toHaveLength(1);
    });

    it("resolves the current main window dynamically on every callback", () => {
        const { h } = setup();
        const cb = nativeCallback(h);
        expect(typeof cb).toBe("function");
        if (typeof cb !== "function") return;
        cb();
        expect(h.first.sent).toHaveLength(1);
        const second = h.newWindow();
        h.setWindow(second.window);
        cb();
        expect(second.sent).toHaveLength(1);
        expect(h.first.sent).toHaveLength(1);
        expect(h.sent).toHaveLength(2);
    });

    it("dispose unregisters only its own accelerator and is idempotent", () => {
        const { h, controller } = setup();
        expect(h.registered.has(ACCEL)).toBe(true);
        h.registered.set("CommandOrControl+K", () => {});
        controller.dispose();
        expect(h.unregistered).toEqual([ACCEL]);
        expect(h.registered.has("CommandOrControl+K")).toBe(true);
        controller.dispose();
        expect(h.unregistered).toEqual([ACCEL]);
        expect(h.unregisterAll).not.toHaveBeenCalled();
    });

    it("ignores a late native callback and focused input after dispose", () => {
        const { h, controller } = setup();
        const cb = nativeCallback(h);
        expect(typeof cb).toBe("function");
        if (typeof cb !== "function") return;
        cb();
        expect(h.sent).toHaveLength(1);
        controller.dispose();
        cb();
        const preventDefault = vi.fn();
        const consumed = controller.handleBeforeInput({ preventDefault }, toggleInput());
        expect(h.sent).toHaveLength(1);
        expect(consumed).toBe(false);
        expect(preventDefault).not.toHaveBeenCalled();
    });

    it("does not unregister on dispose when registration failed", () => {
        const { h, controller } = setup({ register: false });
        expect(h.warnings.length).toBeGreaterThan(0);
        controller.dispose();
        expect(h.unregistered).toEqual([]);
        expect(h.unregisterAll).not.toHaveBeenCalled();
    });
});
