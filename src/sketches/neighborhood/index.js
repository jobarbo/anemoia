/**
 * Neighborhood overlay sketch.
 *
 * Hybrid scene companion for neighborhood-scene.js:
 * - Keeps DOM/parallax layers as-is
 * - Adds consistent theme typography as a canvas overlay
 * - Left sidebar: Bureau, Carte, liste des récits (repliable au chargement : rail + touche N)
 * - Bouton « [ RETOUR À LA CARTE ] » en haut à gauche de la zone de vue (comme avant)
 */
import {
	computeMainNavSidebarWidth,
	drawMainNavSidebar,
	drawNavSidebarCollapseTab,
	drawNavSidebarToggleRail,
	hitMainNavSidebar,
	layoutNavSidebarCollapseTab,
	layoutNavSidebarToggleRail,
	measureMainNavStoryList,
	pointerInMainNavStoriesClip,
} from "../../lib/navigation/main-nav-canvas.js";
import {THEME, applyThemeCanvasFont, drawButton, hitTest} from "../../lib/utils/retro-theme.js";
import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {createCanvasCursor, drawCanvasCursor} from "../../lib/input/canvas-cursor.js";

const CUTOUT_DIM_ALPHA = 80;
const CUTOUT_DIM_RGB = [0, 0, 0];

