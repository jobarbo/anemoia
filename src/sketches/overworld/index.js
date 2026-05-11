/**
 * Overworld map sketch — phosphor-green terminal aesthetic.
 *
 * Receives neighborhood data via container[data-sketch-data]:
 *   { neighborhoods: Array<{ id, name, slug, position: {x, y} }> }
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
import {createCanvasCursor, drawCanvasCursor} from "../../lib/input/canvas-cursor.js";
import {getOverworldMapData} from "../../lib/data/overworld-map-data.js";
import {playUiClickSfx, playUiHoverSfxIfTargetChanged} from "../../lib/audio/ui-hover-sfx.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {neighborhoods: rawNeighborhoods = []} = raw ? JSON.parse(raw) : {};
	const neighborhoods = [...rawNeighborhoods].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
	const getNeighborhoodKey = (neighborhood) => String(neighborhood?.slug ?? neighborhood?.id ?? neighborhood?.name ?? "").trim();
	const isNeighborhoodEnabled = (neighborhood) => neighborhood?.viewEnabled !== false;
	const isNeighborhoodIndexEnabled = (index) => isNeighborhoodEnabled(neighborhoods[index]);
	const getNeighborhoodIndexByKey = (key) => neighborhoods.findIndex((hood) => getNeighborhoodKey(hood) === key);
	const isNeighborhoodKeyEnabled = (key) => {
		const index = getNeighborhoodIndexByKey(key);
		return index >= 0 && isNeighborhoodIndexEnabled(index);
	};
	const findFirstEnabledPin = () => neighborhoods.findIndex((hood) => isNeighborhoodEnabled(hood));

	return (sketch) => {
		/** P2D offscreen buffer — all drawing happens here, GlobalShaderOverlay handles GLSL. */
		let artBuffer;
		let canvasCursor;
		let pointer = {x: 0, y: 0, insideCanvas: false, locked: false, visible: false};
		/** Keyboard selection index: 0..neighborhoods.length-1 = pin */
		let selectedPin = 0;

		let closeRect = null;
		let closeHovered = false;
		let mapBounds = {x: 0, y: 0, w: 0, h: 0};
		let zoomedMapBounds = {x: 0, y: 0, w: 0, h: 0};
		let mapOutline = null;
		let mapOutlineState = "loading";
		let cityGeoBounds = null;
		let neighborhoodOverlays = [];
		let hoveredNeighborhoodKey = null;
		/** @type {string|null} */
		let overworldUiHoverPrevKey = null;

		// ── Zoom and Pan state ─────────────────────────────────────────────────────
		let zoomLevel = 1.0; // 1.0 = 100%, 2.0 = 200%, etc.
		let panX = 0; // Offset from center
		let panY = 0;
		const MIN_ZOOM = 1.0;
		const MAX_ZOOM = 4.0;
		let _panCanvasEl = null;
		let sidebarBounds = {x: 0, y: 0, w: 0, h: 0};

		const findNextEnabledPin = (fromIndex, step) => {
			const total = neighborhoods.length;
			if (total === 0) return -1;
			let next = fromIndex;
			for (let i = 0; i < total; i++) {
				next = (next + step + total) % total;
				if (isNeighborhoodIndexEnabled(next)) return next;
			}
			return -1;
		};

		const navigateToNeighborhoodAtIndex = (index) => {
			if (!isNeighborhoodIndexEnabled(index)) return false;
			sceneNavigate("neighborhood", {slug: neighborhoods[index].slug});
			return true;
		};

		const navigateToNeighborhoodByKey = (key) => {
			const index = getNeighborhoodIndexByKey(key);
			if (index < 0) return false;
			if (!navigateToNeighborhoodAtIndex(index)) return false;
			selectedPin = index;
			return true;
		};

		const getHoveredSidebarIndex = () => {
			if (!sidebarBounds.w || !sidebarBounds.h) return -1;
			return findSidebarItemAtPointer(pointer, sidebarBounds, neighborhoods, sketch);
		};

		sketch.setup = () => {
			sketch.pixelDensity(1);
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			canvasCursor = createCanvasCursor({canvasEl: canvas.elt});
			canvas.elt.tabIndex = 0;
			canvas.elt.focus();
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.pixelDensity(1);
			artBuffer.noStroke();
			artBuffer.textFont(THEME.FONT);
			if (!isNeighborhoodIndexEnabled(selectedPin)) {
				const firstEnabled = findFirstEnabledPin();
				selectedPin = firstEnabled >= 0 ? firstEnabled : 0;
			}

			// Fallback keyboard handling when p5 key events are swallowed by focus changes.
			window.addEventListener("keydown", onWindowKeyDown);
			if (typeof sketch.registerMethod === "function") {
				sketch.registerMethod("remove", () => {
					window.removeEventListener("keydown", onWindowKeyDown);
				});
			}

			void getOverworldMapData(neighborhoods).then((data) => {
				mapOutline = data.mapOutline;
				cityGeoBounds = data.unionBounds;
				neighborhoodOverlays = data.overlays;
				mapOutlineState = data.mapOutline.length > 0 ? "ready" : "fallback";
			});

			// Attach pan listener now that the canvas element exists
			_panCanvasEl = canvas.elt;
			_panCanvasEl.addEventListener("pointermove", onPointerMove);
		};

		sketch.draw = () => {
			const w = artBuffer.width;
			const h = artBuffer.height;
			pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: w, height: h});

			// ── Background ────────────────────────────────────────────────────────
			drawDesktopBackground(artBuffer, w, h);

			const topBar = drawWindowTopBar(artBuffer, w, h, closeHovered, sketch);
			closeRect = topBar.closeRect;
			closeHovered = Boolean(closeRect && hitTest(pointer.x, pointer.y, closeRect));
			const topBarH = topBar.height;
			const bottomBarH = drawBottomStatusBar(artBuffer, w, h, sketch, zoomLevel, panX, panY);

			// ── Map area ──────────────────────────────────────────────────────────
			const mapPad = w * 0.05;
			const titleH = h * 0.08;
			const footerH = bottomBarH + h * 0.03;
			const mapX = mapPad;
			const mapY = topBarH + titleH;
			const totalW = w - mapPad * 2;
			const mapH = h - mapY - footerH;
			const sidebarGap = Math.max(10, w * 0.012);
			const sidebarW = Math.max(190, totalW * 0.24);
			const mapW = Math.max(220, totalW - sidebarW - sidebarGap);
			const sidebarX = mapX + mapW + sidebarGap;
			mapBounds = {x: mapX, y: mapY, w: mapW, h: mapH};
			sidebarBounds = {x: sidebarX, y: mapY, w: sidebarW, h: mapH};

			// ── Compute zoomed map rect for geo content ────────────────────────────
			const mapCenterX = mapX + mapW * 0.5;
			const mapCenterY = mapY + mapH * 0.5;
			const zMapW = mapW * zoomLevel;
			const zMapH = mapH * zoomLevel;
			const zMapX = mapCenterX + (panX - 0.5) * mapW * zoomLevel;
			const zMapY = mapCenterY + (panY - 0.5) * mapH * zoomLevel;
			zoomedMapBounds = {x: zMapX, y: zMapY, w: zMapW, h: zMapH};

			const selectedNeighborhoodKey = getNeighborhoodKey(neighborhoods[selectedPin]);
			const hoveredSidebarIndex = getHoveredSidebarIndex();

			// Hover detection uses zoomed positions (zoomedMapBounds via closures)
			const hoveredOverlay = findNeighborhoodOverlayAtMouse();
			const hoveredPin = findPinAtMouse();
			const hoveredMapIndex = hoveredOverlay ? getNeighborhoodIndexByKey(hoveredOverlay.neighborhoodKey) : hoveredPin;
			const effectiveHoveredIndex = hoveredSidebarIndex >= 0 ? hoveredSidebarIndex : hoveredMapIndex;
			hoveredNeighborhoodKey = effectiveHoveredIndex >= 0 ? getNeighborhoodKey(neighborhoods[effectiveHoveredIndex]) : null;

			{
				let hotKey = null;
				if (closeHovered) hotKey = "close";
				else if (hoveredSidebarIndex >= 0) hotKey = `sb:${hoveredSidebarIndex}`;
				else if (hoveredOverlay) hotKey = `ov:${hoveredOverlay.neighborhoodKey}`;
				else if (hoveredPin >= 0) hotKey = `pin:${hoveredPin}`;
				overworldUiHoverPrevKey = playUiHoverSfxIfTargetChanged(overworldUiHoverPrevKey, hotKey);
			}

			// ── Map background & grid (no zoom) ────────────────────────────────────
			drawMapBackground(artBuffer, mapX, mapY, mapW, mapH);

			// ── Clip to map rect, draw geo content with zoom applied via coords ────
			artBuffer.drawingContext.save();
			artBuffer.drawingContext.beginPath();
			artBuffer.drawingContext.rect(mapX, mapY, mapW, mapH);
			artBuffer.drawingContext.clip();

			drawMapOutline(artBuffer, zMapX, zMapY, zMapW, zMapH, mapOutline, cityGeoBounds);
			drawNeighborhoodOverlays(artBuffer, {x: zMapX, y: zMapY, w: zMapW, h: zMapH}, neighborhoodOverlays, hoveredNeighborhoodKey, selectedNeighborhoodKey, cityGeoBounds, sketch, neighborhoods);

			// ── Neighborhood pins (only when no polygon overlay) ──────────────────
			for (let i = 0; i < neighborhoods.length; i++) {
				if (hasNeighborhoodOverlayAtIndex(i)) continue;
				const hood = neighborhoods[i];
				const px = zMapX + (hood.position.x / 100) * zMapW;
				const py = zMapY + (hood.position.y / 100) * zMapH;
				const enabled = isNeighborhoodEnabled(hood);
				const pinActive = enabled && (selectedPin === i || effectiveHoveredIndex === i);
				drawPin(artBuffer, px, py, hood.name, pinActive, sketch, {disabled: !enabled, showLabel: effectiveHoveredIndex === i});
			}

			artBuffer.drawingContext.restore();

			// ── Map frame & status (no zoom) ────────────────────────────────────────
			drawMapFrame(artBuffer, mapX, mapY, mapW, mapH, mapOutlineState, zoomLevel, sketch);
			drawNeighborhoodSidebar(artBuffer, sidebarBounds, neighborhoods, selectedPin, effectiveHoveredIndex, sketch);

			// ── Title ─────────────────────────────────────────────────────────────
			const titleSz = w * 0.028;
			drawTitleAberration(artBuffer, "Les Villes Verticales", w / 2, topBarH + titleH * 0.45, titleSz, 255, sketch);

			// Key hint
			const hintSz = w * 0.011;
			artBuffer.textAlign(sketch.RIGHT, sketch.CENTER);
			applyThemeCanvasFont(artBuffer, hintSz, sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 210);
			artBuffer.text("↑↓ CHOISIR   ENTRÉE CONFIRMER   ÉCH FERMER   🖱↑↓ ZOOM/PAN", w - w * 0.04, h - bottomBarH * 0.5);

			// Draw pan limit indicators
			if (zoomLevel > 1.01) {
				drawPanLimitIndicators(artBuffer, mapX, mapY, mapW, mapH, panX, panY, zoomLevel, sketch);
			}

			// Blit artBuffer onto output canvas
			drawCanvasCursor(artBuffer, pointer, {hovered: closeHovered || hoveredPin >= 0 || hoveredNeighborhoodKey != null || hoveredSidebarIndex >= 0});
			sketch.clear();
			sketch.image(artBuffer, 0, 0);
		};

		sketch.keyPressed = () => {
			return handleKeyInput(sketch.keyCode);
		};

		sketch.mouseWheel = (event) => {
			if (!mapBounds.w || !mapBounds.h) return false;

			// Check if mouse is over map area
			if (pointer.x < mapBounds.x || pointer.x > mapBounds.x + mapBounds.w || pointer.y < mapBounds.y || pointer.y > mapBounds.y + mapBounds.h) {
				return false;
			}

			const zoomSpeed = 0.1;
			const oldZoom = zoomLevel;
			zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel + (event.deltaY > 0 ? -zoomSpeed : zoomSpeed)));

			// Adjust pan to zoom towards mouse cursor
			if (zoomLevel !== oldZoom) {
				const mapCenterX = mapBounds.x + mapBounds.w * 0.5;
				const mapCenterY = mapBounds.y + mapBounds.h * 0.5;
				const mouseRelX = pointer.x - mapCenterX;
				const mouseRelY = pointer.y - mapCenterY;

				const zoomDelta = zoomLevel - oldZoom;
				panX -= (mouseRelX * zoomDelta) / (oldZoom * mapBounds.w);
				panY -= (mouseRelY * zoomDelta) / (oldZoom * mapBounds.h);

				clampPan();
			}

			return false;
		};

		sketch.mousePressed = () => {
			pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: artBuffer.width, height: artBuffer.height});
			if (closeRect && hitTest(pointer.x, pointer.y, closeRect)) {
				playUiClickSfx();
				sceneNavigate("desktop");
				return;
			}
			const sidebarHit = findSidebarItemAtPointer(pointer, sidebarBounds, neighborhoods, sketch);
			if (sidebarHit >= 0) {
				if (navigateToNeighborhoodAtIndex(sidebarHit)) {
					playUiClickSfx();
					selectedPin = sidebarHit;
				}
				return;
			}
			const overlayHit = findNeighborhoodOverlayAtMouse();
			if (overlayHit) {
				if (navigateToNeighborhoodByKey(overlayHit.neighborhoodKey)) playUiClickSfx();
				return;
			}
			const pinIndex = findPinAtMouse();
			if (pinIndex >= 0) {
				if (navigateToNeighborhoodAtIndex(pinIndex)) {
					playUiClickSfx();
					selectedPin = pinIndex;
				}
			}
		};

		sketch.mouseReleased = () => {};

		// Use native pointermove with movementX/Y — works in both normal and pointer-lock mode.
		function onPointerMove(e) {
			if (e.buttons === 0 || zoomLevel <= 1.01) return;
			const dx = e.movementX / (mapBounds.w * zoomLevel);
			const dy = e.movementY / (mapBounds.h * zoomLevel);
			panX += dx;
			panY += dy;
			clampPan();
		}

		function clampPan() {
			if (zoomLevel <= MIN_ZOOM) {
				panX = 0;
				panY = 0;
				return;
			}
			const maxPan = (zoomLevel - 1) * 0.5;
			panX = Math.max(-maxPan, Math.min(maxPan, panX));
			panY = Math.max(-maxPan, Math.min(maxPan, panY));
		}

		function handleKeyInput(key) {
			if (neighborhoods.length === 0) {
				if (key === sketch.ESCAPE) {
					if (canvasCursor?.isLocked()) return false;
					sceneNavigate("desktop");
				}
				return false;
			}
			if (key === sketch.UP_ARROW || key === sketch.LEFT_ARROW) {
				const nextIndex = findNextEnabledPin(selectedPin, -1);
				if (nextIndex >= 0) selectedPin = nextIndex;
			} else if (key === sketch.DOWN_ARROW || key === sketch.RIGHT_ARROW) {
				const nextIndex = findNextEnabledPin(selectedPin, 1);
				if (nextIndex >= 0) selectedPin = nextIndex;
			} else if (key === sketch.ENTER || key === sketch.RETURN) {
				navigateToNeighborhoodAtIndex(selectedPin);
			} else if (key === sketch.ESCAPE) {
				if (canvasCursor?.isLocked()) return false;
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

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
			artBuffer.pixelDensity(1);
		};

		if (typeof sketch.registerMethod === "function") {
			sketch.registerMethod("remove", () => {
				canvasCursor?.destroy();
				_panCanvasEl?.removeEventListener("pointermove", onPointerMove);
			});
		}

		function findPinAtMouse() {
			if (!mapBounds.w || !mapBounds.h) return -1;
			const hitRadius = Math.max(14, artBuffer.width * 0.02);
			for (let i = 0; i < neighborhoods.length; i++) {
				if (hasNeighborhoodOverlayAtIndex(i)) continue;
				if (!isNeighborhoodIndexEnabled(i)) continue;
				const hood = neighborhoods[i];
				const px = zoomedMapBounds.x + (hood.position.x / 100) * zoomedMapBounds.w;
				const py = zoomedMapBounds.y + (hood.position.y / 100) * zoomedMapBounds.h;
				const dx = pointer.x - px;
				const dy = pointer.y - py;
				if (dx * dx + dy * dy <= hitRadius * hitRadius) return i;
			}
			return -1;
		}

		function findNeighborhoodOverlayAtMouse() {
			if (!mapBounds.w || !mapBounds.h || !Array.isArray(neighborhoodOverlays) || neighborhoodOverlays.length === 0) {
				return null;
			}
			const pointHitRadius = Math.max(11, artBuffer.width * 0.012);
			for (let i = 0; i < neighborhoodOverlays.length; i++) {
				const overlay = neighborhoodOverlays[i];
				if (!overlay?.anchor) continue;
				if (!isNeighborhoodKeyEnabled(overlay.neighborhoodKey)) continue;
				const anchor = toScreenPoint(overlay.anchor, zoomedMapBounds, cityGeoBounds);
				const dx = pointer.x - anchor.x;
				const dy = pointer.y - anchor.y;
				if (dx * dx + dy * dy <= pointHitRadius * pointHitRadius) return overlay;
			}
			for (let i = 0; i < neighborhoodOverlays.length; i++) {
				const overlay = neighborhoodOverlays[i];
				if (!isNeighborhoodKeyEnabled(overlay.neighborhoodKey)) continue;
				for (let j = 0; j < overlay.rings.length; j++) {
					const screenRing = toScreenRing(overlay.rings[j], zoomedMapBounds, cityGeoBounds);
					if (screenRing.length < 3) continue;
					if (pointInPolygon(pointer.x, pointer.y, screenRing)) return overlay;
				}
			}
			return null;
		}

		function hasNeighborhoodOverlayAtIndex(index) {
			const hood = neighborhoods[index];
			const key = getNeighborhoodKey(hood);
			if (!key) return false;
			return neighborhoodOverlays.some((o) => o.neighborhoodKey === key);
		}
	};
}

