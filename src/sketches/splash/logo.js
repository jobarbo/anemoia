/**
 * LOGO phase — centered OS splash box with pixel-art boot mark,
 * title text, version info, and a blinking "press any key" prompt.
 *
 * The user can advance at any time by pressing a key.
 * Auto-advances after AUTO_ADVANCE_MS if no input.
 *
 * Interface:
 *   createLogoPhase(sketch, artBuffer, fontApi) → { draw(now), isDone(), onKeyPressed(), reset() }
 */

import {THEME, drawTitleAberration} from "../../lib/utils/retro-theme.js";

const AUTO_ADVANCE_MS = 60000000;

const BG = [...THEME.BG];

/**
 * @param {import('p5')} sketch
 * @param {import('p5').Graphics} artBuffer
 * @param {{ getCanvasFont?: () => string | import('p5').Font }} [fontApi]
 */
export function createLogoPhase(sketch, artBuffer, fontApi) {
	let startTime = null;
	let advanced = false;
	let blinkVisible = true;
	let lastBlink = 0;

	function reset() {
		startTime = null;
		advanced = false;
		blinkVisible = true;
		lastBlink = 0;
	}

	function isDone() {
		if (startTime === null) return false;
		return advanced || sketch.millis() - startTime > AUTO_ADVANCE_MS;
	}

	function onKeyPressed() {
		advanced = true;
	}

	function draw(now) {
		if (startTime === null) startTime = now;

		// Blink
		if (now - lastBlink > THEME.BLINK_MS) {
			blinkVisible = !blinkVisible;
			lastBlink = now;
		}

		const buf = artBuffer;
		const w = buf.width;
		const h = buf.height;
		const canvasFont = fontApi?.getCanvasFont?.() ?? "monospace";
		console.log(canvasFont);

		buf.background(...BG);
		buf.noStroke();

		// ── Box dimensions ────────────────────────────────────────────────────
		const boxW = Math.min(w * 0.52, 1920);
		const boxH = Math.min(h * 0.42, 1080);
		const boxX = (w - boxW) / 2;
		const boxY = (h - boxH) / 2 - h * 0.04;

		// Box fill — dark teal, referencing the Bell Atlantic image vibe
		buf.fill(12, 36, 72);
		buf.noFill();
		buf.noStroke(0, 255, 0);
		buf.rect(boxX, boxY, boxW, boxH);

		// Box border (double-line effect: outer thick, inner thin)
		buf.noFill();
		buf.stroke(0, 180, 255, 220);
		buf.strokeWeight(3);
		buf.rect(boxX, boxY, boxW, boxH);
		buf.strokeWeight(1);
		buf.stroke(0, 120, 200, 120);
		buf.rect(boxX + 6, boxY + 6, boxW - 12, boxH - 12);
		buf.noStroke();

		// ── Pixel-art logo mark ────────────────────────────────────────────────
		// A simple stylized "B" made of pixel blocks (Boot-Boy mascot silhouette)
		const cx = w / 2;
		const markY = boxY + boxH * 0.13;
		const px = Math.max(4, Math.round(w * 0.007)); // pixel size

		// Pixel map: rows of [col, row] offsets (0-indexed) relative to top-left of mark
		// Draws a chunky capital B in a 7-wide × 9-tall pixel grid
		const MARK_PIXELS = [
			// col 0 (left vertical bar)
			[0, 0],
			[0, 1],
			[0, 2],
			[0, 3],
			[0, 4],
			[0, 5],
			[0, 6],
			[0, 7],
			[0, 8],
			// top bump
			[1, 0],
			[2, 0],
			[3, 0],
			[4, 1],
			[4, 2],
			[1, 3],
			[2, 3],
			[3, 3],
			// bottom bump
			[4, 4],
			[4, 5],
			[4, 6],
			[1, 7],
			[2, 7],
			[3, 7],
			// col 1 horizontal connectors
			[1, 4],
			[1, 5],
			[1, 6],
		];

		const markGridW = 7;
		const markGridH = 9;
		const markTotalW = markGridW * px;
		const markStartX = cx - markTotalW / 2;

		buf.fill(0, 220, 255, 240);
		buf.noStroke();
		for (const [col, row] of MARK_PIXELS) {
			buf.rect(markStartX + col * px, markY + row * px, px - 1, px - 1);
		}

		// ── Title ─────────────────────────────────────────────────────────────
		const titleSz = Math.round(w * 0.055);
		const titleY = markY + markGridH * px + titleSz * 0.7;
		drawTitleAberration(buf, "BOOT-BOY OS", cx, titleY, titleSz, 255, sketch, canvasFont, 800);

		// ── Subtitle ──────────────────────────────────────────────────────────
		const subSz = Math.round(w * 0.022);
		buf.textAlign(sketch.CENTER, sketch.CENTER);
		fontApi?.applyCanvasFont?.(buf, subSz) ?? (buf.textFont(canvasFont), buf.textSize(subSz));
		buf.fill(0, 200, 240, 200);
		buf.text("RELEASE  3.0", cx, titleY + titleSz * 0.85);

		// ── Version info (below box) ───────────────────────────────────────────
		const infoSz = Math.max(10, Math.round(w * 0.013));
		const infoY = boxY + boxH + infoSz * 1.6;
		buf.textAlign(sketch.CENTER, sketch.CENTER);
		fontApi?.applyCanvasFont?.(buf, infoSz) ?? (buf.textFont(canvasFont), buf.textSize(infoSz));
		buf.fill(...THEME.GREEN_SUBTLE, 180);
		buf.text("Version 3.0.1   Build 9804", cx, infoY);
		buf.fill(...THEME.GREEN_SUBTLE, 120);
		buf.text("Copyright (C) 1998  BootSoft Inc.  All rights reserved.", cx, infoY + infoSz * 1.8);

		// ── Blinking prompt ────────────────────────────────────────────────────
		if (blinkVisible) {
			const promptSz = Math.max(10, Math.round(w * 0.016));
			buf.textAlign(sketch.CENTER, sketch.CENTER);
			fontApi?.applyCanvasFont?.(buf, promptSz) ?? buf.textSize(promptSz);
			buf.fill(...THEME.GREEN_MID, 210);
			buf.text("[ PRESS ANY KEY TO CONTINUE ]", cx, h - h * 0.07);
		}
	}

	return {draw, isDone, onKeyPressed, reset};
}
