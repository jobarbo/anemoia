/**
 * LOGO phase — centered OS splash box with pixel-art boot mark,
 * title text, version info, and a blinking "click to continue" prompt.
 *
 * The user can advance at any time by clicking.
 * Auto-advances after AUTO_ADVANCE_MS if no input.
 *
 * Interface:
 *   createLogoPhase(sketch, artBuffer, fontApi) → { draw(now), isDone(), onPointerPressed(), reset() }
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

	function reset() {
		startTime = null;
		advanced = false;
	}

	function isDone() {
		if (startTime === null) return false;
		return advanced || sketch.millis() - startTime > AUTO_ADVANCE_MS;
	}

	function onPointerPressed() {
		advanced = true;
	}

	function draw(now) {
		if (startTime === null) startTime = now;

		const buf = artBuffer;
		const w = buf.width;
		const h = buf.height;
		const canvasFont = fontApi?.getCanvasFont?.() ?? "monospace";

		buf.background(...BG);
		buf.noStroke();

		// ── Pixel-art logo mark + typography metrics ──────────────────────────
		// The splash box should fit its content to avoid clipping/overflow.
		const px = Math.max(4, Math.round(w * 0.007)); // pixel size
		const markGridW = 7;
		const markGridH = 9;
		const markTotalW = markGridW * px;
		const markH = markGridH * px;
		const titleSz = Math.round(w * 0.055);
		const subSz = Math.round(w * 0.022);
		const titleOffsetY = markH + titleSz * 0.7;
		const subtitleOffsetY = titleOffsetY + titleSz * 0.85;

		// Measure text using the same font config used at draw time.
		fontApi?.applyCanvasFont?.(buf, titleSz) ?? (buf.textFont(canvasFont), buf.textSize(titleSz));
		const titleW = buf.textWidth("BOOT-BOY OS");
		fontApi?.applyCanvasFont?.(buf, subSz) ?? (buf.textFont(canvasFont), buf.textSize(subSz));
		const subtitleW = buf.textWidth("VERSION  3.0");

		const contentW = Math.max(markTotalW, titleW, subtitleW);
		const contentH = subtitleOffsetY + subSz * 0.5;
		const padX = Math.max(26, w * 0.04);
		const padY = Math.max(20, h * 0.035);
		const minBoxW = w * 0.35;
		const minBoxH = h * 0.22;
		const maxBoxW = w * 0.9;
		const maxBoxH = h * 0.6;

		const boxW = sketch.constrain(contentW + padX * 2, minBoxW, maxBoxW);
		const boxH = sketch.constrain(contentH + padY * 2, minBoxH, maxBoxH);
		const boxX = (w - boxW) / 2;
		const boxY = (h - boxH) / 2 - h * 0.04;

		// Box fill — chrome gradient (dark navy, lighter toward center)
		const ctx = buf.drawingContext;
		const boxGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
		boxGrad.addColorStop(0, "rgba(72, 38, 22, 1)");
		boxGrad.addColorStop(0.5, "rgba(38, 20, 12, 1)");
		boxGrad.addColorStop(1, "rgba(18, 10, 6, 1)");
		ctx.fillStyle = boxGrad;
		ctx.fillRect(boxX, boxY, boxW, boxH);

		// Left accent stripe (Winamp title-bar chrome stripe)
		const stripeW = boxW * 0.055;
		const sGrad = ctx.createLinearGradient(boxX, boxY, boxX + stripeW, boxY);
		sGrad.addColorStop(0, "rgba(255, 165, 100, 0.5)");
		sGrad.addColorStop(1, "rgba(100, 50, 28, 0)");
		ctx.fillStyle = sGrad;
		ctx.fillRect(boxX, boxY, stripeW, boxH);

		// Box border (double-line effect: outer thick, inner thin)
		buf.noFill();
		buf.stroke(160, 180, 225, 220);
		buf.strokeWeight(3);
		buf.rect(boxX, boxY, boxW, boxH);
		buf.strokeWeight(1);
		buf.stroke(100, 130, 185, 120);
		buf.rect(boxX + 6, boxY + 6, boxW - 12, boxH - 12);
		buf.noStroke();

		// ── Pixel-art logo mark ────────────────────────────────────────────────
		// A simple stylized "B" made of pixel blocks (Boot-Boy mascot silhouette)
		const logoBlockH = contentH;
		const cx = boxX + boxW / 2;
		const markY = boxY + boxH / 2 - logoBlockH / 2;

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

		const markStartX = cx - markTotalW / 2;

		buf.fill(215, 230, 255, 240);
		buf.noStroke();
		for (const [col, row] of MARK_PIXELS) {
			buf.rect(markStartX + col * px, markY + row * px, px - 1, px - 1);
		}

		// ── Title ─────────────────────────────────────────────────────────────
		const titleY = markY + titleOffsetY;
		drawTitleAberration(buf, "BOOT-BOY OS", cx, titleY, titleSz, 255, sketch, canvasFont, fontApi?.getCanvasFontWeight?.() ?? THEME.FONT_WEIGHT);

		// ── Subtitle ──────────────────────────────────────────────────────────
		buf.textAlign(sketch.CENTER, sketch.CENTER);
		fontApi?.applyCanvasFont?.(buf, subSz) ?? (buf.textFont(canvasFont), buf.textSize(subSz));
		buf.fill(160, 180, 225, 200);
		buf.text("VERSION  3.0", cx, markY + subtitleOffsetY);

		// ── Version info (below box) ───────────────────────────────────────────
		const infoSz = Math.max(10, Math.round(w * 0.013));
		const infoY = boxY + boxH + infoSz * 1.6;
		buf.textAlign(sketch.CENTER, sketch.CENTER);
		fontApi?.applyCanvasFont?.(buf, infoSz) ?? (buf.textFont(canvasFont), buf.textSize(infoSz));
		buf.fill(...THEME.GREEN_SUBTLE, 180);
		buf.text("Version 3.0.1   Build 9804", cx, infoY);
		buf.fill(...THEME.GREEN_SUBTLE, 120);
		buf.text("Copyright (C) 1998  BootSoft Inc.  Tous droits réservés.", cx, infoY + infoSz * 1.8);

		// ── Prompt ─────────────────────────────────────────────────────────────
		const promptSz = Math.max(10, Math.round(w * 0.016));
		buf.textAlign(sketch.CENTER, sketch.CENTER);
		fontApi?.applyCanvasFont?.(buf, promptSz) ?? buf.textSize(promptSz);
		buf.fill(...THEME.GREEN_MID, 210);
		buf.text("[ CLIQUEZ POUR CONTINUER ]", cx, h - h * 0.07);
	}

	return {draw, isDone, onPointerPressed, reset};
}
