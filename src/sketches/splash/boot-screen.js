/**
 * BOOT — court écran de mise sous tension avant la carte logo.
 *
 * Avance automatiquement après `AUTO_ADVANCE_MS`, ou immédiatement au clic /
 * Entrée (toute la zone canvas est cliquable).
 *
 * Interface:
 *   createBootScreenPhase(sketch, artBuffer, fontApi) → { draw, isDone, isPointerOver, onPointerPressed, onConfirm, reset }
 */

import {THEME, readingUiFontSize} from "../../lib/utils/retro-theme.js";

const BG = [...THEME.BG];
/** Durée minimale d’affichage si l’utilisateur saute tout de suite (évite un flash). */
const MIN_VISIBLE_MS = 380;
/** Passage auto vers le logo si pas d’entrée. */
const AUTO_ADVANCE_MS = 1650;

/**
 * @param {import('p5')} sketch
 * @param {import('p5').Graphics} artBuffer
 * @param {{ getCanvasFont?: () => string | import('p5').Font, getCanvasFontWeight?: () => string | number, applyCanvasFont?: (buf: import('p5').Graphics, size: number, options?: { weight?: string | number }) => void }} [fontApi]
 */
export function createBootScreenPhase(sketch, artBuffer, fontApi) {
	let startTime = null;
	let skipRequested = false;

	function reset() {
		startTime = null;
		skipRequested = false;
	}

	function isDone() {
		if (startTime === null) return false;
		const elapsed = sketch.millis() - startTime;
		if (elapsed < MIN_VISIBLE_MS) return false;
		return skipRequested || elapsed >= AUTO_ADVANCE_MS;
	}

	function isPointerOver(x, y) {
		if (isDone() || startTime === null) return false;
		const buf = artBuffer;
		return x >= 0 && x <= buf.width && y >= 0 && y <= buf.height;
	}

	function onPointerPressed(x, y) {
		if (!isPointerOver(x, y)) return false;
		skipRequested = true;
		return true;
	}

	function onConfirm() {
		if (startTime === null || sketch.millis() - startTime < MIN_VISIBLE_MS) return;
		skipRequested = true;
	}

	function draw(now) {
		if (startTime === null) startTime = now;

		const buf = artBuffer;
		const w = buf.width;
		const h = buf.height;
		const elapsed = now - startTime;

		buf.background(...BG);
		buf.noStroke();

		const fade = sketch.constrain(elapsed / 420, 0, 1);
		const titleAlpha = Math.round(fade * 255);
		const subAlpha = Math.round(fade * 220);

		const subSize = readingUiFontSize(Math.max(11, Math.round(w * 0.018)));
		fontApi?.applyCanvasFont?.(buf, subSize, {weight: fontApi?.getCanvasFontWeight?.() ?? "400"}) ?? buf.textSize(subSize);
		buf.fill(...THEME.GREEN_SUBTLE, subAlpha);
		buf.text("Mise en route du système…", w / 2, h * 0.52);
	}

	return {draw, isDone, isPointerOver, onPointerPressed, onConfirm, reset};
}
