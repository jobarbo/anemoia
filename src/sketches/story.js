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
import {navigate} from "astro:transitions/client";
import {THEME, drawScanLines, drawVignette, drawTitleAberration, drawButton, hitTest, tickBlink} from "../lib/retro-theme.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {title = "", neighborhood = "", blocks = []} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		/** P2D artBuffer — all drawing; GlobalShaderOverlay handles GLSL post. */
		let artBuffer;

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

		// ── Back button ───────────────────────────────────────────────────────────
		let backRect = null;
		let backHovered = false;
		let blinkVisible = true;
		let lastBlink = 0;

		sketch.setup = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.noStroke();
			artBuffer.textFont(THEME.FONT);

			blockState = blocks.map(() => ({opacity: 0, offsetY: 40, triggered: false}));
			computeLayout();
		};

		sketch.draw = () => {
			const now = sketch.millis();
			const w = artBuffer.width;
			const h = artBuffer.height;

			// Smooth scroll
			scrollY += (targetScrollY - scrollY) * THEME.SCROLL_LERP;

			// Blink tick
			const blink = tickBlink(blinkVisible, lastBlink, now);
			blinkVisible = blink.visible;
			lastBlink = blink.lastBlink;

			// Check which blocks are now visible and trigger GSAP reveal
			triggerVisibleBlocks(h);

			// ── Background ────────────────────────────────────────────────────────
			artBuffer.background(...THEME.BG);

			// ── Back button (top-left) ────────────────────────────────────────────
			const backSz = w * 0.014;
			const backPad = w * 0.04;
			backRect = drawButton(artBuffer, "[ RETOUR AU QUARTIER ]", backPad + artBuffer.textWidth("[ RETOUR AU QUARTIER ]") * 0.5 + backSz, backSz * 2, backSz, backHovered || blinkVisible, sketch);

			// ── Content blocks ────────────────────────────────────────────────────
			const contentX = w * 0.12;
			const contentW = w * 0.76;

			for (let i = 0; i < blocks.length; i++) {
				const block = blocks[i];
				const layout = blockLayout[i];
				if (!layout) continue;

				const state = blockState[i];
				const screenY = layout.y - scrollY + state.offsetY;

				// Skip if completely off-screen
				if (screenY + layout.h < -50 || screenY > h + 50) continue;

				drawBlock(artBuffer, block, contentX, screenY, contentW, state.opacity, sketch);
			}

			// ── Post-processing ───────────────────────────────────────────────────
			drawScanLines(artBuffer, now, sketch);
			drawVignette(artBuffer);

			// Scrollbar indicator
			drawScrollbar(artBuffer, scrollY, maxScroll);

			// Blit to output
			sketch.clear();
			sketch.image(artBuffer, 0, 0);

			container.style.cursor = backHovered ? "pointer" : "default";
		};

		// ── Input ─────────────────────────────────────────────────────────────────

		sketch.mouseWheel = (e) => {
			targetScrollY = sketch.constrain(targetScrollY + e.delta, 0, maxScroll);
			return false; // prevent page scroll
		};

		sketch.mouseMoved = () => {
			backHovered = backRect ? hitTest(sketch.mouseX, sketch.mouseY, backRect) : false;
		};

		sketch.mousePressed = () => {
			if (backRect && hitTest(sketch.mouseX, sketch.mouseY, backRect)) {
				navigate(`/neighborhood/${neighborhood}`);
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

		// ── Layout computation ────────────────────────────────────────────────────

		function computeLayout() {
			const w = artBuffer.width;
			const h = artBuffer.height;
			const contentW = w * 0.76;
			const topPad = h * 0.12;
			const blockGap = h * 0.06;

			blockLayout = [];
			let cursorY = topPad;

			for (const block of blocks) {
				const sz = fontSizeForType(block.type, w);
				artBuffer.textSize(sz);
				artBuffer.textFont(THEME.FONT);

				// p5 textWidth works on single lines; wrap manually to get height
				const lines = wrapText(artBuffer, block.text, contentW, block.type === "p" ? sz * 1.55 : sz * 1.3);
				const blockH = lines.length * sz * (block.type === "p" ? 1.55 : 1.3);

				blockLayout.push({y: cursorY, h: blockH, lines, sz});
				cursorY += blockH + (block.type === "p" ? blockGap : blockGap * 0.5);
			}

			maxScroll = Math.max(0, cursorY - h * 0.85);
			targetScrollY = sketch.constrain(targetScrollY, 0, maxScroll);
		}

		// ── GSAP reveal ───────────────────────────────────────────────────────────

		function triggerVisibleBlocks(viewportH) {
			const threshold = viewportH * 0.88;
			for (let i = 0; i < blocks.length; i++) {
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

			const layout = blockLayout[blocks.indexOf(block)];
			if (!layout) return;

			const alpha = Math.round(opacity * 255);
			const lineH = layout.sz * (block.type === "p" ? 1.55 : 1.3);

			buf.textSize(layout.sz);
			buf.textFont(THEME.FONT);
			buf.textAlign(p.LEFT, p.TOP);
			buf.noStroke();

			if (block.type === "h1") {
				// Chromatic aberration title
				drawTitleAberration(buf, block.text, x + maxW / 2, y + layout.sz / 2, layout.sz, alpha, p);
				return;
			}

			const color = block.type === "h2" ? THEME.GREEN_MID : THEME.GREEN_SUBTLE;

			let lineY = y;
			for (const line of layout.lines) {
				buf.fill(...color, alpha);
				buf.text(line, x, lineY);
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
			buf.fill(...THEME.GREEN_PRIMARY, 30);
			buf.rect(barX - 2, barY, 4, barH, 2);
			buf.fill(...THEME.GREEN_MID, 100);
			buf.rect(barX - 2, thumbY, 4, thumbH, 2);
		}
	};
}

// ── Typography helpers ────────────────────────────────────────────────────────

function fontSizeForType(type, canvasW) {
	if (type === "h1") return canvasW * 0.048;
	if (type === "h2") return canvasW * 0.028;
	return canvasW * 0.018;
}

/**
 * Word-wrap text to fit within maxWidth px using the buffer's current textSize.
 *
 * @param {p5.Graphics} buf
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} lineH - unused here, kept for signature consistency
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
