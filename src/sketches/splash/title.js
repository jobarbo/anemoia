/**
 * TITLE phase — prints the project title using the active splash font,
 * revealed progressively across the word itself.
 *
 * Interface:
 *   createTitlePhase(sketch, artBuffer, fontApi) → { draw(now), isDone(), reset() }
 */

import {THEME} from "../../lib/utils/retro-theme.js";

const BG = [...THEME.BG];

const TITLE_TEXT = "ANEMOIA";
const PROGRESS_STEP_COUNT = 30;
const ROW_STEP_MS = 128;
const DONE_HOLD_MS = 950;

/**
 * @param {import('p5')} sketch
 * @param {import('p5').Graphics} artBuffer
 * @param {{ getCanvasFont?: () => string | import('p5').Font, getCanvasFontVersion?: () => number, getCanvasFontWeight?: () => string | number, applyCanvasFont?: (buf: import('p5').Graphics, size: number, options?: { weight?: string | number, style?: "normal" | "italic" }) => void }} [fontApi]
 */
export function createTitlePhase(sketch, artBuffer, fontApi) {
	let revealedRows = 0;
	let totalRows = 0;
	let lastStep = 0;
	let doneAt = null;
	let blinkVisible = true;
	let lastBlink = 0;
	let titleLayer = null;
	let layout = null;
	let layerFontVersion = -1;

	function ensureLayer(w, h) {
		const currentFontVersion = fontApi?.getCanvasFontVersion?.() ?? 0;
		if (titleLayer && titleLayer.width === w && titleLayer.height === h && layout && layerFontVersion === currentFontVersion) return;

		titleLayer = sketch.createGraphics(w, h);
		titleLayer.clear();

		const canvasFont = fontApi?.getCanvasFont?.() ?? "monospace";
		const titleSize = Math.max(54, Math.round(w * 0.135));
		const titleX = w / 2;
		const titleY = h * 0.52;

		titleLayer.textAlign(sketch.LEFT, sketch.BASELINE);
		fontApi?.applyCanvasFont?.(titleLayer, titleSize, {weight: fontApi?.getCanvasFontWeight?.() ?? "700"}) ?? (titleLayer.textFont(canvasFont), titleLayer.textSize(titleSize));
		const metrics = titleLayer.drawingContext.measureText(TITLE_TEXT);
		const titleWidth = Math.ceil(titleLayer.textWidth(TITLE_TEXT));
		const titleAscent = titleLayer.textAscent();
		const titleDescent = titleLayer.textDescent();
		const actualLeft = Number.isFinite(metrics.actualBoundingBoxLeft) ? metrics.actualBoundingBoxLeft : 0;
		const actualRight = Number.isFinite(metrics.actualBoundingBoxRight) ? metrics.actualBoundingBoxRight : titleWidth;
		const actualAscent = Number.isFinite(metrics.actualBoundingBoxAscent) ? metrics.actualBoundingBoxAscent : titleAscent;
		const actualDescent = Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : titleDescent;
		const inkWidth = Math.ceil(Math.max(titleWidth, actualLeft + actualRight));
		const inkHeight = Math.ceil(actualAscent + actualDescent);
		const titlePaddingX = 4;
		const titlePaddingY = 4;
		const titleBaseline = Math.round(titleY + (actualAscent - actualDescent) / 2);
		const titleDrawX = Math.round(titleX - inkWidth / 2 + actualLeft);
		const titleLeft = Math.max(0, Math.round(titleDrawX - actualLeft - titlePaddingX));
		const titleTop = Math.max(0, Math.round(titleBaseline - actualAscent - titlePaddingY));
		const titleBoundsWidth = Math.ceil(inkWidth + titlePaddingX * 2);
		const titleBoundsHeight = Math.ceil(inkHeight + titlePaddingY * 2);

		// Slight glow pass
		titleLayer.fill(...THEME.GREEN_PRIMARY, 70);
		titleLayer.text(TITLE_TEXT, titleDrawX + 2, titleBaseline + 2);

		// Main title pass
		titleLayer.fill(...THEME.GREEN_PRIMARY, 240);
		titleLayer.text(TITLE_TEXT, titleDrawX, titleBaseline);

		layout = {
			titleY,
			titleLeft,
			titleTop,
			titleWidth: Math.min(w - titleLeft, titleBoundsWidth),
			titleHeight: Math.min(h - titleTop, titleBoundsHeight),
			headingX: w * 0.08,
			headingY: titleY - titleSize * 0.9,
			statusY: titleY + titleSize * 0.85,
		};

		totalRows = PROGRESS_STEP_COUNT;
		revealedRows = Math.min(revealedRows, totalRows);
		layerFontVersion = currentFontVersion;
	}

	function reset() {
		revealedRows = 0;
		totalRows = 0;
		lastStep = 0;
		doneAt = null;
		blinkVisible = true;
		lastBlink = 0;
		titleLayer = null;
		layout = null;
		layerFontVersion = -1;
	}

	function isDone() {
		return doneAt !== null && sketch.millis() - doneAt > DONE_HOLD_MS;
	}

	function draw(now) {
		if (now - lastBlink > THEME.BLINK_MS) {
			blinkVisible = !blinkVisible;
			lastBlink = now;
		}

		const buf = artBuffer;
		const w = buf.width;
		const h = buf.height;
		ensureLayer(w, h);

		if (doneAt === null && now - lastStep > ROW_STEP_MS) {
			lastStep = now;
			revealedRows = Math.min(revealedRows + 1, totalRows);
			if (revealedRows >= totalRows) doneAt = now;
		}

		const canvasFont = fontApi?.getCanvasFont?.() ?? "monospace";
		const headingX = layout?.headingX ?? w * 0.08;
		const headingY = layout?.headingY ?? h * 0.28;
		const statusY = layout?.statusY ?? h * 0.74;

		buf.background(...BG);
		buf.noStroke();
		fontApi?.applyCanvasFont?.(buf, Math.max(12, Math.round(w * 0.016))) ?? (buf.textFont(canvasFont), buf.textSize(Math.max(12, Math.round(w * 0.016))));
		buf.textAlign(sketch.LEFT, sketch.TOP);

		// shell-like heading
		buf.fill(...THEME.GREEN_SUBTLE, 160);
		buf.text("ARCHIVISTE@ANEMOIA:~$ cat /boot/title.bin", headingX, headingY);

		// Reveal the word itself vertically based on progress.
		const revealProgress = revealedRows / Math.max(1, totalRows);
		const titleLeft = layout?.titleLeft ?? 0;
		const titleTop = layout?.titleTop ?? 0;
		const titleWidth = layout?.titleWidth ?? w;
		const titleHeight = layout?.titleHeight ?? h;
		const revealHeight = Math.floor(revealProgress * titleHeight);
		if (revealHeight > 0) {
			buf.image(titleLayer, titleLeft, titleTop, titleWidth, revealHeight, titleLeft, titleTop, titleWidth, revealHeight);
		}

		buf.textAlign(sketch.LEFT, sketch.TOP);
		fontApi?.applyCanvasFont?.(buf, Math.max(11, Math.round(w * 0.013))) ?? buf.textSize(Math.max(11, Math.round(w * 0.013)));
		buf.fill(...THEME.GREEN_MID, 170);
		const pct = Math.floor((revealedRows / Math.max(1, totalRows)) * 100);
		buf.text(`LOADING TITLE IMAGE... ${pct}%`, headingX, statusY);

		if (blinkVisible) {
			const prompt = doneAt === null ? "█" : "[ OK ]";
			const cursorY = statusY + Math.max(18, Math.round(w * 0.016));
			fontApi?.applyCanvasFont?.(buf, Math.max(12, Math.round(w * 0.014))) ?? buf.textSize(Math.max(12, Math.round(w * 0.014)));
			buf.fill(...THEME.GREEN_PRIMARY);
			buf.text(prompt, headingX, cursorY);
		}
	}

	return {draw, isDone, reset};
}
