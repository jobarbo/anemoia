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
import {THEME, drawTitleAberration, hitTest, applyThemeCanvasFont} from "../../lib/utils/retro-theme.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {neighborhoods = []} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		/** P2D offscreen buffer — all drawing happens here, GlobalShaderOverlay handles GLSL. */
		let artBuffer;
		/** Keyboard selection index: 0..neighborhoods.length-1 = pin */
		let selectedPin = 0;

		let closeRect = null;
		let closeHovered = false;
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
			const w = artBuffer.width;
			const h = artBuffer.height;

			// ── Background ────────────────────────────────────────────────────────
			drawDesktopBackground(artBuffer, w, h);

			const topBar = drawWindowTopBar(artBuffer, w, h, closeHovered, sketch);
			closeRect = topBar.closeRect;
			const topBarH = topBar.height;
			const bottomBarH = drawBottomStatusBar(artBuffer, w, h, sketch);

			// ── Map area ──────────────────────────────────────────────────────────
			const mapPad = w * 0.05;
			const titleH = h * 0.08;
			const footerH = bottomBarH + h * 0.03;
			const mapX = mapPad;
			const mapY = topBarH + titleH;
			const mapW = w - mapPad * 2;
			const mapH = h - mapY - footerH;
			mapBounds = {x: mapX, y: mapY, w: mapW, h: mapH};

			// Retro terminal placeholder grid (no map image)
			drawMapPlaceholder(artBuffer, mapX, mapY, mapW, mapH, sketch);

			// ── Title ─────────────────────────────────────────────────────────────
			const titleSz = w * 0.028;
			drawTitleAberration(artBuffer, "Les quartiers états", w / 2, topBarH + titleH * 0.45, titleSz, 255, sketch);

			// ── Neighborhood pins ─────────────────────────────────────────────────
			const hoveredPin = findPinAtMouse();
			for (let i = 0; i < neighborhoods.length; i++) {
				const hood = neighborhoods[i];
				const px = mapX + (hood.position.x / 100) * mapW;
				const py = mapY + (hood.position.y / 100) * mapH;
				drawPin(artBuffer, px, py, hood.name, selectedPin === i || hoveredPin === i, sketch);
			}

			// Key hint
			const hintSz = w * 0.011;
			artBuffer.textAlign(sketch.RIGHT, sketch.CENTER);
			applyThemeCanvasFont(artBuffer, hintSz, sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 120);
			artBuffer.text("↑↓ CHOISIR   ENTRÉE CONFIRMER   ESC FERMER", w - w * 0.04, h - bottomBarH * 0.5);

			// Blit artBuffer onto output canvas
			sketch.clear();
			sketch.image(artBuffer, 0, 0);
			container.style.cursor = closeHovered || findPinAtMouse() >= 0 ? "pointer" : "default";
		};

		sketch.keyPressed = () => {
			return handleKeyInput(sketch.keyCode);
		};

		function handleKeyInput(key) {
			if (neighborhoods.length === 0) {
				if (key === sketch.ESCAPE) sceneNavigate("desktop");
				return false;
			}
			if (key === sketch.UP_ARROW || key === sketch.LEFT_ARROW) {
				selectedPin = (selectedPin - 1 + neighborhoods.length) % neighborhoods.length;
			} else if (key === sketch.DOWN_ARROW || key === sketch.RIGHT_ARROW) {
				selectedPin = (selectedPin + 1) % neighborhoods.length;
			} else if (key === sketch.ENTER || key === sketch.RETURN) {
				sceneNavigate("neighborhood", {slug: neighborhoods[selectedPin].slug});
			} else if (key === sketch.ESCAPE) {
				sceneNavigate("desktop");
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
			closeHovered = Boolean(closeRect && hitTest(sketch.mouseX, sketch.mouseY, closeRect));
		};

		sketch.mousePressed = () => {
			if (closeRect && hitTest(sketch.mouseX, sketch.mouseY, closeRect)) {
				sceneNavigate("desktop");
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

function drawDesktopBackground(buf, w, h) {
	buf.background(...THEME.BG);
	buf.stroke(...THEME.GREEN_PRIMARY, 26);
	buf.strokeWeight(1);
	const cols = 36;
	const rows = 22;
	for (let c = 0; c <= cols; c++) {
		const x = (c / cols) * w;
		buf.line(x, 0, x, h);
	}
	for (let r = 0; r <= rows; r++) {
		const y = (r / rows) * h;
		buf.line(0, y, w, y);
	}
}

function drawWindowTopBar(buf, w, h, closeHovered, p) {
	const barH = h * 0.07;
	buf.noStroke();
	buf.fill(8, 24, 38, 230);
	buf.rect(0, 0, w, barH);
	buf.stroke(...THEME.GREEN_MID, 90);
	buf.strokeWeight(2);
	buf.line(0, barH, w, barH);
	buf.noStroke();

	const btnSize = barH * 0.58;
	const btnX = w * 0.022;
	const btnY = (barH - btnSize) * 0.5;
	buf.stroke(...THEME.GREEN_MID, closeHovered ? 210 : 150);
	buf.strokeWeight(2);
	buf.fill(...THEME.GREEN_PRIMARY, closeHovered ? 70 : 35);
	buf.rect(btnX, btnY, btnSize, btnSize, 4);
	buf.noStroke();
	applyThemeCanvasFont(buf, Math.max(11, w * 0.013), p);
	buf.fill(...THEME.GREEN_SUBTLE, closeHovered ? 255 : 220);
	buf.textAlign(p.CENTER, p.CENTER);
	buf.text("X", btnX + btnSize * 0.5, btnY + btnSize * 0.52);

	applyThemeCanvasFont(buf, Math.max(12, w * 0.014), p);
	buf.fill(...THEME.GREEN_SUBTLE, 210);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text("Gestionnaire de quartiers", btnX + btnSize + w * 0.02, barH * 0.5);

	return {
		height: barH,
		closeRect: {x: btnX, y: btnY, w: btnSize, h: btnSize},
	};
}

function drawBottomStatusBar(buf, w, h, p) {
	const barH = h * 0.072;
	const barY = h - barH;
	buf.noStroke();
	buf.fill(8, 24, 38, 235);
	buf.rect(0, barY, w, barH);
	buf.stroke(...THEME.GREEN_MID, 100);
	buf.strokeWeight(2);
	buf.line(0, barY, w, barY);
	buf.noStroke();

	const navSz = Math.max(11, w * 0.012);
	applyThemeCanvasFont(buf, navSz, p);
	buf.fill(...THEME.GREEN_MID, 230);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text("Cartographie active", w * 0.03, barY + barH * 0.5);
	buf.textAlign(p.CENTER, p.CENTER);
	buf.text("2D View", w * 0.5, barY + barH * 0.5);
	return barH;
}
