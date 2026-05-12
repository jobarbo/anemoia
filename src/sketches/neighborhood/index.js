/**
 * Neighborhood overlay sketch.
 *
 * Hybrid scene companion for neighborhood-scene.js:
 * - Keeps DOM/parallax layers as-is
 * - Adds consistent theme typography as a canvas overlay
 * - Left sidebar: Bureau, Carte, liste des récits (repliable au chargement : rail + touche N)
 * - Bouton « [ RETOUR À LA CARTE ] » en haut à gauche de la zone de vue (comme avant)
 *
 * The canvas is `pointer-events: none` so scene layers (e.g. interactive zones) receive
 * hits inside the game cutout. UI hits are handled on `window` capture using the same
 * layout math as draw. Clicks on dimmed chrome outside the cutout are swallowed so they
 * do not fall through to unrelated scene pixels.
 *
 * Pointer lock / software cursor: `clientX`/`clientY` do not follow the drawn cursor.
 * Cutout hit tests and scene `.zone` clicks use the same art-buffer coordinates as
 * {@link createCanvasCursor} (updated each draw), with CRT/zoom remapping for DOM pick.
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
import {getLocale} from "../../lib/data/scene-data.js";
import {neighborhoodStrings} from "../../lib/i18n/ui-strings.js";
import {THEME, applyThemeCanvasFont, drawButton, hitTest, readingUiFontSize} from "../../lib/utils/retro-theme.js";
import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {createCanvasCursor, drawCanvasCursor} from "../../lib/input/canvas-cursor.js";
import {remapPointer} from "../../lib/input/input-remap.js";
import {getGlobalShaderOverlay} from "../../lib/shaders/global-shader-overlay.js";
import {playUiClickSfx, playUiHoverSfxIfTargetChanged} from "../../lib/audio/ui-hover-sfx.js";

const CUTOUT_DIM_ALPHA = 80;
const CUTOUT_DIM_RGB = [0, 0, 0];

export default function (container) {
	const raw = container.dataset.sketchData;
	const {slug = "", name = "", navStories = []} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		/** Removes all `window` capture listeners when {@link runNeighborhoodWindowCleanup} runs (p5 v2 has no `registerMethod`). */
		const windowInputAbort = new AbortController();

		let artBuffer;
		let canvasCursor;
		/** @type {HTMLCanvasElement | null} */
		let canvasRef = null;
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
		/** @type {string|null} */
		let neighborhoodUiHoverPrevKey = null;
		let lastClientX = 0;
		let lastClientY = 0;
		/** Art-buffer coords matching {@link createCanvasCursor} (software pointer). */
		let lastArtPointerX = 0;
		let lastArtPointerY = 0;
		let lastArtPointerReady = false;
		/** @type {Element | null} */
		let lastVirtualHoveredZone = null;

		function framePadFor(w, h) {
			return Math.max(24, Math.round(Math.min(w, h) * 0.065));
		}

		function sidebarWidthPx(w, h) {
			const framePad = framePadFor(w, h);
			return Math.min(computeMainNavSidebarWidth(w), Math.max(160, w - framePad * 2 - 80));
		}

		/**
		 * @param {number} w
		 * @param {number} h
		 */
		function layoutNeighborhoodUI(w, h) {
			const framePad = framePadFor(w, h);
			const navGap = Math.max(8, Math.round(w * 0.01));
			const sidebarW = sidebarWidthPx(w, h);
			const cutoutLeft = sidebarPanelOpen ? sidebarW + navGap : framePad;
			const cutW = Math.max(40, w - cutoutLeft - framePad);
			const cutH = Math.max(40, h - framePad * 2);
			return {framePad, navGap, sidebarW, cutoutLeft, cutW, cutH};
		}

		/**
		 * @param {number} px - canvas space
		 * @param {number} py
		 * @param {ReturnType<typeof layoutNeighborhoodUI>} lay
		 */
		function pointerInGameCutout(px, py, lay) {
			return px >= lay.cutoutLeft && px <= lay.cutoutLeft + lay.cutW && py >= lay.framePad && py <= lay.framePad + lay.cutH;
		}

		/**
		 * @param {number} clientX
		 * @param {number} clientY
		 */
		function clientToCanvasPx(clientX, clientY) {
			if (!canvasRef || !artBuffer) return {x: 0, y: 0, ok: false};
			const r = canvasRef.getBoundingClientRect();
			const w = artBuffer.width;
			const h = artBuffer.height;
			const sx = w / Math.max(r.width, 1);
			const sy = h / Math.max(r.height, 1);
			return {
				x: (clientX - r.left) * sx,
				y: (clientY - r.top) * sy,
				ok: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom,
			};
		}

		function syncLastPointerFromWindow() {
			const p = clientToCanvasPx(lastClientX, lastClientY);
			return p.ok ? p : {x: 0, y: 0, ok: false};
		}

		function clearVirtualZoneHover() {
			if (lastVirtualHoveredZone instanceof HTMLElement) {
				lastVirtualHoveredZone.classList.remove("zone--virtual-hover");
			}
			lastVirtualHoveredZone = null;
		}

		/** p5 v2 has no `registerMethod`; scene unmount calls this via the container expando. */
		function runNeighborhoodWindowCleanup() {
			if (windowInputAbort.signal.aborted) return;
			clearVirtualZoneHover();
			windowInputAbort.abort();
			canvasCursor?.destroy();
			delete container.__anemoiaNeighborhoodP5Teardown;
		}

		/**
		 * Map art-buffer pixel to logical viewport coords for `elementFromPoint`
		 * (inverts CRT/zoom the same way as pointer remapping).
		 */
		function logicalClientFromArtBufferPx(px, py, bufW, bufH) {
			if (!canvasRef) return {ok: false, lx: 0, ly: 0};
			const r = canvasRef.getBoundingClientRect();
			const screenX = r.left + (px / Math.max(bufW, 1)) * r.width;
			const screenY = r.top + (py / Math.max(bufH, 1)) * r.height;
			const params = getGlobalShaderOverlay()?.getWarpParams() ?? null;
			const {x: lx, y: ly} = remapPointer(screenX, screenY, params);
			return {ok: true, lx, ly};
		}

		/**
		 * Hit-test `.zone` nodes in viewport space (avoids elementFromPoint missing due to
		 * stacking, pointer-events chains, or compositor vs DOM mismatches).
		 */
		function findSceneZoneAtLogicalClient(lx, ly) {
			if (!(scrollContainer instanceof HTMLElement)) return null;
			const zones = scrollContainer.querySelectorAll(".zone");
			const list = [...zones].filter((el) => el.isConnected);
			list.sort((a, b) => {
				const za = Number.parseInt(getComputedStyle(a).zIndex, 10) || 0;
				const zb = Number.parseInt(getComputedStyle(b).zIndex, 10) || 0;
				return zb - za;
			});
			for (const el of list) {
				const r = el.getBoundingClientRect();
				if (r.width <= 0 || r.height <= 0) continue;
				if (lx >= r.left && lx <= r.right && ly >= r.top && ly <= r.bottom) return el;
			}
			return null;
		}

		/**
		 * Resolve scene interactive zones using the software cursor (not native client coords).
		 */
		function tryForwardSceneZoneClickAtArtBufferPx(px, py, bufW, bufH) {
			const {ok, lx, ly} = logicalClientFromArtBufferPx(px, py, bufW, bufH);
			if (!ok) return false;
			let zone = findSceneZoneAtLogicalClient(lx, ly);
			if (!zone && canvasRef) {
				const r = canvasRef.getBoundingClientRect();
				const sx = r.left + (px / Math.max(bufW, 1)) * r.width;
				const sy = r.top + (py / Math.max(bufH, 1)) * r.height;
				zone = findSceneZoneAtLogicalClient(sx, sy);
			}
			if (!zone || !scrollContainer.contains(zone)) return false;

			const navA = zone.closest("a.zone--navigate");
			if (navA instanceof HTMLAnchorElement) {
				playUiClickSfx();
				const target = navA.getAttribute("href") || "";
				const storyMatch = target.match(/^\/story\/([^/]+)/);
				if (storyMatch) {
					sceneNavigate("story", {slug: storyMatch[1]});
				} else {
					sceneNavigate("overworld");
				}
				return true;
			}

			if (zone.matches("button.zone--state")) {
				playUiClickSfx();
				zone.click();
				return true;
			}

			return false;
		}

		function updateVirtualZoneHoverFromArtPointer(px, py, lay, bufW, bufH) {
			if (!pointerInGameCutout(px, py, lay)) {
				clearVirtualZoneHover();
				return false;
			}
			const {ok, lx, ly} = logicalClientFromArtBufferPx(px, py, bufW, bufH);
			if (!ok || !(scrollContainer instanceof HTMLElement)) {
				clearVirtualZoneHover();
				return false;
			}
			let zone = findSceneZoneAtLogicalClient(lx, ly);
			if (!zone && canvasRef) {
				const r = canvasRef.getBoundingClientRect();
				const sx = r.left + (px / Math.max(bufW, 1)) * r.width;
				const sy = r.top + (py / Math.max(bufH, 1)) * r.height;
				zone = findSceneZoneAtLogicalClient(sx, sy);
			}
			if (zone && scrollContainer.contains(zone)) {
				if (lastVirtualHoveredZone !== zone) {
					clearVirtualZoneHover();
					lastVirtualHoveredZone = zone;
					if (zone instanceof HTMLElement) zone.classList.add("zone--virtual-hover");
				}
				return true;
			}
			clearVirtualZoneHover();
			return false;
		}

		/**
		 * @param {number} x canvas px
		 * @param {number} y
		 * @param {number} w
		 * @param {number} h
		 * @returns {boolean} true if a UI action ran (nav / toggle)
		 */
		function tryHandleNeighborhoodClick(x, y, w, h) {
			const lay = layoutNeighborhoodUI(w, h);

			if (backRect && hitTest(x, y, backRect)) {
				playUiClickSfx();
				sceneNavigate("overworld");
				return true;
			}

			if (sidebarPanelOpen) {
				const sidebarRect = {x: 0, y: 0, w: lay.sidebarW, h};
				const collapseR = layoutNavSidebarCollapseTab(sidebarRect);
				if (hitTest(x, y, collapseR)) {
					playUiClickSfx();
					sidebarPanelOpen = false;
					return true;
				}
				const navCtx = {
					neighborhoodSlug: slug,
					neighborhoodName: name,
					stories: navStories,
					currentStorySlug: null,
					storyScrollY: storyNavScrollY,
					omitNeighborhoodLink: true,
				};
				const hit = hitMainNavSidebar(x, y, sidebarRect, navCtx, sketch);
				if (hit?.kind === "link") {
					if (hit.id === "desktop") {
						playUiClickSfx();
						sceneNavigate("desktop");
					} else if (hit.id === "overworld") {
						playUiClickSfx();
						sceneNavigate("overworld");
					}
					return true;
				}
				if (hit?.kind === "story" && hit.slug) {
					playUiClickSfx();
					sceneNavigate("story", {slug: hit.slug});
					return true;
				}
			} else {
				const rail = layoutNavSidebarToggleRail(h, 0);
				if (hitTest(x, y, rail)) {
					playUiClickSfx();
					sidebarPanelOpen = true;
					return true;
				}
			}
			return false;
		}

		/** @param {PointerEvent} e */
		function onWindowPointerDownCapture(e) {
			if (e.pointerType === "mouse" && e.button !== 0) return;
			if (!artBuffer || !canvasRef) return;
			const w = artBuffer.width;
			const h = artBuffer.height;
			const lay = layoutNeighborhoodUI(w, h);
			const useArt = lastArtPointerReady;
			const pFallback = clientToCanvasPx(e.clientX, e.clientY);
			const px = useArt ? lastArtPointerX : pFallback.x;
			const py = useArt ? lastArtPointerY : pFallback.y;
			const ok = useArt || pFallback.ok;
			if (!ok) return;
			// Back / rail / sidebar can overlap the cutout — handle before pass-through.
			if (tryHandleNeighborhoodClick(px, py, w, h)) {
				e.preventDefault();
				e.stopImmediatePropagation();
				return;
			}
			if (pointerInGameCutout(px, py, lay)) {
				// Canvas has pointer-events: none so createCanvasCursor never receives
				// pointerdown; request pointer lock from the same window gesture.
				canvasCursor?.engagePointerLockFromUserGesture?.(e);
				if (tryForwardSceneZoneClickAtArtBufferPx(px, py, w, h)) {
					e.preventDefault();
					e.stopImmediatePropagation();
				}
				return;
			}
			e.preventDefault();
			e.stopImmediatePropagation();
		}

		/** @param {WheelEvent} e */
		function onWindowWheelCapture(e) {
			if (!artBuffer || !canvasRef) return;
			const w = artBuffer.width;
			const h = artBuffer.height;
			const pFallback = clientToCanvasPx(e.clientX, e.clientY);
			const useArt = lastArtPointerReady;
			const x = useArt ? lastArtPointerX : pFallback.x;
			const y = useArt ? lastArtPointerY : pFallback.y;
			const ok = useArt || pFallback.ok;
			if (!ok) return;
			const lay = layoutNeighborhoodUI(w, h);
			const pointer = canvasCursor.beginFrame({mouseX: x, mouseY: y, width: w, height: h});

			if (sidebarPanelOpen) {
				const sidebarRect = {x: 0, y: 0, w: lay.sidebarW, h};
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
					storyNavScrollY = sketch.constrain(storyNavScrollY + e.deltaY, 0, sm.storyScrollMax);
					e.preventDefault();
					e.stopImmediatePropagation();
					return;
				}
				if (hitTest(pointer.x, pointer.y, sidebarRect)) {
					e.preventDefault();
					e.stopImmediatePropagation();
					return;
				}
			}

			if (pointerInGameCutout(x, y, lay) && scrollContainer instanceof HTMLElement) {
				scrollContainer.scrollTop += e.deltaY;
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		}

		function onWindowPointerMove(e) {
			lastClientX = e.clientX;
			lastClientY = e.clientY;
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
			canvasRef = canvas.elt;
			canvasRef.style.pointerEvents = "none";
			container.style.pointerEvents = "none";
			canvasCursor = createCanvasCursor({canvasEl: canvas.elt});
			scrollContainer = container.closest("[data-game-screen]");
			lastArtPointerX = w * 0.5;
			lastArtPointerY = h * 0.5;
			lastArtPointerReady = true;
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.pixelDensity(1);
			artBuffer.noStroke();
			const sig = windowInputAbort.signal;
			window.addEventListener("keydown", onWindowKeyToggleNav, {signal: sig});
			window.addEventListener("pointerdown", onWindowPointerDownCapture, {capture: true, signal: sig});
			window.addEventListener("pointermove", onWindowPointerMove, {passive: true, signal: sig});
			window.addEventListener("wheel", onWindowWheelCapture, {passive: false, capture: true, signal: sig});
			container.__anemoiaNeighborhoodP5Teardown = runNeighborhoodWindowCleanup;
		};

		sketch.draw = () => {
			const w = artBuffer.width;
			const h = artBuffer.height;
			const p = syncLastPointerFromWindow();
			const pointer = canvasCursor.beginFrame({
				mouseX: p.ok ? p.x : sketch.mouseX,
				mouseY: p.ok ? p.y : sketch.mouseY,
				width: w,
				height: h,
			});
			lastArtPointerX = pointer.x;
			lastArtPointerY = pointer.y;
			lastArtPointerReady = true;
			const lay = layoutNeighborhoodUI(w, h);
			const framePad = lay.framePad;
			const sidebarW = lay.sidebarW;
			const cutoutLeft = lay.cutoutLeft;
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

			const backLabel = neighborhoodStrings(getLocale()).backToMap;
			const backSize = readingUiFontSize(Math.max(11, Math.round(w * 0.013)));
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

			applyThemeCanvasFont(artBuffer, readingUiFontSize(Math.max(10, Math.round(w * 0.011))), sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 255);
			artBuffer.text(neighborhoodStrings(getLocale()).activeScene, w - innerPadX, innerPadY / 2);

			const sceneZoneVirtualHover = updateVirtualZoneHoverFromArtPointer(pointer.x, pointer.y, lay, w, h);

			if (sceneZoneVirtualHover && lastVirtualHoveredZone instanceof HTMLElement) {
				const tooltipLabel = lastVirtualHoveredZone.closest(".zone")?.dataset?.tooltip ?? null;
				if (tooltipLabel) drawZoneTooltip(artBuffer, pointer.x, pointer.y, tooltipLabel, sketch);
			}

			{
				let hotKey = null;
				if (backHovered) hotKey = "back";
				else if (sidebarPanelOpen) {
					if (collapseTabHovered) hotKey = "collapse";
					else if (hoveredLinkId) hotKey = `link:${hoveredLinkId}`;
					else if (hoveredStorySlug) hotKey = `story:${hoveredStorySlug}`;
				} else if (toggleRailHovered) hotKey = "rail";
				else if (sceneZoneVirtualHover) hotKey = "scene-zone";
				neighborhoodUiHoverPrevKey = playUiHoverSfxIfTargetChanged(neighborhoodUiHoverPrevKey, hotKey);
			}

			sketch.clear();
			const sidebarHover = Boolean(hoveredLinkId || hoveredStorySlug);
			drawCanvasCursor(artBuffer, pointer, {
				hovered: sidebarHover || collapseTabHovered || toggleRailHovered || backHovered || sceneZoneVirtualHover,
			});
			sketch.image(artBuffer, 0, 0);
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
	};
}

