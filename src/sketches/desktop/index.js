/**
 * Desktop sketch — retro GUI landing screen between splash and overworld.
 *
 * Interactions:
 * - Mouse hover highlights the desktop shortcut.
 * - Mouse click on shortcut navigates to overworld.
 * - No keyboard navigation.
 */

import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {THEME, drawTitleAberration, applyThemeCanvasFont, hitTest, tickBlink} from "../../lib/utils/retro-theme.js";

export default function (container) {
	return (sketch) => {
		let artBuffer;
		let iconRect = null;
		let iconHovered = false;
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

			const blink = tickBlink(blinkVisible, lastBlink, now);
			blinkVisible = blink.visible;
			lastBlink = blink.lastBlink;

			drawDesktopBackground(artBuffer, w, h, sketch);
			drawTaskbar(artBuffer, w, h, sketch);
			drawWindowChrome(artBuffer, w, h, sketch);

			const iconX = w * 0.12;
			const iconY = h * 0.27;
			iconRect = drawDesktopIcon(artBuffer, iconX, iconY, iconHovered, blinkVisible, sketch);

			const titleSize = Math.max(18, w * 0.032);
			drawTitleAberration(artBuffer, "Boot-Boy Desktop", w / 2, h * 0.12, titleSize, 255, sketch);

			const hintSize = Math.max(12, w * 0.013);
			applyThemeCanvasFont(artBuffer, hintSize, sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 200);
			artBuffer.textAlign(sketch.CENTER, sketch.CENTER);
			artBuffer.text("CLICK A SHORTCUT TO OPEN", w / 2, h - h * 0.09);

			sketch.clear();
			sketch.image(artBuffer, 0, 0);
			container.style.cursor = iconHovered ? "pointer" : "default";
		};

		sketch.mouseMoved = () => {
			iconHovered = Boolean(iconRect && hitTest(sketch.mouseX, sketch.mouseY, iconRect));
		};

		sketch.mousePressed = () => {
			if (iconRect && hitTest(sketch.mouseX, sketch.mouseY, iconRect)) {
				sceneNavigate("overworld");
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

function drawDesktopBackground(buf, w, h, p) {
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

	buf.noStroke();
	buf.fill(...THEME.GREEN_PRIMARY, 20);
	buf.rect(0, 0, w, h * 0.16);
}

function drawTaskbar(buf, w, h, p) {
	const barH = h * 0.085;
	const barY = h - barH;

	buf.noStroke();
	buf.fill(8, 24, 38, 235);
	buf.rect(0, barY, w, barH);

	buf.stroke(...THEME.GREEN_MID, 100);
	buf.strokeWeight(2);
	buf.line(0, barY, w, barY);
	buf.noStroke();

	const startW = Math.max(110, w * 0.11);
	const startH = barH * 0.66;
	const startX = w * 0.02;
	const startY = barY + (barH - startH) / 2;
	buf.fill(...THEME.GREEN_PRIMARY, 55);
	buf.rect(startX, startY, startW, startH, 8);

	const startSz = Math.max(12, w * 0.012);
	applyThemeCanvasFont(buf, startSz, p);
	buf.fill(...THEME.GREEN_MID, 230);
	buf.textAlign(p.CENTER, p.CENTER);
	buf.text("MENU", startX + startW * 0.5, startY + startH * 0.5);
}

function drawWindowChrome(buf, w, h, p) {
	const winX = w * 0.36;
	const winY = h * 0.2;
	const winW = w * 0.5;
	const winH = h * 0.56;
	const titleH = Math.max(24, h * 0.055);

	buf.fill(6, 17, 27, 180);
	buf.stroke(...THEME.GREEN_MID, 90);
	buf.strokeWeight(2);
	buf.rect(winX, winY, winW, winH, 10);

	buf.noStroke();
	buf.fill(...THEME.GREEN_PRIMARY, 45);
	buf.rect(winX, winY, winW, titleH, 10, 10, 0, 0);

	const labelSz = Math.max(11, w * 0.011);
	applyThemeCanvasFont(buf, labelSz, p);
	buf.fill(...THEME.GREEN_SUBTLE, 220);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text("System Panel", winX + winW * 0.04, winY + titleH * 0.55);

	const bodySz = Math.max(12, w * 0.013);
	applyThemeCanvasFont(buf, bodySz, p);
	buf.fill(...THEME.GREEN_SUBTLE, 180);
	buf.textAlign(p.LEFT, p.TOP);
	buf.text("Desktop v3.0 ready.\nUse mouse to open modules.", winX + winW * 0.06, winY + titleH + winH * 0.12);

	buf.noStroke();
}

function drawDesktopIcon(buf, x, y, hovered, blinking, p) {
	const iconW = Math.max(90, buf.width * 0.115);
	const iconH = Math.max(106, buf.height * 0.2);
	const tileSize = Math.max(34, buf.width * 0.04);
	const tileX = x + (iconW - tileSize) * 0.5;
	const tileY = y + iconH * 0.08;

	buf.noStroke();
	if (hovered) {
		buf.fill(...THEME.GREEN_PRIMARY, 38);
		buf.rect(x, y, iconW, iconH, 8);
	}

	buf.stroke(...THEME.GREEN_MID, hovered ? 220 : 140);
	buf.strokeWeight(2);
	buf.fill(10, 26, 42, 220);
	buf.rect(tileX, tileY, tileSize, tileSize, 4);

	buf.stroke(...THEME.GREEN_PRIMARY, 140);
	buf.line(tileX + tileSize * 0.28, tileY + tileSize * 0.5, tileX + tileSize * 0.72, tileY + tileSize * 0.5);
	buf.line(tileX + tileSize * 0.5, tileY + tileSize * 0.28, tileX + tileSize * 0.5, tileY + tileSize * 0.72);

	buf.noStroke();
	const labelSz = Math.max(11, buf.width * 0.011);
	applyThemeCanvasFont(buf, labelSz, p);
	buf.textAlign(p.CENTER, p.TOP);
	buf.fill(...THEME.GREEN_SUBTLE, hovered || blinking ? 230 : 170);
	buf.text("Carte de la ville", x + iconW * 0.5, tileY + tileSize + iconH * 0.12);

	return {x, y, w: iconW, h: iconH};
}
