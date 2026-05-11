/**
 * Story sketch — scrollable canvas text reader, phosphor-green terminal aesthetic.
 *
 * Receives content via container[data-sketch-data]:
 *   {
 *     title: string,
 *     neighborhood: string,  // slug for back navigation
 *     blocks: Array<{ type: 'h1'|'h2'|'p', text: string }>
 *   }
 *
 * Rendering:
 *   - Dark background, monospace text, THEME color palette
 *   - h1 → GREEN_PRIMARY + chromatic aberration, large
 *   - h2 → GREEN_MID, medium
 *   - p  → GREEN_SUBTLE, body size
 *   - Smooth scroll (mouse wheel + touch) with lerp
 *   - GSAP-driven per-block reveal: opacity + offsetY animate in when block enters viewport
 *   - "[ RETOUR AU QUARTIER ]" back nav (top-left corner)
 *   - Scan lines + vignette on each frame
 *
 * Captured frame-perfectly by GlobalShaderOverlay via flat mode.
 */

import gsap from "gsap";
import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {THEME, hitTest, applyThemeCanvasFont} from "../../lib/utils/retro-theme.js";
import {createCanvasCursor, drawCanvasCursor} from "../../lib/input/canvas-cursor.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {title = "", date = null, neighborhood = "", returnTo = "neighborhood", blocks = []} = raw ? JSON.parse(raw) : {};
	const titleBlocks = title ? [{type: "h1", text: title}, ...(date ? [{type: "h2", text: date}] : [])] : [];
	const allBlocks = [...titleBlocks, ...blocks];

	return (sketch) => {
		/** P2D artBuffer — all drawing; GlobalShaderOverlay handles GLSL post. */
		let artBuffer;
		let canvasCursor;

		// ── Scroll state ──────────────────────────────────────────────────────────
		let scrollY = 0;
		let targetScrollY = 0;
		let maxScroll = 0;

		// ── Touch scroll ──────────────────────────────────────────────────────────
		let lastTouchY = null;

		// ── Block layout cache (computed once after setup) ────────────────────────
		/** @type {Array<{y: number, h: number}>} */
		let blockLayout = [];

		// ── GSAP per-block reveal state ───────────────────────────────────────────
		/** @type {Array<{opacity: number, offsetY: number, triggered: boolean}>} */
		let blockState = [];

		// ── Window close button (top bar) ────────────────────────────────────────
		let closeRect = null;
		let closeHovered = false;

		sketch.setup = () => {
			sketch.pixelDensity(1);
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			canvasCursor = createCanvasCursor({canvasEl: canvas.elt});
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.pixelDensity(1);
			artBuffer.noStroke();
			artBuffer.textFont(THEME.FONT);

			blockState = allBlocks.map(() => ({opacity: 0, offsetY: 40, triggered: false}));
			computeLayout();
		};

		sketch.draw = () => {
			const w = artBuffer.width;
			const h = artBuffer.height;
			const pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: w, height: h});

			// Smooth scroll
			scrollY += (targetScrollY - scrollY) * THEME.SCROLL_LERP;

			// Check which blocks are now visible and trigger GSAP reveal
			triggerVisibleBlocks(h);

			// ── Background ────────────────────────────────────────────────────────
			drawDesktopBackground(artBuffer, w, h);
			const topBar = drawWindowTopBar(artBuffer, w, h, closeHovered, title, sketch);
			closeRect = topBar.closeRect;
			closeHovered = closeRect ? hitTest(pointer.x, pointer.y, closeRect) : false;

			// ── Content blocks ────────────────────────────────────────────────────
			const contentX = w * 0.12;
			const contentW = w * 0.76;

			for (let i = 0; i < allBlocks.length; i++) {
				const block = allBlocks[i];
				const layout = blockLayout[i];
				if (!layout) continue;

				const state = blockState[i];
				const screenY = layout.y - scrollY + state.offsetY;

				// Skip if completely off-screen
				if (screenY + layout.h < -50 || screenY > h + 50) continue;

				drawBlock(artBuffer, block, contentX, screenY, contentW, state.opacity, sketch);
			}

			// Scrollbar indicator
			drawScrollbar(artBuffer, scrollY, maxScroll);

			// Blit to output
			drawCanvasCursor(artBuffer, pointer, {hovered: closeHovered});
			sketch.clear();
			sketch.image(artBuffer, 0, 0);
		};

		// ── Input ─────────────────────────────────────────────────────────────────

		sketch.mouseWheel = (e) => {
			targetScrollY = sketch.constrain(targetScrollY + e.delta, 0, maxScroll);
			return false; // prevent page scroll
		};

		sketch.mousePressed = () => {
			const pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: artBuffer.width, height: artBuffer.height});
			if (closeRect && hitTest(pointer.x, pointer.y, closeRect)) {
				if (returnTo === "desktop") {
					sceneNavigate("desktop");
				} else {
					sceneNavigate("neighborhood", {slug: neighborhood});
				}
			}
		};

		sketch.touchStarted = (e) => {
			if (e.touches && e.touches.length > 0) {
				lastTouchY = e.touches[0].clientY;
			}
			return false;
		};

		sketch.touchMoved = (e) => {
			if (e.touches && e.touches.length > 0 && lastTouchY !== null) {
				const dy = lastTouchY - e.touches[0].clientY;
				targetScrollY = sketch.constrain(targetScrollY + dy * 1.5, 0, maxScroll);
				lastTouchY = e.touches[0].clientY;
			}
			return false;
		};

		sketch.touchEnded = () => {
			lastTouchY = null;
			return false;
		};

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
			artBuffer.pixelDensity(1);
			artBuffer.textFont(THEME.FONT);
			computeLayout();
			// Re-trigger any block whose state was already revealed
			for (const s of blockState) {
				if (s.triggered) {
					s.opacity = 1;
					s.offsetY = 0;
				}
			}
		};

		if (typeof sketch.registerMethod === "function") {
			sketch.registerMethod("remove", () => {
				canvasCursor?.destroy();
			});
		}

		// ── Layout computation ────────────────────────────────────────────────────

		function computeLayout() {
			const w = artBuffer.width;
			const h = artBuffer.height;
			const contentW = w * 0.76;
			const topPad = h * 0.19;
			const blockGap = h * 0.06;

			blockLayout = [];
			let cursorY = topPad;

			for (const block of allBlocks) {
				const sz = fontSizeForType(block.type, w);
				applyThemeCanvasFont(artBuffer, sz, sketch);

				if (block.type === "table") {
					const pad = sz * 0.6;
					const lineH = sz * 1.4;
					const cellPadV = sz * 0.55;
					const colCount = block.headers.length;

					// 1. Measure natural (unwrapped) width per column to get proportions
					const naturalW = block.headers.map((h, c) => {
						const maxCell = Math.max(artBuffer.textWidth(h), ...block.rows.map((row) => artBuffer.textWidth(row[c] ?? "")));
						return maxCell + pad * 2;
					});
					const totalNatural = naturalW.reduce((a, b) => a + b, 0);
					const colWidths = naturalW.map((nw) => (nw / totalNatural) * contentW);

					// 2. Wrap each cell and compute row heights
					const wrapCell = (text, col) => wrapText(artBuffer, text, colWidths[col] - pad * 2);
					const headerLines = block.headers.map((h, c) => wrapCell(h, c));
					const headerH = Math.max(...headerLines.map((l) => l.length)) * lineH + cellPadV * 2;

					const rowData = block.rows.map((row) => {
						const cellLines = row.map((cell, c) => wrapCell(cell, c));
						const rowH = Math.max(...cellLines.map((l) => l.length)) * lineH + cellPadV * 2;
						return {cellLines, rowH};
					});

					const tableH = headerH + rowData.reduce((a, r) => a + r.rowH, 0);
					blockLayout.push({y: cursorY, h: tableH, lines: [], sz, indent: 0, colWidths, headerLines, headerH, rowData, pad, lineH, cellPadV});
					cursorY += tableH + blockGap;
					continue;
				}
				const isLi = block.type === "li";
				const indent = isLi ? sz * 1.6 : 0;
				const lineScale = block.type === "p" || isLi ? 1.55 : 1.3;
				const lines = wrapText(artBuffer, block.text, contentW - indent);
				const blockH = lines.length * sz * lineScale;

				blockLayout.push({y: cursorY, h: blockH, lines, sz, indent});
				const gap = block.type === "p" ? blockGap : isLi ? blockGap * 0.22 : blockGap * 0.5;
				cursorY += blockH + gap;
			}

			maxScroll = Math.max(0, cursorY - h * 0.85);
			targetScrollY = sketch.constrain(targetScrollY, 0, maxScroll);
		}

		// ── GSAP reveal ───────────────────────────────────────────────────────────

		function triggerVisibleBlocks(viewportH) {
			const threshold = viewportH * 0.88;
			for (let i = 0; i < allBlocks.length; i++) {
				const state = blockState[i];
				if (state.triggered) continue;
				const layout = blockLayout[i];
				if (!layout) continue;
				const screenY = layout.y - scrollY;
				if (screenY < threshold) {
					state.triggered = true;
					gsap.to(state, {opacity: 1, offsetY: 0, duration: 0.7, ease: "power2.out", delay: 0.05 * (i % 4)});
				}
			}
		}

		// ── Block drawing ─────────────────────────────────────────────────────────

		function drawBlock(buf, block, x, y, maxW, opacity, p) {
			if (opacity <= 0.01) return;

			const layout = blockLayout[allBlocks.indexOf(block)];
			if (!layout) return;

			const alpha = Math.round(opacity * 255);

			if (block.type === "table") {
				const {headers, rows} = block;
				const colCount = headers.length;
				const {colWidths, headerLines, headerH, rowData, pad, lineH, cellPadV} = layout;
				const totalH = layout.h;

				// Cumulative x offsets
				const colX = [];
				let cx = x;
				for (const cw of colWidths) {
					colX.push(cx);
					cx += cw;
				}

				applyThemeCanvasFont(buf, layout.sz, p);
				buf.textAlign(p.LEFT, p.TOP);

				// Header background
				buf.noStroke();
				buf.fill(...THEME.GREEN_MID, Math.round(alpha * 0.12));
				buf.rect(x, y, maxW, headerH);

				// Outer border
				buf.noFill();
				buf.stroke(...THEME.GREEN_MID, Math.round(alpha * 0.7));
				buf.strokeWeight(1);
				buf.rect(x, y, maxW, totalH);

				// Header separator
				buf.line(x, y + headerH, x + maxW, y + headerH);

				// Row separators at variable heights
				let rowY = y + headerH;
				buf.stroke(...THEME.GREEN_MID, Math.round(alpha * 0.3));
				for (let r = 0; r < rowData.length - 1; r++) {
					rowY += rowData[r].rowH;
					buf.line(x, rowY, x + maxW, rowY);
				}

				// Column dividers
				buf.stroke(...THEME.GREEN_MID, Math.round(alpha * 0.4));
				for (let c = 1; c < colCount; c++) {
					buf.line(colX[c], y, colX[c], y + totalH);
				}

				// Header text (wrapped)
				buf.noStroke();
				headerLines.forEach((lines, c) => {
					buf.fill(...THEME.GREEN_MID, alpha);
					lines.forEach((line, li) => {
						buf.text(line, colX[c] + pad, y + cellPadV + li * lineH);
					});
				});

				// Data rows (wrapped)
				let curRowY = y + headerH;
				rowData.forEach(({cellLines, rowH}) => {
					cellLines.forEach((lines, c) => {
						buf.fill(...THEME.GREEN_SUBTLE, alpha);
						lines.forEach((line, li) => {
							buf.text(line, colX[c] + pad, curRowY + cellPadV + li * lineH);
						});
					});
					curRowY += rowH;
				});
				return;
			}

			const isLi = block.type === "li";
			const lineH = layout.sz * (block.type === "p" || isLi ? 1.55 : 1.3);
			const indent = layout.indent ?? 0;

			applyThemeCanvasFont(buf, layout.sz, p);
			buf.textAlign(p.LEFT, p.TOP);
			buf.noStroke();

			if (block.type === "h1") {
				buf.textAlign(p.LEFT, p.TOP);
				applyThemeCanvasFont(buf, layout.sz, p, {weight: "700"});
				buf.fill(...THEME.GREEN_PRIMARY, alpha);
				const h1LineH = layout.sz * 1.3;
				let lineY = y;
				for (const line of layout.lines) {
					buf.text(line, x, lineY);
					lineY += h1LineH;
				}
				buf.textStyle(p.NORMAL);
				return;
			}

			const color = block.type === "h2" ? THEME.GREEN_MID : THEME.GREEN_MID;

			if (isLi) {
				buf.fill(255, 255, 255, alpha);
				buf.text("—", x, y);
			}

			let lineY = y;
			for (const line of layout.lines) {
				buf.fill(...color, alpha);
				buf.text(line, x + indent, lineY);
				lineY += lineH;
			}
		}

		// ── Scrollbar ─────────────────────────────────────────────────────────────

		function drawScrollbar(buf, sy, max) {
			if (max <= 0) return;
			const w = buf.width;
			const h = buf.height;
			const barH = h * 0.6;
			const barX = w - w * 0.025;
			const barY = h * 0.2;
			const thumbH = Math.max(20, barH * (h / (h + max)));
			const thumbY = barY + (sy / max) * (barH - thumbH);

			buf.noStroke();
			buf.fill(...THEME.GREEN_PRIMARY, 80);
			buf.rect(barX - 2, barY, 4, barH, 2);
			buf.fill(...THEME.GREEN_MID, 200);
			buf.rect(barX - 2, thumbY, 4, thumbH, 2);
		}
	};
}

