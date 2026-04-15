/**
 * Neighborhood overlay sketch.
 *
 * Hybrid scene companion for neighborhood-scene.js:
 * - Keeps DOM/parallax layers as-is
 * - Adds consistent theme typography as a canvas overlay
 */
import {THEME, applyThemeCanvasFont, tickBlink} from "../../lib/utils/retro-theme.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {slug = "", name = ""} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		let artBuffer;
		let blinkVisible = true;
		let lastBlink = 0;

		sketch.setup = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.noStroke();
		};

		sketch.draw = () => {
			const now = sketch.millis();
			const w = artBuffer.width;
			const h = artBuffer.height;
			const padX = w * 0.04;
			const padY = h * 0.05;

			const blink = tickBlink(blinkVisible, lastBlink, now);
			blinkVisible = blink.visible;
			lastBlink = blink.lastBlink;

			artBuffer.clear();
			artBuffer.textAlign(sketch.RIGHT, sketch.TOP);

			applyThemeCanvasFont(artBuffer, Math.max(14, Math.round(w * 0.018)), sketch, {weight: THEME.FONT_WEIGHT});
			artBuffer.fill(...THEME.GREEN_PRIMARY, 235);
			artBuffer.text(name || slug.toUpperCase(), w - padX, padY);

			applyThemeCanvasFont(artBuffer, Math.max(10, Math.round(w * 0.011)), sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 180);
			artBuffer.text("NEIGHBORHOOD SCENE ACTIVE", w - padX, padY + Math.max(20, h * 0.04));

			if (blinkVisible) {
				applyThemeCanvasFont(artBuffer, Math.max(10, Math.round(w * 0.012)), sketch);
				artBuffer.fill(...THEME.GREEN_MID, 200);
				artBuffer.text("[ ESC / BACKSPACE ] RETOUR", w - padX, h - padY * 1.2);
			}

			sketch.clear();
			sketch.image(artBuffer, 0, 0);
		};

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
		};
	};
}