// ── Pin renderer ──────────────────────────────────────────────────────────────

function drawPin(buf, x, y, name, hovered, p, options = {}) {
	const w = buf.width;
	const dotR = w * 0.008;
	const labelSz = w * 0.013;
	const disabled = options.disabled === true;
	const showLabel = options.showLabel === true;

	const dotColor = disabled ? [176, 116, 116] : hovered ? THEME.GREEN_PRIMARY : THEME.GREEN_MID;

	// Outer glow ring
	buf.noFill();
	buf.stroke(...dotColor, hovered ? 200 : 130);
	buf.strokeWeight(1);
	buf.circle(x, y, dotR * 3.5);

	// Dot
	buf.noStroke();
	buf.fill(...dotColor, hovered ? 255 : 230);
	buf.circle(x, y, dotR * 2);

	// Label
	buf.textAlign(p.CENTER, p.CENTER);
	applyThemeCanvasFont(buf, labelSz, p);
	buf.noStroke();
	if (disabled) {
		applyThemeCanvasFont(buf, Math.max(9, labelSz * 0.72), p);
		buf.fill(228, 146, 146, 230);
		if (showLabel) buf.text("ACCÈS BLOQUÉ", x, y + dotR * 3.7);
	} else if (showLabel) {
		buf.fill(255, 255, 255, 255);
		buf.text(name, x, y + dotR * 3.5);
	}

	buf.noStroke();
}

