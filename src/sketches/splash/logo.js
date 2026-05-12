/**
 * LOGO phase — centered boot certification card inspired by late-90s
 * Energy Star / OEM startup screens.
 *
 * The user can advance at any time by clicking.
 * Auto-advances after AUTO_ADVANCE_MS if no input.
 *
 * Interface:
 *   createLogoPhase(sketch, artBuffer, fontApi) → { draw(now), isDone(), onPointerPressed(), reset() }
 */

import {getLocale} from "../../lib/data/scene-data.js";
import {splashClickPrompt, splashLogoOemFooter} from "../../lib/i18n/ui-strings.js";
import {THEME, drawTitleAberration, readingUiFontSize} from "../../lib/utils/retro-theme.js";

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
	let promptRect = null;

	function reset() {
		startTime = null;
		advanced = false;
		promptRect = null;
	}

	function isDone() {
		if (startTime === null) return false;
		return advanced || sketch.millis() - startTime > AUTO_ADVANCE_MS;
	}

	function isPointerOver(x, y) {
		if (!promptRect) return false;
		return x >= promptRect.x && x <= promptRect.x + promptRect.w && y >= promptRect.y && y <= promptRect.y + promptRect.h;
	}

	function onPointerPressed(x, y) {
		if (!isPointerOver(x, y)) return false;
		advanced = true;
		return true;
	}

	function onConfirm() {
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

		// ── Certification-card metrics ───────────────────────────────────────
		const px = Math.max(4, Math.round(w * 0.007)); // pixel size
		const markGridW = 9;
		const markGridH = 11;
		const markTotalW = markGridW * px;
		const markH = markGridH * px;
		const titleSz = Math.round(w * 0.05);
		const subSz = readingUiFontSize(Math.round(w * 0.02));
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
		const minBoxW = w * 0.42;
		const minBoxH = h * 0.26;
		const maxBoxW = w * 0.9;
		const maxBoxH = h * 0.6;

		const boxW = sketch.constrain(contentW + padX * 2, minBoxW, maxBoxW);
		const boxH = sketch.constrain(contentH + padY * 2, minBoxH, maxBoxH);
		const boxX = (w - boxW) / 2;
		const boxY = (h - boxH) / 2 - h * 0.04;

		// Box fill — cool blue OEM boot-card gradient
		const ctx = buf.drawingContext;
		const boxGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
		boxGrad.addColorStop(0, "rgba(10, 34, 92, 1)");
		boxGrad.addColorStop(0.5, "rgba(7, 20, 58, 1)");
		boxGrad.addColorStop(1, "rgba(4, 10, 26, 1)");
		ctx.fillStyle = boxGrad;
		ctx.fillRect(boxX, boxY, boxW, boxH);

		// Left accent stripe — OEM certification panel cue
		const stripeW = boxW * 0.07;
		const sGrad = ctx.createLinearGradient(boxX, boxY, boxX + stripeW, boxY);
		sGrad.addColorStop(0, "rgba(120, 190, 255, 0.55)");
		sGrad.addColorStop(1, "rgba(40, 90, 180, 0)");
		ctx.fillStyle = sGrad;
		ctx.fillRect(boxX, boxY, stripeW, boxH);

		const topGlow = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH * 0.22);
		topGlow.addColorStop(0, "rgba(220, 240, 255, 0.18)");
		topGlow.addColorStop(1, "rgba(220, 240, 255, 0)");
		ctx.fillStyle = topGlow;
		ctx.fillRect(boxX, boxY, boxW, boxH * 0.22);

		// Box border (double-line effect: outer thick, inner thin)
		buf.noFill();
		buf.stroke(186, 220, 255, 235);
		buf.strokeWeight(3);
		buf.rect(boxX, boxY, boxW, boxH);
		buf.strokeWeight(1);
		buf.stroke(110, 168, 240, 140);
		buf.rect(boxX + 6, boxY + 6, boxW - 12, boxH - 12);
		buf.noStroke();

		// ── Pixel-art logo mark ────────────────────────────────────────────────
		// Geometric segmented "T" inspired by the provided reference.
		const logoBlockH = contentH;
		const cx = boxX + boxW / 2;
		const markY = boxY + boxH / 2 - logoBlockH / 2;

		// Pixel map: rows of [col, row] offsets (0-indexed) relative to top-left of mark.
		// Layout:
		// - wide top bar
		// - split shoulder bars
		// - two long vertical pillars
		// - short base bar
		const MARK_PIXELS = [
			// top cap
			[1, 0],
			[2, 0],
			[3, 0],
			[4, 0],
			[5, 0],
			[6, 0],
			[7, 0],
			// split shoulder bars
			[1, 2],
			[2, 2],
			[3, 2],
			[6, 2],
			[7, 2],
			// left pillar
			[3, 4],
			[3, 5],
			[3, 6],
			[3, 7],
			[3, 8],
			[3, 9],
			// right pillar
			[5, 2],
			[5, 3],
			[5, 4],
			[5, 5],
			[5, 6],
			[5, 7],
			[5, 8],
			[5, 9],
			// base
			[3, 10],
			[4, 10],
			[5, 10],
		];

		const markStartX = cx - markTotalW / 2;

		buf.fill(225, 240, 255, 242);
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
		buf.fill(188, 216, 255, 220);
		buf.text("CERT. BY T-CORP", cx, markY + subtitleOffsetY);

		// ── Version info (below box) ───────────────────────────────────────────
		const infoSz = readingUiFontSize(Math.max(10, Math.round(w * 0.013)));
		const infoY = boxY + boxH + infoSz * 1.6;
		buf.textAlign(sketch.CENTER, sketch.CENTER);
		fontApi?.applyCanvasFont?.(buf, infoSz) ?? (buf.textFont(canvasFont), buf.textSize(infoSz));
		buf.fill(176, 208, 255, 220);
		buf.text("Boot-Boy Firmware 3.0.1   Build 9804", cx, infoY);
		buf.fill(150, 186, 230, 175);
		buf.text(splashLogoOemFooter(getLocale()), cx, infoY + infoSz * 1.8);

		// ── Prompt ─────────────────────────────────────────────────────────────
		const promptSz = readingUiFontSize(Math.max(10, Math.round(w * 0.016)));
		buf.textAlign(sketch.CENTER, sketch.CENTER);
		fontApi?.applyCanvasFont?.(buf, promptSz) ?? buf.textSize(promptSz);
		const promptText = splashClickPrompt(getLocale());
		const promptY = h - h * 0.12;
		const promptW = buf.textWidth(promptText);
		const promptPadX = Math.max(10, promptSz * 0.65);
		const promptPadY = Math.max(6, promptSz * 0.4);
		promptRect = {
			x: cx - promptW / 2 - promptPadX,
			y: promptY - promptSz * 0.5 - promptPadY,
			w: promptW + promptPadX * 2,
			h: promptSz + promptPadY * 2,
		};
		const promptHovered = isPointerOver(sketch.mouseX, sketch.mouseY);
		if (promptHovered) {
			buf.noFill();
			buf.stroke(210, 232, 255, 180);
			buf.strokeWeight(1);
			buf.rect(promptRect.x, promptRect.y, promptRect.w, promptRect.h, 4);
			buf.noStroke();
		}
		buf.fill(210, 232, 255, promptHovered ? 255 : 230);
		buf.text(promptText, cx, promptY);
	}

	return {draw, isDone, isPointerOver, onPointerPressed, onConfirm, reset};
}
