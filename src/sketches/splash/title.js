/**
 * TITLE phase — prints the project title using the active splash font,
 * revealed row-by-row like a terminal/image load.
 *
 * Interface:
 *   createTitlePhase(sketch, artBuffer, fontApi) → { draw(now), isDone(), reset() }
 */

import {THEME} from "../../lib/utils/retro-theme.js";

const BG = [...THEME.BG];

const TITLE_TEXT = "ANEMOIA";
const ROW_HEIGHT_PX = 33;
const ROW_STEP_MS = 692;
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
		const titleY = h * 0.52;

		titleLayer.textAlign(sketch.CENTER, sketch.CENTER);
		fontApi?.applyCanvasFont?.(titleLayer, titleSize, {weight: fontApi?.getCanvasFontWeight?.() ?? "700"}) ?? (titleLayer.textFont(canvasFont), titleLayer.textSize(titleSize));

		// Slight glow pass
		titleLayer.fill(...THEME.GREEN_PRIMARY, 70);
		titleLayer.text(TITLE_TEXT, w / 2 + 2, titleY + 2);

		// Main title pass
		titleLayer.fill(...THEME.GREEN_PRIMARY, 240);
		titleLayer.text(TITLE_TEXT, w / 2, titleY);

		layout = {
			titleY,
			headingX: w * 0.08,
			headingY: titleY - titleSize * 0.9,
			statusY: titleY + titleSize * 0.85,
		};

		totalRows = Math.ceil(h / ROW_HEIGHT_PX);
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

		// Reveal title in horizontal row slices.
		const revealPx = revealedRows * ROW_HEIGHT_PX;
		for (let y = 0; y < revealPx; y += ROW_HEIGHT_PX) {
			buf.image(titleLayer, 0, y, w, ROW_HEIGHT_PX, 0, y, w, ROW_HEIGHT_PX);
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