// ── Map placeholder grid ──────────────────────────────────────────────────────

// ── Map background (panel + grid) — drawn outside zoom transform ─────────────

function drawMapBackground(buf, x, y, w, h) {
	buf.fill(...THEME.BG, 200);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(12);
	const radius = Math.max(10, Math.min(30, Math.min(w, h) * 0.22));
	buf.rect(x, y, w, h, radius);
	buf.stroke(...THEME.GREEN_PRIMARY, 45);
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
	buf.noStroke();
}

// ── Map frame (border + status text) — drawn outside zoom transform ───────────

function drawMapFrame(buf, x, y, w, h, mapOutlineState, zoomLevel, p) {
	buf.noFill();
	buf.stroke(...THEME.GREEN_MID, 180);
	buf.strokeWeight(2);
	buf.rect(x, y, w, h, 22);

	const labelSz = Math.max(10, buf.width * 0.01);
	applyThemeCanvasFont(buf, labelSz, p);
	buf.noStroke();
	buf.fill(...THEME.GREEN_SUBTLE, 220);

	// Top-right: outline status
	buf.textAlign(p.RIGHT, p.TOP);
	const status = mapOutlineState === "loading" ? "Contour QC : chargement..." : "Contour QC : actif";
	buf.text(status, x + w - w * 0.02, y + h * 0.02);

	// Bottom-right: zoom indicator
	const zoomPercent = Math.round(zoomLevel * 100);
	const padX = w * 0.025;
	const padY = h * 0.03;
	buf.textAlign(p.RIGHT, p.BOTTOM);
	buf.fill(...THEME.GREEN_MID, zoomLevel > 1.01 ? 255 : 160);
	buf.text(`ZOOM  ${zoomPercent}%`, x + w - padX, y + h - padY);

	buf.noStroke();
}

