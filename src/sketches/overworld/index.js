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
 *
 * Captured frame-perfectly by GlobalShaderOverlay via flat mode (drawImage on canvas).
 */

import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {THEME, drawTitleAberration, drawButton, hitTest, tickBlink, applyThemeCanvasFont} from "../../lib/utils/retro-theme.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {neighborhoods = []} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		/** P2D offscreen buffer — all drawing happens here, GlobalShaderOverlay handles GLSL. */
		let artBuffer;
		/** Keyboard selection index: 0..neighborhoods.length-1 = a pin, neighborhoods.length = back button */
		let selectedPin = 0;

		/** Blinking state for back button */
		let blinkVisible = true;
		let lastBlink = 0;
		let backRect = null;
		let backHovered = false;
		let mapBounds = {x: 0, y: 0, w: 0, h: 0};

		sketch.setup = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			canvas.elt.tabIndex = 0;
			canvas.elt.focus();
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.noStroke();
			artBuffer.textFont(THEME.FONT);

			// Fallback keyboard handling when p5 key events are swallowed by focus changes.
			window.addEventListener("keydown", onWindowKeyDown);
			if (typeof sketch.registerMethod === "function") {
				sketch.registerMethod("remove", () => {
					window.removeEventListener("keydown", onWindowKeyDown);
				});
			}
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
			mapBounds = {x: mapX, y: mapY, w: mapW, h: mapH};

			// Retro terminal placeholder grid (no map image)
			drawMapPlaceholder(artBuffer, mapX, mapY, mapW, mapH, sketch);

			// ── Title ─────────────────────────────────────────────────────────────
			const titleSz = w * 0.032;
			drawTitleAberration(artBuffer, "Le directoire", w / 2, titleH / 2, titleSz, 255, sketch);

			// ── Neighborhood pins ─────────────────────────────────────────────────
			const hoveredPin = findPinAtMouse();
			for (let i = 0; i < neighborhoods.length; i++) {
				const hood = neighborhoods[i];
				const px = mapX + (hood.position.x / 100) * mapW;
				const py = mapY + (hood.position.y / 100) * mapH;
				drawPin(artBuffer, px, py, hood.name, selectedPin === i || hoveredPin === i, sketch);
			}

			// ── Back button ───────────────────────────────────────────────────────
			const backSz = w * 0.016;
			const backY = h - footerH / 2;
			const backSelected = selectedPin === neighborhoods.length;
			backRect = drawButton(artBuffer, "[ RETOUR AU MENU ]", w / 2, backY, backSz, backSelected || blinkVisible || backHovered, sketch);

			// Key hint
			const hintSz = w * 0.011;
			artBuffer.textAlign(sketch.RIGHT, sketch.CENTER);
			applyThemeCanvasFont(artBuffer, hintSz, sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 120);
			artBuffer.text("↑↓ SELECT   ENTER CONFIRM   ESC BACK", w - w * 0.04, h - footerH / 2);

			// Blit artBuffer onto output canvas
			sketch.clear();
			sketch.image(artBuffer, 0, 0);
			container.style.cursor = backHovered || findPinAtMouse() >= 0 ? "pointer" : "default";
		};

		sketch.keyPressed = () => {
			return handleKeyInput(sketch.keyCode);
		};

		function handleKeyInput(key) {
			const total = neighborhoods.length + 1; // pins + back
			if (key === sketch.UP_ARROW || key === sketch.LEFT_ARROW) {
				selectedPin = (selectedPin - 1 + total) % total;
			} else if (key === sketch.DOWN_ARROW || key === sketch.RIGHT_ARROW) {
				selectedPin = (selectedPin + 1) % total;
			} else if (key === sketch.ENTER || key === sketch.RETURN) {
				if (selectedPin < neighborhoods.length) {
					sceneNavigate("neighborhood", {slug: neighborhoods[selectedPin].slug});
				} else {
					sceneNavigate("splash");
				}
			} else if (key === sketch.ESCAPE) {
				sceneNavigate("splash");
			}
			return false; // prevent default browser scroll
		}

		function onWindowKeyDown(e) {
			const keyMap = {
				ArrowUp: sketch.UP_ARROW,
				ArrowDown: sketch.DOWN_ARROW,
				ArrowLeft: sketch.LEFT_ARROW,
				ArrowRight: sketch.RIGHT_ARROW,
				Enter: sketch.ENTER,
				Escape: sketch.ESCAPE,
			};
			const mapped = keyMap[e.key];
			if (mapped == null) return;
			e.preventDefault();
			handleKeyInput(mapped);
		}

		sketch.mouseMoved = () => {
			backHovered = Boolean(backRect && hitTest(sketch.mouseX, sketch.mouseY, backRect));
		};

		sketch.mousePressed = () => {
			if (backRect && hitTest(sketch.mouseX, sketch.mouseY, backRect)) {
				sceneNavigate("splash");
				return;
			}
			const pinIndex = findPinAtMouse();
			if (pinIndex >= 0) {
				selectedPin = pinIndex;
				sceneNavigate("neighborhood", {slug: neighborhoods[pinIndex].slug});
			}
		};

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
		};

		function findPinAtMouse() {
			if (!mapBounds.w || !mapBounds.h) return -1;
			const hitRadius = Math.max(14, artBuffer.width * 0.02);
			for (let i = 0; i < neighborhoods.length; i++) {
				const hood = neighborhoods[i];
				const px = mapBounds.x + (hood.position.x / 100) * mapBounds.w;
				const py = mapBounds.y + (hood.position.y / 100) * mapBounds.h;
				const dx = sketch.mouseX - px;
				const dy = sketch.mouseY - py;
				if (dx * dx + dy * dy <= hitRadius * hitRadius) return i;
			}
			return -1;
		}
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
	applyThemeCanvasFont(buf, labelSz, p);
	buf.noStroke();
	buf.fill(...labelColor, hovered ? 255 : 180);
	buf.text(name, x, y + dotR * 3.5);

	buf.noStroke();
}

// ── Map placeholder grid ──────────────────────────────────────────────────────

function drawMapPlaceholder(buf, x, y, w, h, p) {
	// Dark panel
	buf.fill(...THEME.BG, 200);
	//buf.noStroke();
	buf.strokeWeight(12);
	// rect radius based on size, with min/max clamp
	const radius = Math.max(10, Math.min(30, Math.min(w, h) * 0.22));
	buf.rect(x, y, w, h, radius);
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
	buf.strokeWeight(2);
	buf.rect(x, y, w, h, 22);

	buf.noStroke();
}