export default function (container) {
	const raw = container.dataset.sketchData;
	const {slug = "", name = "", navStories = []} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		let artBuffer;
		let canvasCursor;
		let scrollContainer = null;
		let storyNavScrollY = 0;
		let hoveredLinkId = null;
		let hoveredStorySlug = null;
		let sidebarPanelOpen = false;
		let collapseTabHovered = false;
		let toggleRailHovered = false;
		/** @type {{ x: number, y: number, w: number, h: number } | null} */
		let backRect = null;
		let backHovered = false;

		function framePadFor(w, h) {
			return Math.max(24, Math.round(Math.min(w, h) * 0.065));
		}

		function sidebarWidthPx(w, h) {
			const framePad = framePadFor(w, h);
			return Math.min(computeMainNavSidebarWidth(w), Math.max(160, w - framePad * 2 - 80));
		}

		function onWindowKeyToggleNav(e) {
			if (e.code !== "KeyN" || e.repeat) return;
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			const t = e.target;
			if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
			if (canvasCursor?.isLocked?.()) return;
			if (!artBuffer) return;
			sidebarPanelOpen = !sidebarPanelOpen;
			e.preventDefault();
		}

		sketch.setup = () => {
			sketch.pixelDensity(1);
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			canvas.elt.tabIndex = 0;
			canvasCursor = createCanvasCursor({canvasEl: canvas.elt});
			scrollContainer = container.closest("[data-game-screen]");
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.pixelDensity(1);
			artBuffer.noStroke();
			window.addEventListener("keydown", onWindowKeyToggleNav);
		};

		sketch.draw = () => {
			const w = artBuffer.width;
			const h = artBuffer.height;
			const pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: w, height: h});
			const framePad = framePadFor(w, h);
			const sidebarW = sidebarWidthPx(w, h);
			const navGap = Math.max(8, Math.round(w * 0.01));
			const cutoutLeft = sidebarPanelOpen ? sidebarW + navGap : framePad;
			const innerPadX = framePad + Math.max(14, Math.round(w * 0.012));
			const innerPadY = framePad + Math.max(10, Math.round(h * 0.01));

			artBuffer.clear();
			drawOpaqueFrame(artBuffer, w, h, framePad, cutoutLeft);

			if (sidebarPanelOpen) {
				const sidebarRect = {x: 0, y: 0, w: sidebarW, h};
				const navCtx = {
					neighborhoodSlug: slug,
					neighborhoodName: name,
					stories: navStories,
					currentStorySlug: null,
					storyScrollY: storyNavScrollY,
					hoveredLinkId,
					hoveredStorySlug,
					omitNeighborhoodLink: true,
				};
				const navDraw = drawMainNavSidebar(artBuffer, sidebarRect, navCtx, sketch);
				storyNavScrollY = navDraw.storyScrollY;

				const navHit = hitMainNavSidebar(pointer.x, pointer.y, sidebarRect, navCtx, sketch);
				hoveredLinkId = navHit?.kind === "link" ? navHit.id : null;
				hoveredStorySlug = navHit?.kind === "story" ? navHit.slug : null;

				const collapseR = layoutNavSidebarCollapseTab(sidebarRect);
				collapseTabHovered = hitTest(pointer.x, pointer.y, collapseR);
				drawNavSidebarCollapseTab(artBuffer, collapseR, collapseTabHovered, sketch);
				toggleRailHovered = false;
			} else {
				hoveredLinkId = null;
				hoveredStorySlug = null;
				collapseTabHovered = false;
				const rail = layoutNavSidebarToggleRail(h, 0);
				toggleRailHovered = hitTest(pointer.x, pointer.y, rail);
				drawNavSidebarToggleRail(artBuffer, rail, toggleRailHovered, sketch);
			}

			const backLabel = "[ RETOUR À LA CARTE ]";
			const backSize = Math.max(11, Math.round(w * 0.013));
			applyThemeCanvasFont(artBuffer, backSize, sketch);
			const backW = artBuffer.textWidth(backLabel) + backSize;
			const backX = cutoutLeft + Math.max(12, Math.round(w * 0.01)) + backW * 0.5;
			const backY = framePad * 0.5;
			const mouseInCanvas = pointer.insideCanvas || pointer.locked;
			backRect = drawButton(artBuffer, backLabel, backX, backY, backSize, backHovered, sketch);
			backHovered = Boolean(mouseInCanvas && backRect && hitTest(pointer.x, pointer.y, backRect));

			artBuffer.textAlign(sketch.RIGHT, sketch.TOP);

			applyThemeCanvasFont(artBuffer, Math.max(14, Math.round(w * 0.018)), sketch, {weight: THEME.FONT_WEIGHT});
			artBuffer.fill(...THEME.GREEN_PRIMARY, 255);
			artBuffer.text(name || slug.toUpperCase(), w - innerPadX, innerPadY / 7);

			applyThemeCanvasFont(artBuffer, Math.max(10, Math.round(w * 0.011)), sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 255);
			artBuffer.text("SCÈNE DE QUARTIER ACTIVE", w - innerPadX, innerPadY / 2);

			sketch.clear();
			const sidebarHover = Boolean(hoveredLinkId || hoveredStorySlug);
			drawCanvasCursor(artBuffer, pointer, {
				hovered: sidebarHover || collapseTabHovered || toggleRailHovered || backHovered,
			});
			sketch.image(artBuffer, 0, 0);
		};

		sketch.mousePressed = () => {
			const pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: artBuffer.width, height: artBuffer.height});
			const w = artBuffer.width;
			const h = artBuffer.height;
			const framePad = framePadFor(w, h);
			const navGap = Math.max(8, Math.round(w * 0.01));
			const sidebarW = sidebarWidthPx(w, h);
			const cutoutLeft = sidebarPanelOpen ? sidebarW + navGap : framePad;

			if (backRect && hitTest(pointer.x, pointer.y, backRect)) {
				sceneNavigate("overworld");
				return;
			}

			if (sidebarPanelOpen) {
				const sidebarRect = {x: 0, y: 0, w: sidebarW, h};
				const collapseR = layoutNavSidebarCollapseTab(sidebarRect);
				if (hitTest(pointer.x, pointer.y, collapseR)) {
					sidebarPanelOpen = false;
					return;
				}
				const navCtx = {
					neighborhoodSlug: slug,
					neighborhoodName: name,
					stories: navStories,
					currentStorySlug: null,
					storyScrollY: storyNavScrollY,
					omitNeighborhoodLink: true,
				};
				const hit = hitMainNavSidebar(pointer.x, pointer.y, sidebarRect, navCtx, sketch);
				if (hit?.kind === "link") {
					if (hit.id === "desktop") sceneNavigate("desktop");
					else if (hit.id === "overworld") sceneNavigate("overworld");
					return;
				}
				if (hit?.kind === "story" && hit.slug) {
					sceneNavigate("story", {slug: hit.slug});
				}
			} else {
				const rail = layoutNavSidebarToggleRail(h, 0);
				if (hitTest(pointer.x, pointer.y, rail)) {
					sidebarPanelOpen = true;
				}
			}
		};

		sketch.mouseWheel = (event) => {
			const w = artBuffer.width;
			const h = artBuffer.height;
			const sidebarW = sidebarWidthPx(w, h);
			const pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: w, height: h});

			if (sidebarPanelOpen) {
				const sidebarRect = {x: 0, y: 0, w: sidebarW, h};
				const navCtx = {
					neighborhoodSlug: slug,
					neighborhoodName: name,
					stories: navStories,
					currentStorySlug: null,
					storyScrollY: storyNavScrollY,
					omitNeighborhoodLink: true,
				};
				if (pointerInMainNavStoriesClip(pointer.x, pointer.y, sidebarRect, navCtx, sketch)) {
					const sm = measureMainNavStoryList(sidebarRect, navCtx, w);
					storyNavScrollY = sketch.constrain(storyNavScrollY + event.deltaY, 0, sm.storyScrollMax);
					return false;
				}
				if (hitTest(pointer.x, pointer.y, sidebarRect)) {
					return false;
				}
			}

			if (!(scrollContainer instanceof HTMLElement)) return true;
			scrollContainer.scrollTop += event.deltaY;
			return false;
		};

		sketch.keyPressed = () => {
			if (sketch.keyCode === sketch.ESCAPE && canvasCursor?.isLocked()) {
				return false;
			}
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

		if (typeof sketch.registerMethod === "function") {
			sketch.registerMethod("remove", () => {
				window.removeEventListener("keydown", onWindowKeyToggleNav);
				canvasCursor?.destroy();
			});
		}
	};
}

/**
 * @param {number} cutoutLeft - x position where the scene viewport cutout begins (after sidebar)
 */
function drawOpaqueFrame(buf, w, h, framePad, cutoutLeft) {
	const outerRadius = Math.min(0, Math.round(framePad * 0.75));
	const innerRadius = Math.max(38, outerRadius - framePad);
	const cutW = Math.max(40, w - cutoutLeft - framePad);
	const cutH = Math.max(40, h - framePad * 2);
	buf.noStroke();
	buf.fill(...THEME.BG, 255);
	buf.rect(0, 0, w, h, outerRadius);

	buf.erase();
	buf.rect(cutoutLeft, framePad, cutW, cutH, innerRadius);
	buf.noErase();
	buf.fill(...CUTOUT_DIM_RGB, CUTOUT_DIM_ALPHA);
	buf.rect(cutoutLeft, framePad, cutW, cutH, innerRadius);

	buf.noFill();
	buf.stroke(...THEME.GREEN_PRIMARY, 255);
	buf.strokeWeight(4);
	buf.rect(cutoutLeft, framePad, cutW, cutH, innerRadius);
	buf.noStroke();
}