function drawMapOutline(buf, x, y, w, h, mapOutline, geoBounds) {
	const rings = Array.isArray(mapOutline) && mapOutline.length > 0 ? mapOutline : FALLBACK_QUEBEC_OUTLINE;
	const inner = getInnerMapRect({x, y, w, h}, geoBounds);

	for (let i = 0; i < rings.length; i++) {
		const ring = rings[i];
		if (!Array.isArray(ring) || ring.length < 2) continue;
		buf.noFill();
		buf.stroke(...THEME.GREEN_PRIMARY, 160);
		buf.strokeWeight(Math.max(1.2, buf.width * 0.0018));
		buf.beginShape();
		for (let j = 0; j < ring.length; j++) {
			const point = ring[j];
			const px = inner.x + point.x * inner.drawW + inner.offsetX;
			const py = inner.y + (1 - point.y) * inner.drawH + inner.offsetY;
			buf.vertex(px, py);
		}
		buf.endShape(buf.CLOSE);
	}
}

function drawNeighborhoodOverlays(buf, mapRect, overlays, hoveredNeighborhoodKey, selectedNeighborhoodKey, geoBounds, p, neighborhoods = []) {
	if (!Array.isArray(overlays) || overlays.length === 0) return;
	const getNeighborhoodKey = (hood) => String(hood?.slug ?? hood?.id ?? hood?.name ?? "").trim();
	for (let i = 0; i < overlays.length; i++) {
		const overlay = overlays[i];
		const neighborhood = neighborhoods.find((hood) => getNeighborhoodKey(hood) === overlay.neighborhoodKey);
		const isEnabled = neighborhood?.viewEnabled !== false;
		const isHovered = hoveredNeighborhoodKey != null && hoveredNeighborhoodKey === overlay.neighborhoodKey;
		const isSelected = isEnabled && overlay.neighborhoodKey === selectedNeighborhoodKey;
		const isActive = isHovered || isSelected;
		for (let j = 0; j < overlay.rings.length; j++) {
			const ring = overlay.rings[j];
			if (!Array.isArray(ring) || ring.length < 3) continue;
			buf.fill(...(isEnabled ? THEME.GREEN_PRIMARY : [96, 44, 44]), isActive ? 120 : 65);
			buf.stroke(...(isEnabled ? THEME.GREEN_MID : [196, 120, 120]), isActive ? 220 : 160);
			buf.strokeWeight(isActive ? 1.8 : 1.1);
			buf.beginShape();
			for (let k = 0; k < ring.length; k++) {
				const point = toScreenPoint(ring[k], mapRect, geoBounds);
				buf.vertex(point.x, point.y);
			}
			buf.endShape(buf.CLOSE);
		}
		drawOverlayAnchor(buf, mapRect, overlay, isHovered, isSelected, geoBounds, p, {disabled: !isEnabled});
	}
	buf.noStroke();
}

