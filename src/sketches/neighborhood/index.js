/**
 * Neighborhood overlay sketch.
 *
 * Hybrid scene companion for neighborhood-scene.js:
 * - Keeps DOM/parallax layers as-is
 * - Adds consistent theme typography as a canvas overlay
 */
import {THEME, applyThemeCanvasFont} from "../../lib/utils/retro-theme.js";
import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {drawButton, hitTest} from "../../lib/utils/retro-theme.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {slug = "", name = ""} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		let artBuffer;
		let backRect = null;
		let backHovered = false;

		sketch.setup = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.noStroke();
		};

		sketch.draw = () => {
			const w = artBuffer.width;
			const h = artBuffer.height;
			const framePad = Math.max(24, Math.round(Math.min(w, h) * 0.065));
			const innerPadX = framePad + Math.max(14, Math.round(w * 0.012));
			const innerPadY = framePad + Math.max(10, Math.round(h * 0.01));

			artBuffer.clear();
			drawOpaqueFrame(artBuffer, w, h, framePad);

			const backSize = Math.max(11, Math.round(w * 0.013));
			const backLabel = "[ RETOUR À LA CARTE ]";
			applyThemeCanvasFont(artBuffer, backSize, sketch);
			const backW = artBuffer.textWidth(backLabel) + backSize;
			const backX = framePad + Math.max(12, Math.round(w * 0.01)) + backW * 0.5;
			const backY = framePad * 0.5;
			backRect = drawButton(artBuffer, backLabel, backX, backY, backSize, backHovered, sketch);

			artBuffer.textAlign(sketch.RIGHT, sketch.TOP);

			applyThemeCanvasFont(artBuffer, Math.max(14, Math.round(w * 0.018)), sketch, {weight: THEME.FONT_WEIGHT});
			artBuffer.fill(...THEME.GREEN_PRIMARY, 235);
			artBuffer.text(name || slug.toUpperCase(), w - innerPadX, innerPadY / 7);

			applyThemeCanvasFont(artBuffer, Math.max(10, Math.round(w * 0.011)), sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 180);
			artBuffer.text("SCENE DE QUARTIER ACTIVE", w - innerPadX, innerPadY / 2);

			sketch.clear();
			sketch.image(artBuffer, 0, 0);
			container.style.cursor = backHovered ? "pointer" : "default";
		};

		sketch.mouseMoved = () => {
			backHovered = Boolean(backRect && hitTest(sketch.mouseX, sketch.mouseY, backRect));
		};

		sketch.mousePressed = () => {
			if (backRect && hitTest(sketch.mouseX, sketch.mouseY, backRect)) {
				sceneNavigate("overworld");
			}
		};

		sketch.keyPressed = () => {
			if (sketch.keyCode === sketch.ESCAPE || sketch.keyCode === sketch.BACKSPACE) {
				sceneNavigate("overworld");
				return false;
			}
			return true;
		};

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
		};
	};
}

function drawOpaqueFrame(buf, w, h, framePad) {
	buf.noStroke();
	buf.fill(...THEME.BG, 255);
	// Top
	buf.rect(0, 0, w, framePad);
	// Bottom
	buf.rect(0, h - framePad, w, framePad);
	// Left
	buf.rect(0, framePad, framePad, h - framePad * 2);
	// Right
	buf.rect(w - framePad, framePad, framePad, h - framePad * 2);

	buf.noFill();
	buf.stroke(...THEME.GREEN_MID, 120);
	buf.strokeWeight(2);
	buf.rect(framePad, framePad, w - framePad * 2, h - framePad * 2, 8);
	buf.noStroke();
}
