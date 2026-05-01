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

const CUTOUT_DIM_ALPHA = 80;
const CUTOUT_DIM_RGB = [0, 0, 0];

export default function (container) {
	const raw = container.dataset.sketchData;
	const {slug = "", name = ""} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		let artBuffer;
		let backRect = null;
		let backHovered = false;
		let scrollContainer = null;

		sketch.setup = () => {
			sketch.pixelDensity(1);
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			scrollContainer = container.closest("[data-game-screen]");
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.pixelDensity(1);
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
			const mouseInCanvas = sketch.mouseX >= 0 && sketch.mouseX <= w && sketch.mouseY >= 0 && sketch.mouseY <= h;
			backHovered = Boolean(mouseInCanvas && backRect && hitTest(sketch.mouseX, sketch.mouseY, backRect));

			artBuffer.textAlign(sketch.RIGHT, sketch.TOP);

			applyThemeCanvasFont(artBuffer, Math.max(14, Math.round(w * 0.018)), sketch, {weight: THEME.FONT_WEIGHT});
			artBuffer.fill(...THEME.GREEN_PRIMARY, 255);
			artBuffer.text(name || slug.toUpperCase(), w - innerPadX, innerPadY / 7);

			applyThemeCanvasFont(artBuffer, Math.max(10, Math.round(w * 0.011)), sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 255);
			artBuffer.text("SCENE DE QUARTIER ACTIVE", w - innerPadX, innerPadY / 2);

			sketch.clear();
			sketch.image(artBuffer, 0, 0);
			sketch.cursor(backHovered ? sketch.HAND : sketch.ARROW);
			container.style.cursor = backHovered ? "pointer" : "default";
		};

		sketch.mousePressed = () => {
			if (backRect && hitTest(sketch.mouseX, sketch.mouseY, backRect)) {
				sceneNavigate("overworld");
			}
		};

		sketch.mouseWheel = (event) => {
			if (!(scrollContainer instanceof HTMLElement)) return true;
			scrollContainer.scrollTop += event.deltaY;
			return false;
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
			artBuffer.pixelDensity(1);
		};
	};
}

function drawOpaqueFrame(buf, w, h, framePad) {
	const outerRadius = Math.min(0, Math.round(framePad * 0.75));
	const innerRadius = Math.max(38, outerRadius - framePad);
	buf.noStroke();
	buf.fill(...THEME.BG, 255);
	buf.rect(0, 0, w, h, outerRadius);

	// Cut out the center so border thickness and inner radius are explicit.
	buf.erase();
	buf.rect(framePad, framePad, w - framePad * 2, h - framePad * 2, innerRadius);
	buf.noErase();
	// Keep the center transparent enough to reveal scene content, but dim it slightly.
	buf.fill(...CUTOUT_DIM_RGB, CUTOUT_DIM_ALPHA);
	buf.rect(framePad, framePad, w - framePad * 2, h - framePad * 2, innerRadius);

	buf.noFill();
	buf.stroke(...THEME.GREEN_PRIMARY, 255);
	//dashed stroke with 4px gap
	//buf.drawingContext.setLineDash([8, 16]);
	buf.strokeWeight(4);
	buf.rect(framePad, framePad, w - framePad * 2, h - framePad * 2, innerRadius);
	buf.noStroke();
}