function drawOverlayAnchor(buf, mapRect, overlay, isHovered, isSelected, geoBounds, p, options = {}) {
	if (!overlay?.anchor) return;
	const center = toScreenPoint(overlay.anchor, mapRect, geoBounds);
	const dotR = Math.max(4, buf.width * 0.00256);
	const labelSz = Math.max(10, buf.width * 0.0115);
	const isActive = isHovered || isSelected;
	const disabled = options.disabled === true;

	buf.noFill();
	buf.stroke(...(disabled ? [176, 116, 116] : THEME.GREEN_PRIMARY), isActive ? 220 : 150);
	buf.strokeWeight(1);
	buf.circle(center.x, center.y, dotR * 4);

	buf.noStroke();
	buf.fill(...(disabled ? [176, 116, 116] : THEME.GREEN_PRIMARY), isActive ? 255 : 230);
	buf.circle(center.x, center.y, dotR * 2);

	applyThemeCanvasFont(buf, labelSz, p);
	buf.textAlign(p.CENTER, p.BOTTOM);
	if (disabled) {
		applyThemeCanvasFont(buf, Math.max(9, labelSz * 0.72), p);
		buf.textAlign(p.CENTER, p.BOTTOM);
		buf.fill(228, 146, 146, 230);
		if (isHovered) buf.text("ACCÈS BLOQUÉ", center.x, center.y - dotR * 2.1);
	} else if (isHovered) {
		buf.fill(255, 255, 255, 255);
		buf.text(overlay.name, center.x, center.y - dotR * 2.1);
	}
}