// ── Typography helpers ────────────────────────────────────────────────────────

function fontSizeForType(type, canvasW) {
	if (type === "h1") return canvasW * 0.048;
	if (type === "h2") return canvasW * 0.028;
	return canvasW * 0.02;
}

/**
 * Word-wrap text to fit within maxWidth px using the buffer's current textSize.
 *
 * @param {p5.Graphics} buf
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
function wrapText(buf, text, maxWidth) {
	const words = text.split(" ");
	const lines = [];
	let current = "";

	for (const word of words) {
		const test = current ? `${current} ${word}` : word;
		if (buf.textWidth(test) > maxWidth && current) {
			lines.push(current);
			current = word;
		} else {
			current = test;
		}
	}
	if (current) lines.push(current);
	return lines;
}

function drawDesktopBackground(buf, w, h) {
	buf.background(...THEME.BG);
	buf.noStroke();
	buf.fill(...THEME.GREEN_PRIMARY, 22);
	const cols = 38;
	const rows = 24;
	const dotSize = Math.max(1.5, Math.min(w / cols, h / rows) * 0.14);
	for (let c = 0; c <= cols; c++) {
		for (let r = 0; r <= rows; r++) {
			buf.ellipse((c / cols) * w, (r / rows) * h, dotSize, dotSize);
		}
	}
}

function drawWindowTopBar(buf, w, h, closeHovered, title, p) {
	const minBarH = h * 0.07;
	const maxBarH = h * 0.14;
	const btnX = w * 0.022;
	const titlePadR = w * 0.02;
	/** Worst-case button width so wrapped lines never collide with the close control when the bar grows. */
	const wrapTitleMaxW = Math.max(80, w - btnX - maxBarH * 0.58 - w * 0.018 - titlePadR);

	let titleFont = Math.max(12, w * 0.014);
	applyThemeCanvasFont(buf, titleFont, p);
	let titleLines = wrapText(buf, title || "Visionneuse de récit", wrapTitleMaxW);
	const lineGap = 1.2;
	let lineH = titleFont * lineGap;
	let barH = Math.max(minBarH, Math.min(titleLines.length * lineH + titleFont * 0.45, maxBarH));

	while (titleLines.length * lineH > barH * 0.92 && titleFont > 9) {
		titleFont -= 0.5;
		applyThemeCanvasFont(buf, titleFont, p);
		titleLines = wrapText(buf, title || "Visionneuse de récit", wrapTitleMaxW);
		lineH = titleFont * lineGap;
		barH = Math.max(minBarH, Math.min(titleLines.length * lineH + titleFont * 0.45, maxBarH));
	}

	const ctx = buf.drawingContext;
	const grad = ctx.createLinearGradient(0, 0, 0, barH);
	grad.addColorStop(0, "rgba(95, 48, 28, 0.97)");
	grad.addColorStop(0.45, "rgba(52, 28, 16, 0.97)");
	grad.addColorStop(1, "rgba(16, 9, 5, 0.98)");
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, w, barH);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(1);
	buf.line(0, 0, w, 0);
	buf.stroke(...THEME.GREEN_MID, 150);
	buf.strokeWeight(2);
	buf.line(0, barH, w, barH);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(1);
	buf.line(0, barH - 3, w, barH - 3);
	buf.noStroke();

	const btnSize = barH * 0.58;
	const btnY = (barH - btnSize) * 0.5;
	buf.stroke(...THEME.GREEN_MID, closeHovered ? 240 : 180);
	buf.strokeWeight(2);
	buf.fill(...THEME.GREEN_PRIMARY, closeHovered ? 120 : 70);
	buf.rect(btnX, btnY, btnSize, btnSize, 4);
	buf.noStroke();
	applyThemeCanvasFont(buf, Math.max(11, w * 0.013), p);
	buf.fill(...THEME.GREEN_SUBTLE, closeHovered ? 255 : 240);
	buf.textAlign(p.CENTER, p.CENTER);
	buf.text("X", btnX + btnSize * 0.5, btnY + btnSize * 0.52);

	applyThemeCanvasFont(buf, titleFont, p);
	buf.fill(...THEME.GREEN_SUBTLE, 255);
	buf.textAlign(p.LEFT, p.TOP);
	const drawTitleX = btnX + btnSize + w * 0.018;
	const titleBlockH = titleLines.length * lineH;
	const titleStartY = Math.max(2, (barH - titleBlockH) * 0.5);
	for (let i = 0; i < titleLines.length; i++) {
		buf.text(titleLines[i], drawTitleX, titleStartY + i * lineH);
	}

	return {
		closeRect: {x: btnX, y: btnY, w: btnSize, h: btnSize},
	};
}
