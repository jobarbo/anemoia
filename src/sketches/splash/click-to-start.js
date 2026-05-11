/**
 * CLICK_TO_START — premier écran : un geste utilisateur démarre l’expérience et
 * débloque l’audio (politique autoplay des navigateurs).
 *
 * Interface:
 *   createClickToStartPhase(sketch, artBuffer, fontApi) → { draw, isDone, isPointerOver, onPointerPressed, onConfirm, reset }
 */

import {THEME, readingUiFontSize} from "../../lib/utils/retro-theme.js";

const BG = [...THEME.BG];
const PROMPT = "[ CLIQUER POUR DÉMARRER ]";

/**
 * @param {import('p5')} sketch
 * @param {import('p5').Graphics} artBuffer
 * @param {{ getCanvasFont?: () => string | import('p5').Font, getCanvasFontWeight?: () => string | number, applyCanvasFont?: (buf: import('p5').Graphics, size: number, options?: { weight?: string | number }) => void }} [fontApi]
 */
export function createClickToStartPhase(sketch, artBuffer, fontApi) {
	let confirmed = false;

	function reset() {
		confirmed = false;
	}

	function isDone() {
		return confirmed;
	}

	function isPointerOver(x, y) {
		if (confirmed) return false;
		const buf = artBuffer;
		return x >= 0 && x <= buf.width && y >= 0 && y <= buf.height;
	}

	function onPointerPressed(x, y) {
		if (!isPointerOver(x, y)) return false;
		confirmed = true;
		return true;
	}

	function onConfirm() {
		confirmed = true;
	}

	function draw(now) {
		const buf = artBuffer;
		const w = buf.width;
		const h = buf.height;

		buf.background(...BG);
		buf.noStroke();
		buf.textAlign(sketch.CENTER, sketch.CENTER);

		const blink = Math.floor(now / THEME.BLINK_MS) % 2 === 0;
		if (blink) {
			const promptSize = readingUiFontSize(Math.max(12, Math.round(w * 0.016)));
			fontApi?.applyCanvasFont?.(buf, promptSize, {weight: fontApi?.getCanvasFontWeight?.() ?? "500"}) ?? (buf.textFont(fontApi?.getCanvasFont?.() ?? "monospace"), buf.textSize(promptSize));
			buf.fill(...THEME.GREEN_MID);
			buf.text(PROMPT, w / 2, h * 0.48);
		}
	}

	return {draw, isDone, isPointerOver, onPointerPressed, onConfirm, reset};
}