function drawNeighborhoodSidebar(buf, sidebarRect, neighborhoods, selectedIndex, hoveredIndex, p) {
	const {x, y, w, h} = sidebarRect;
	buf.fill(...THEME.BG, 210);
	buf.stroke(...THEME.GREEN_PRIMARY, 50);
	buf.strokeWeight(2);
	buf.rect(x, y, w, h, 16);

	const padX = w * 0.08;
	const padY = h * 0.045;
	const titleSize = Math.max(11, buf.width * 0.0105);
	applyThemeCanvasFont(buf, titleSize, p);
	buf.noStroke();
	buf.fill(255, 255, 255, 255);
	buf.textAlign(p.LEFT, p.TOP);
	buf.text("Quartiers", x + padX, y + padY * 0.55);

	const contentTop = y + padY + titleSize * 1.25;
	const contentBottom = y + h - padY;
	const visibleRows = Math.max(1, neighborhoods.length);
	const rowGap = Math.max(4, h * 0.008);
	const rowH = Math.max(26, (contentBottom - contentTop - rowGap * (visibleRows - 1)) / visibleRows);

	for (let i = 0; i < neighborhoods.length; i++) {
		const itemY = contentTop + i * (rowH + rowGap);
		const itemW = w - padX * 2;
		const enabled = neighborhoods[i]?.viewEnabled !== false;
		const isHovered = i === hoveredIndex;
		const isSelected = i === selectedIndex;

		buf.stroke(...(enabled ? THEME.GREEN_PRIMARY : [120, 68, 68]), isHovered ? 190 : 95);
		buf.strokeWeight(isSelected ? 2 : 2);
		buf.fill(...(enabled ? THEME.BG : [40, 18, 18]), isHovered || isSelected ? 185 : 130);
		buf.rect(x + padX, itemY, itemW, rowH, 7);

		const labelSize = Math.max(16, buf.width * 0.0098);
		applyThemeCanvasFont(buf, labelSize, p);
		buf.noStroke();
		buf.fill(...(enabled ? THEME.GREEN_MID : [255, 255, 255]), 255);
		buf.textAlign(p.LEFT, p.CENTER);
		buf.text(neighborhoods[i]?.name ?? `Quartier ${i + 1}`, x + padX + itemW * 0.06, itemY + rowH * 0.52);
	}
}

