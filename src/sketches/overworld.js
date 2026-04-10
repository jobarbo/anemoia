/**
 * Overworld map sketch — phosphor-green terminal aesthetic.
 *
 * Receives neighborhood data via container[data-sketch-data]:
 *   { neighborhoods: Array<{ name, slug, position: {x, y} }> }
 *
 * Renders:
 *   - Dark terminal background with grid
 *   - Title "CARTE DE LA VILLE" with chromatic aberration
 *   - Neighborhood pins as glowing dots with labels
 *   - "[ RETOUR AU MENU ]" back nav
 *   - Scan lines + vignette (retro-theme)
 *
 * Captured frame-perfectly by GlobalShaderOverlay via flat mode (drawImage on canvas).
 */

import {sceneNavigate} from "../lib/scene-nav.js";
import {THEME, drawScanLines, drawVignette, drawTitleAberration, drawButton, hitTest, tickBlink} from "../lib/retro-theme.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {neighborhoods = []} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		/** P2D offscreen buffer — all drawing happens here, GlobalShaderOverlay handles GLSL. */
		let artBuffer;

		/** Hit rects computed each frame for click detection. */
		let pinRects = [];
		let backRect = null;

		/** Hover state */
		let hoveredPin = -1;
		let backHovered = false;

		/** Blinking state for back button */
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
		};

		sketch.draw = () => {
			const now = sketch.millis();
			const w = artBuffer.width;
			const h = artBuffer.height;

			// Blink tick
			const blink = tickBlink(blinkVisible, lastBlink, now);
			blinkVisible = blink.visible;
			lastBlink = blink.lastBlink;

			// ── Background ────────────────────────────────────────────────────────
			artBuffer.background(...THEME.BG);

			// ── Map area ──────────────────────────────────────────────────────────
			const mapPad = w * 0.05;
			const titleH = h * 0.14;
			const footerH = h * 0.1;
			const mapX = mapPad;
			const mapY = titleH;
			const mapW = w - mapPad * 2;
			const mapH = h - titleH - footerH;

			// Retro terminal placeholder grid (no map image)
			drawMapPlaceholder(artBuffer, mapX, mapY, mapW, mapH, sketch);

			// ── Title ─────────────────────────────────────────────────────────────
			const titleSz = w * 0.032;
			drawTitleAberration(artBuffer, "CARTE DE LA VILLE", w / 2, titleH / 2, titleSz, 255, sketch);

			// ── Neighborhood pins ─────────────────────────────────────────────────
			pinRects = [];
			for (let i = 0; i < neighborhoods.length; i++) {
				const hood = neighborhoods[i];
				const px = mapX + (hood.position.x / 100) * mapW;
				const py = mapY + (hood.position.y / 100) * mapH;
				const hovered = hoveredPin === i;

				drawPin(artBuffer, px, py, hood.name, hovered, sketch);

				// Hit rect around label for click
				const labelSz = w * 0.013;
				const lw = artBuffer.textWidth(hood.name) + labelSz * 2;
				const lh = labelSz * 2.5;
				pinRects.push({x: px - lw / 2, y: py - lh / 2, w: lw, h: lh, slug: hood.slug});
			}

			// ── Back button ───────────────────────────────────────────────────────
			const backSz = w * 0.016;
			const backY = h - footerH / 2;
			backRect = drawButton(artBuffer, "[ RETOUR AU MENU ]", w / 2, backY, backSz, backHovered || blinkVisible, sketch);

			// ── Post-processing ───────────────────────────────────────────────────
			drawScanLines(artBuffer, now, sketch);
			drawVignette(artBuffer);

			// Blit artBuffer onto output canvas
			sketch.clear();
			sketch.image(artBuffer, 0, 0);

			// Update cursor
			const anyHover = hoveredPin >= 0 || backHovered;
			container.style.cursor = anyHover ? "pointer" : "default";
		};

		sketch.mouseMoved = () => {
			const mx = sketch.mouseX;
			const my = sketch.mouseY;
			hoveredPin = -1;
			backHovered = false;

			for (let i = 0; i < pinRects.length; i++) {
				if (hitTest(mx, my, pinRects[i])) {
					hoveredPin = i;
					return;
				}
			}
			if (backRect && hitTest(mx, my, backRect)) {
				backHovered = true;
			}
		};

		sketch.mousePressed = () => {
			const mx = sketch.mouseX;
			const my = sketch.mouseY;

			for (const rect of pinRects) {
				if (hitTest(mx, my, rect)) {
					sceneNavigate("neighborhood", {slug: rect.slug});
					return;
				}
			}
			if (backRect && hitTest(mx, my, backRect)) {
				sceneNavigate("splash");
			}
		};

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
		};
	};
}

// ── Pin renderer ──────────────────────────────────────────────────────────────

function drawPin(buf, x, y, name, hovered, p) {
	const w = buf.width;
	const dotR = w * 0.008;
	const labelSz = w * 0.013;

	const dotColor = hovered ? THEME.GREEN_PRIMARY : THEME.GREEN_MID;
	const labelColor = hovered ? THEME.GREEN_MID : THEME.GREEN_SUBTLE;

	// Outer glow ring
	buf.noFill();
	buf.stroke(...dotColor, hovered ? 120 : 60);
	buf.strokeWeight(1);
	buf.circle(x, y, dotR * 3.5);

	// Dot
	buf.noStroke();
	buf.fill(...dotColor, hovered ? 255 : 200);
	buf.circle(x, y, dotR * 2);

	// Label
	buf.textAlign(p.CENTER, p.CENTER);
	buf.textSize(labelSz);
	buf.textFont(THEME.FONT);
	buf.noStroke();
	buf.fill(...labelColor, hovered ? 255 : 180);
	buf.text(name, x, y + dotR * 3.5);

	buf.noStroke();
}

// ── Map placeholder grid ──────────────────────────────────────────────────────

function drawMapPlaceholder(buf, x, y, w, h, p) {
	// Dark panel
	buf.fill(...THEME.BG, 200);
	buf.noStroke();
	buf.rect(x, y, w, h);

	// Grid lines
	buf.stroke(...THEME.GREEN_PRIMARY, 18);
	buf.strokeWeight(1);
	const cols = 24;
	const rows = 16;
	for (let c = 0; c <= cols; c++) {
		const gx = x + (c / cols) * w;
		buf.line(gx, y, gx, y + h);
	}
	for (let r = 0; r <= rows; r++) {
		const gy = y + (r / rows) * h;
		buf.line(x, gy, x + w, gy);
	}

	// Border
	buf.noFill();
	buf.stroke(...THEME.GREEN_MID, 80);
	buf.strokeWeight(1);
	buf.rect(x, y, w, h);

	buf.noStroke();
}