/**
 * Draw a small retro-styled tooltip above the cursor showing a story name.
 *
 * @param {p5.Graphics} buf
 * @param {number} px - cursor x in art-buffer space
 * @param {number} py - cursor y in art-buffer space
 * @param {string} label
 * @param {p5} sketch
 */
function drawZoneTooltip(buf, px, py, label, sketch) {
	const fontSize = readingUiFontSize(Math.max(11, Math.round(buf.width * 0.012)));
	applyThemeCanvasFont(buf, fontSize, sketch);
	const textW = buf.textWidth(label);
	const padX = Math.round(fontSize * 0.85);
	const padY = Math.round(fontSize * 0.55);
	const boxW = textW + padX * 2;
	const boxH = fontSize + padY * 2;
	const gap = Math.round(fontSize * 0.7);

	let bx = px - boxW / 2;
	let by = py - boxH - gap;
	bx = Math.max(4, Math.min(buf.width - boxW - 4, bx));
	by = Math.max(4, Math.min(buf.height - boxH - 4, by));

	buf.noStroke();
	buf.fill(...THEME.BG, 232);
	buf.rect(bx, by, boxW, boxH, 4);

	buf.stroke(...THEME.GREEN_PRIMARY, 130);
	buf.strokeWeight(1);
	buf.noFill();
	buf.rect(bx, by, boxW, boxH, 4);
	buf.noStroke();

	buf.fill(...THEME.GREEN_MID, 245);
	buf.textAlign(sketch.LEFT, sketch.TOP);
	buf.text(label, bx + padX, by + padY);
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