function findSidebarItemAtPointer(pointer, sidebarRect, neighborhoods, p) {
	if (!pointer || !sidebarRect || neighborhoods.length === 0) return -1;
	if (pointer.x < sidebarRect.x || pointer.x > sidebarRect.x + sidebarRect.w) return -1;
	if (pointer.y < sidebarRect.y || pointer.y > sidebarRect.y + sidebarRect.h) return -1;

	const {x, y, w, h} = sidebarRect;
	const padX = w * 0.08;
	const padY = h * 0.045;
	const titleSize = Math.max(11, p.width * 0.0105);
	const contentTop = y + padY + titleSize * 1.25;
	const contentBottom = y + h - padY;
	const visibleRows = Math.max(1, neighborhoods.length);
	const rowGap = Math.max(4, h * 0.008);
	const rowH = Math.max(26, (contentBottom - contentTop - rowGap * (visibleRows - 1)) / visibleRows);

	for (let i = 0; i < neighborhoods.length; i++) {
		const itemY = contentTop + i * (rowH + rowGap);
		const itemW = w - padX * 2;
		if (hitTest(pointer.x, pointer.y, {x: x + padX, y: itemY, w: itemW, h: rowH})) return i;
	}
	return -1;
}

function toScreenPoint(point, mapRect, geoBounds) {
	const inner = getInnerMapRect(mapRect, geoBounds);
	return {
		x: inner.x + point.x * inner.drawW + inner.offsetX,
		y: inner.y + (1 - point.y) * inner.drawH + inner.offsetY,
	};
}

function toScreenRing(ring, mapRect, geoBounds) {
	const points = [];
	for (let i = 0; i < ring.length; i++) {
		points.push(toScreenPoint(ring[i], mapRect, geoBounds));
	}
	return points;
}

function getInnerMapRect(mapRect, geoBounds) {
	const pad = Math.min(mapRect.w, mapRect.h) * 0.08;
	const innerW = Math.max(1, mapRect.w - pad * 2);
	const innerH = Math.max(1, mapRect.h - pad * 2);
	const targetAspect = getGeoAspectRatio(geoBounds);
	const frameAspect = innerW / innerH;
	let drawW = innerW;
	let drawH = innerH;
	if (targetAspect > frameAspect) {
		drawH = innerW / targetAspect;
	} else {
		drawW = innerH * targetAspect;
	}
	return {
		x: mapRect.x + pad,
		y: mapRect.y + pad,
		w: innerW,
		h: innerH,
		drawW,
		drawH,
		offsetX: (innerW - drawW) * 0.5,
		offsetY: (innerH - drawH) * 0.5,
	};
}

function getGeoAspectRatio(geoBounds) {
	if (!geoBounds) return 1.35;
	const lonSpan = Math.max(1e-9, geoBounds.maxLon - geoBounds.minLon);
	const latSpan = Math.max(1e-9, geoBounds.maxLat - geoBounds.minLat);
	const midLatRad = ((geoBounds.minLat + geoBounds.maxLat) * 0.5 * Math.PI) / 180;
	const correctedLonSpan = lonSpan * Math.cos(midLatRad);
	return Math.max(0.2, Math.min(6, correctedLonSpan / latSpan));
}

function pointInPolygon(px, py, polygon) {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;
		const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

const FALLBACK_QUEBEC_OUTLINE = [
	[
		{x: 0.05, y: 0.34},
		{x: 0.13, y: 0.52},
		{x: 0.22, y: 0.58},
		{x: 0.33, y: 0.64},
		{x: 0.47, y: 0.71},
		{x: 0.58, y: 0.66},
		{x: 0.67, y: 0.58},
		{x: 0.82, y: 0.55},
		{x: 0.93, y: 0.43},
		{x: 0.89, y: 0.32},
		{x: 0.78, y: 0.26},
		{x: 0.63, y: 0.2},
		{x: 0.49, y: 0.16},
		{x: 0.31, y: 0.19},
		{x: 0.18, y: 0.24},
	],
];

function drawDesktopBackground(buf, w, h) {
	buf.background(...THEME.BG);
	buf.noStroke();
	buf.fill(...THEME.GREEN_PRIMARY, 22);
	const cols = 38;
	const rows = 24;
	const dotSize = Math.max(1.5, Math.min(w / cols, h / rows) * 0.14);
	for (let c = 0; c <= cols; c++) {
		for (let r = 0; r <= rows; r++) {
			buf.ellipse((c / cols) * w, (r / rows) * h, dotSize, dotSize);
		}
	}
}

function drawWindowTopBar(buf, w, h, closeHovered, p) {
	const barH = h * 0.07;
	const ctx = buf.drawingContext;
	const grad = ctx.createLinearGradient(0, 0, 0, barH);
	grad.addColorStop(0, "rgba(95, 48, 28, 0.97)");
	grad.addColorStop(0.45, "rgba(52, 28, 16, 0.97)");
	grad.addColorStop(1, "rgba(16, 9, 5, 0.98)");
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, w, barH);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(1);
	buf.line(0, 0, w, 0);
	buf.stroke(...THEME.GREEN_MID, 150);
	buf.strokeWeight(2);
	buf.line(0, barH, w, barH);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(1);
	buf.line(0, barH - 3, w, barH - 3);
	buf.noStroke();

	const btnSize = barH * 0.58;
	const btnX = w * 0.022;
	const btnY = (barH - btnSize) * 0.5;
	buf.stroke(...THEME.GREEN_MID, closeHovered ? 240 : 180);
	buf.strokeWeight(2);
	buf.fill(...THEME.GREEN_PRIMARY, closeHovered ? 120 : 70);
	buf.rect(btnX, btnY, btnSize, btnSize, 4);
	buf.noStroke();
	applyThemeCanvasFont(buf, Math.max(11, w * 0.013), p);
	buf.fill(...THEME.GREEN_SUBTLE, closeHovered ? 255 : 240);
	buf.textAlign(p.CENTER, p.CENTER);
	buf.text("X", btnX + btnSize * 0.5, btnY + btnSize * 0.52);

	applyThemeCanvasFont(buf, Math.max(12, w * 0.014), p);
	buf.fill(...THEME.GREEN_SUBTLE, 240);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text("Retour au menu principal", btnX + btnSize + w * 0.02, barH * 0.5);

	return {
		height: barH,
		closeRect: {x: btnX, y: btnY, w: btnSize, h: btnSize},
	};
}

