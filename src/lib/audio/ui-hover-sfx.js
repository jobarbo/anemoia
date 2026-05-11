/**
 * Short hover tick + distinct click for interactive UI (canvas + DOM zones).
 * Hover skips touch-primary devices via `(pointer: fine)` unless overridden.
 * Click plays for mouse and touch unless `requireFinePointer: true`.
 */

import {playSfx} from "./sfx.js";

/** Subtle tick; swap for a dedicated asset if you add one under `public/`. */
export const UI_HOVER_SFX_SRC = "/assets/audio/mouse_hover.mp3";

export const UI_HOVER_SFX_VOLUME = 0.11;

/** Sharper than hover; served from `public/`. */
export const UI_CLICK_SFX_SRC = "/assets/audio/mouse_click2.mp3";

export const UI_CLICK_SFX_VOLUME = 0.16;

/** @type {number} */
let lastThrottledClickMs = 0;

function isFinePointer() {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
	return window.matchMedia("(pointer: fine)").matches;
}

/**
 * @param {{ volume?: number, poolSize?: number, requireFinePointer?: boolean }} [options]
 */
export function playUiHoverSfx(options = {}) {
	if (options.requireFinePointer !== false && !isFinePointer()) return;
	playSfx(UI_HOVER_SFX_SRC, {
		volume: options.volume ?? UI_HOVER_SFX_VOLUME,
		poolSize: options.poolSize ?? 3,
	});
}

/**
 * Play once when the hovered interactive target changes (enter or move to another target).
 *
 * @param {string|null|undefined} previousKey
 * @param {string|null|undefined} nextKey
 * @param {{ volume?: number, poolSize?: number, requireFinePointer?: boolean }} [options]
 * @returns {string|null} Store as `previousKey` on the next frame.
 */
export function playUiHoverSfxIfTargetChanged(previousKey, nextKey, options = {}) {
	const prev = previousKey == null ? null : String(previousKey);
	const next = nextKey == null || nextKey === "" ? null : String(nextKey);
	if (next === null || next === prev) return next;
	playUiHoverSfx(options);
	return next;
}

/**
 * @param {{ volume?: number, poolSize?: number, requireFinePointer?: boolean, throttleMs?: number }} [options]
 */
export function playUiClickSfx(options = {}) {
	if (options.requireFinePointer === true && !isFinePointer()) return;
	const gap = options.throttleMs ?? 0;
	if (gap > 0 && typeof performance !== "undefined") {
		const t = performance.now();
		if (t - lastThrottledClickMs < gap) return;
		lastThrottledClickMs = t;
	}
	playSfx(UI_CLICK_SFX_SRC, {
		volume: options.volume ?? UI_CLICK_SFX_VOLUME,
		poolSize: options.poolSize ?? 4,
	});
}