function drawBottomStatusBar(buf, w, h, p, zoomLevel = 1, panX = 0, panY = 0) {
	const barH = h * 0.072;
	const barY = h - barH;
	const ctx = buf.drawingContext;
	const grad = ctx.createLinearGradient(0, barY, 0, barY + barH);
	grad.addColorStop(0, "rgba(16, 9, 5, 0.98)");
	grad.addColorStop(0.55, "rgba(52, 28, 16, 0.97)");
	grad.addColorStop(1, "rgba(95, 48, 28, 0.97)");
	ctx.fillStyle = grad;
	ctx.fillRect(0, barY, w, barH);
	buf.stroke(...THEME.GREEN_MID, 150);
	buf.strokeWeight(2);
	buf.line(0, barY, w, barY);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(1);
	buf.line(0, barY + 3, w, barY + 3);
	buf.noStroke();

	const navSz = Math.max(11, w * 0.012);
	applyThemeCanvasFont(buf, navSz, p);
	buf.fill(...THEME.GREEN_MID, 245);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text("Cartographie active", w * 0.03, barY + barH * 0.5);

	// Center: 2D View
	buf.textAlign(p.CENTER, p.CENTER);
	buf.text("2D View", w * 0.5, barY + barH * 0.5);

	return barH;
}

// ── Pan limit indicators ──────────────────────────────────────────────────────

function drawPanLimitIndicators(buf, mapX, mapY, mapW, mapH, panX, panY, zoomLevel, p) {
	const indicatorSize = Math.max(12, Math.min(mapW, mapH) * 0.03);
	const indicatorColor = THEME.GREEN_MID;
	const maxPan = (zoomLevel - 1) * 0.5;

	// Determine which edges we're near
	const atLeft = Math.abs(panX + maxPan) < 0.05;
	const atRight = Math.abs(panX - maxPan) < 0.05;
	const atTop = Math.abs(panY + maxPan) < 0.05;
	const atBottom = Math.abs(panY - maxPan) < 0.05;

	// Draw edge indicators (only for edges we're at or near)
	const padding = indicatorSize * 0.8;
	const arrowAlpha = 200;

	// Left edge indicator
	if (atLeft) {
		buf.fill(...indicatorColor, arrowAlpha);
		buf.noStroke();
		drawArrow(buf, mapX + padding, mapY + mapH * 0.5, -indicatorSize * 0.5, 0);
	}

	// Right edge indicator
	if (atRight) {
		buf.fill(...indicatorColor, arrowAlpha);
		buf.noStroke();
		drawArrow(buf, mapX + mapW - padding, mapY + mapH * 0.5, indicatorSize * 0.5, 0);
	}

	// Top edge indicator
	if (atTop) {
		buf.fill(...indicatorColor, arrowAlpha);
		buf.noStroke();
		drawArrow(buf, mapX + mapW * 0.5, mapY + padding, 0, -indicatorSize * 0.5);
	}

	// Bottom edge indicator
	if (atBottom) {
		buf.fill(...indicatorColor, arrowAlpha);
		buf.noStroke();
		drawArrow(buf, mapX + mapW * 0.5, mapY + mapH - padding, 0, indicatorSize * 0.5);
	}
}

function drawArrow(buf, x, y, dx, dy) {
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len === 0) return;

	const nx = dx / len;
	const ny = dy / len;
	const px = -ny;
	const py = nx;

	const tipLen = len * 0.6;
	const tipWidth = len * 0.4;

	buf.beginShape();
	buf.vertex(x + dx, y + dy);
	buf.vertex(x + dx - tipLen * nx - tipWidth * px, y + dy - tipLen * ny - tipWidth * py);
	buf.vertex(x + dx - tipLen * nx + tipWidth * px, y + dy - tipLen * ny + tipWidth * py);
	buf.endShape(buf.CLOSE);
}
