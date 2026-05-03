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
import {createCanvasCursor, drawCanvasCursor} from "../../lib/input/canvas-cursor.js";
import {getOverworldMapData} from "../../lib/data/overworld-map-data.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {neighborhoods = []} = raw ? JSON.parse(raw) : {};

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
		let mapOutline = null;
		let mapOutlineState = "loading";
		let cityGeoBounds = null;
		let neighborhoodOverlays = [];
		let hoveredOverlaySlug = null;

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

			// Fallback keyboard handling when p5 key events are swallowed by focus changes.
			window.addEventListener("keydown", onWindowKeyDown);
			if (typeof sketch.registerMethod === "function") {
				sketch.registerMethod("remove", () => {
					window.removeEventListener("keydown", onWindowKeyDown);
				});
			}

			void loadMapData(neighborhoods).then((data) => {
				mapOutline = data.mapOutline;
				cityGeoBounds = data.unionBounds;
				neighborhoodOverlays = data.overlays;
				mapOutlineState = data.mapOutline.length > 0 ? "ready" : "fallback";
			});
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
			const hoveredOverlay = findNeighborhoodOverlayAtMouse();
			hoveredOverlaySlug = hoveredOverlay?.slug ?? null;
			drawMapPlaceholder(artBuffer, mapX, mapY, mapW, mapH, mapOutline, mapOutlineState, neighborhoodOverlays, hoveredOverlaySlug, selectedPin, cityGeoBounds, sketch);

			// ── Title ─────────────────────────────────────────────────────────────
			const titleSz = w * 0.028;
			drawTitleAberration(artBuffer, "Les villes verticales", w / 2, topBarH + titleH * 0.45, titleSz, 255, sketch);

			// ── Neighborhood pins (only when no polygon overlay — avoids duplicate dot + label) ──
			const hoveredPin = findPinAtMouse();
			for (let i = 0; i < neighborhoods.length; i++) {
				if (hasNeighborhoodOverlayAtIndex(i)) continue;
				const hood = neighborhoods[i];
				const px = mapX + (hood.position.x / 100) * mapW;
				const py = mapY + (hood.position.y / 100) * mapH;
				drawPin(artBuffer, px, py, hood.name, selectedPin === i || hoveredPin === i, sketch);
			}

			// Key hint
			const hintSz = w * 0.011;
			artBuffer.textAlign(sketch.RIGHT, sketch.CENTER);
			applyThemeCanvasFont(artBuffer, hintSz, sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 210);
			artBuffer.text("↑↓ CHOISIR   ENTRÉE CONFIRMER   ESC FERMER", w - w * 0.04, h - bottomBarH * 0.5);

			// Blit artBuffer onto output canvas
			drawCanvasCursor(artBuffer, pointer, {hovered: closeHovered || hoveredPin >= 0 || hoveredOverlaySlug != null});
			sketch.clear();
			sketch.image(artBuffer, 0, 0);
		};

		sketch.keyPressed = () => {
			return handleKeyInput(sketch.keyCode);
		};

		function handleKeyInput(key) {
			if (neighborhoods.length === 0) {
				if (key === sketch.ESCAPE) {
					if (canvasCursor?.isLocked()) return false;
					sceneNavigate("desktop");
				}
				return false;
			}
			if (key === sketch.UP_ARROW || key === sketch.LEFT_ARROW) {
				selectedPin = (selectedPin - 1 + neighborhoods.length) % neighborhoods.length;
			} else if (key === sketch.DOWN_ARROW || key === sketch.RIGHT_ARROW) {
				selectedPin = (selectedPin + 1) % neighborhoods.length;
			} else if (key === sketch.ENTER || key === sketch.RETURN) {
				sceneNavigate("neighborhood", {slug: neighborhoods[selectedPin].slug});
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

		sketch.mousePressed = () => {
			pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: artBuffer.width, height: artBuffer.height});
			if (closeRect && hitTest(pointer.x, pointer.y, closeRect)) {
				sceneNavigate("desktop");
				return;
			}
			const overlayHit = findNeighborhoodOverlayAtMouse();
			if (overlayHit) {
				selectedPin = overlayHit.pinIndex;
				sceneNavigate("neighborhood", {slug: overlayHit.slug});
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
			artBuffer.pixelDensity(1);
		};

		if (typeof sketch.registerMethod === "function") {
			sketch.registerMethod("remove", () => {
				canvasCursor?.destroy();
			});
		}

		function findPinAtMouse() {
			if (!mapBounds.w || !mapBounds.h) return -1;
			const hitRadius = Math.max(14, artBuffer.width * 0.02);
			for (let i = 0; i < neighborhoods.length; i++) {
				if (hasNeighborhoodOverlayAtIndex(i)) continue;
				const hood = neighborhoods[i];
				const px = mapBounds.x + (hood.position.x / 100) * mapBounds.w;
				const py = mapBounds.y + (hood.position.y / 100) * mapBounds.h;
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
				const anchor = toScreenPoint(overlay.anchor, mapBounds, cityGeoBounds);
				const dx = pointer.x - anchor.x;
				const dy = pointer.y - anchor.y;
				if (dx * dx + dy * dy <= pointHitRadius * pointHitRadius) return overlay;
			}
			for (let i = 0; i < neighborhoodOverlays.length; i++) {
				const overlay = neighborhoodOverlays[i];
				for (let j = 0; j < overlay.rings.length; j++) {
					const screenRing = toScreenRing(overlay.rings[j], mapBounds, cityGeoBounds);
					if (screenRing.length < 3) continue;
					if (pointInPolygon(pointer.x, pointer.y, screenRing)) return overlay;
				}
			}
			return null;
		}

		function hasNeighborhoodOverlayAtIndex(index) {
			return neighborhoodOverlays.some((o) => o.pinIndex === index);
		}
	};
}

// ── Pin renderer ──────────────────────────────────────────────────────────────

function drawPin(buf, x, y, name, hovered, p) {
	const w = buf.width;
	const dotR = w * 0.008;
	const labelSz = w * 0.013;

	const dotColor = hovered ? THEME.GREEN_PRIMARY : THEME.GREEN_MID;

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
	buf.fill(255, 255, 255, 255);
	buf.text(name, x, y + dotR * 3.5);

	buf.noStroke();
}

// ── Map placeholder grid ──────────────────────────────────────────────────────

function drawMapPlaceholder(buf, x, y, w, h, mapOutline, mapOutlineState, neighborhoodOverlays, hoveredOverlaySlug, selectedPinIndex, geoBounds, p) {
	// Dark panel
	buf.fill(...THEME.BG, 200);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(12);
	const radius = Math.max(10, Math.min(30, Math.min(w, h) * 0.22));
	buf.rect(x, y, w, h, radius);
	// Grid lines
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

	drawMapOutline(buf, x, y, w, h, mapOutline, geoBounds);
	drawNeighborhoodOverlays(buf, {x, y, w, h}, neighborhoodOverlays, hoveredOverlaySlug, selectedPinIndex, geoBounds, p);

	// Border
	buf.noFill();
	buf.stroke(...THEME.GREEN_MID, 180);
	buf.strokeWeight(2);
	buf.rect(x, y, w, h, 22);

	const status = mapOutlineState === "loading" ? "Contour QC: chargement..." : "Contour QC: actif";
	applyThemeCanvasFont(buf, Math.max(10, buf.width * 0.01), p);
	buf.noStroke();
	buf.fill(...THEME.GREEN_SUBTLE, 220);
	buf.textAlign(p.RIGHT, p.TOP);
	buf.text(status, x + w - w * 0.02, y + h * 0.02);

	buf.noStroke();
}

function drawMapOutline(buf, x, y, w, h, mapOutline, geoBounds) {
	const rings = Array.isArray(mapOutline) && mapOutline.length > 0 ? mapOutline : FALLBACK_QUEBEC_OUTLINE;
	const inner = getInnerMapRect({x, y, w, h}, geoBounds);

	buf.drawingContext.save();
	buf.drawingContext.beginPath();
	buf.drawingContext.rect(x, y, w, h);
	buf.drawingContext.clip();

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

	buf.drawingContext.restore();
}

/**
 * Shared loader now owns fetch policy, request dedupe, and cache persistence.
 */
async function loadMapData(neighborhoods) {
	return getOverworldMapData(neighborhoods);
}

async function fetchFirstNeighborhoodPolygonGeoJson(name) {
	try {
		const candidates = neighborhoodQueryCandidates(name);
		for (let i = 0; i < candidates.length; i++) {
			const geojson = await fetchNeighborhoodPolygonGeoJson(candidates[i]);
			if (geojson) return geojson;
		}
		return null;
	} catch {
		return null;
	}
}

function mergeGeoBounds(a, b) {
	return {
		minLon: Math.min(a.minLon, b.minLon),
		maxLon: Math.max(a.maxLon, b.maxLon),
		minLat: Math.min(a.minLat, b.minLat),
		maxLat: Math.max(a.maxLat, b.maxLat),
	};
}

function neighborhoodQueryCandidates(name) {
	const base = String(name ?? "").trim();
	const candidates = [];
	if (base) candidates.push(base);

	const folded = foldNeighborhoodName(base);
	if (folded.includes("limoilou")) {
		candidates.push("Vieux-Limoilou", "Limoilou");
	}
	if (folded.includes("saint roch") || folded.includes("st roch")) {
		candidates.push("Saint-Roch", "St-Roch");
	}

	// Unique values while preserving order.
	return [...new Set(candidates)];
}

function foldNeighborhoodName(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

async function fetchNeighborhoodPolygonGeoJson(neighborhoodName) {
	const baseUrl = "https://nominatim.openstreetmap.org/search";
	const params = new URLSearchParams({
		format: "jsonv2",
		polygon_geojson: "1",
		limit: "5",
		featuretype: "suburb",
		q: `${neighborhoodName}, Quebec City, Quebec, Canada`,
	});
	console.log(baseUrl, params.toString());
	const res = await fetch(`${baseUrl}?${params.toString()}`, {
		headers: {
			"Accept-Language": "fr-CA,fr,en",
		},
	});
	if (!res.ok) return null;
	const results = await res.json();
	if (!Array.isArray(results) || results.length === 0) return null;
	for (let i = 0; i < results.length; i++) {
		const geojson = results[i]?.geojson;
		if (!geojson) continue;
		if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") return geojson;
	}
	return null;
}

function extractRawRings(geojson) {
	const rawRings = [];
	if (geojson?.type === "Polygon") {
		for (let i = 0; i < geojson.coordinates.length; i++) {
			rawRings.push(geojson.coordinates[i]);
		}
	} else if (geojson?.type === "MultiPolygon") {
		for (let i = 0; i < geojson.coordinates.length; i++) {
			const poly = geojson.coordinates[i];
			for (let j = 0; j < poly.length; j++) {
				rawRings.push(poly[j]);
			}
		}
	}
	return rawRings;
}

function computeGeoBounds(rawRings) {
	if (!Array.isArray(rawRings) || rawRings.length === 0) return null;

	let minLon = Infinity;
	let maxLon = -Infinity;
	let minLat = Infinity;
	let maxLat = -Infinity;
	for (let i = 0; i < rawRings.length; i++) {
		const ring = rawRings[i];
		for (let j = 0; j < ring.length; j++) {
			const [lon, lat] = ring[j];
			if (typeof lon !== "number" || typeof lat !== "number") continue;
			if (lon < minLon) minLon = lon;
			if (lon > maxLon) maxLon = lon;
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
		}
	}
	if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
		return null;
	}
	return {minLon, maxLon, minLat, maxLat};
}

function normalizeGeoJsonRings(geojson, forcedBounds = null) {
	const rawRings = extractRawRings(geojson);
	if (rawRings.length === 0) return [];

	const bounds = forcedBounds ?? computeGeoBounds(rawRings);
	if (!bounds) return [];
	const lonSpan = Math.max(1e-9, bounds.maxLon - bounds.minLon);
	const latSpan = Math.max(1e-9, bounds.maxLat - bounds.minLat);

	const normalized = [];
	for (let i = 0; i < rawRings.length; i++) {
		const ring = rawRings[i];
		if (!Array.isArray(ring) || ring.length < 3) continue;
		const reduced = [];
		for (let j = 0; j < ring.length; j++) {
			const [lon, lat] = ring[j];
			if (typeof lon !== "number" || typeof lat !== "number") continue;
			reduced.push({
				x: (lon - bounds.minLon) / lonSpan,
				y: (lat - bounds.minLat) / latSpan,
			});
		}
		if (reduced.length >= 3) normalized.push(reduced);
	}
	return normalized;
}

function drawNeighborhoodOverlays(buf, mapRect, overlays, hoveredSlug, selectedPinIndex, geoBounds, p) {
	if (!Array.isArray(overlays) || overlays.length === 0) return;
	buf.drawingContext.save();
	buf.drawingContext.beginPath();
	buf.drawingContext.rect(mapRect.x, mapRect.y, mapRect.w, mapRect.h);
	buf.drawingContext.clip();
	for (let i = 0; i < overlays.length; i++) {
		const overlay = overlays[i];
		const isHovered = hoveredSlug === overlay.slug;
		const isSelected = selectedPinIndex === overlay.pinIndex;
		const isActive = isHovered || isSelected;
		for (let j = 0; j < overlay.rings.length; j++) {
			const ring = overlay.rings[j];
			if (!Array.isArray(ring) || ring.length < 3) continue;
			buf.fill(...THEME.GREEN_PRIMARY, isActive ? 120 : 65);
			buf.stroke(...THEME.GREEN_MID, isActive ? 220 : 160);
			buf.strokeWeight(isActive ? 1.8 : 1.1);
			buf.beginShape();
			for (let k = 0; k < ring.length; k++) {
				const point = toScreenPoint(ring[k], mapRect, geoBounds);
				buf.vertex(point.x, point.y);
			}
			buf.endShape(buf.CLOSE);
		}
		drawOverlayAnchor(buf, mapRect, overlay, isHovered, isSelected, geoBounds, p);
	}
	buf.drawingContext.restore();
	buf.noStroke();
}

function drawOverlayAnchor(buf, mapRect, overlay, isHovered, isSelected, geoBounds, p) {
	if (!overlay?.anchor) return;
	const center = toScreenPoint(overlay.anchor, mapRect, geoBounds);
	const dotR = Math.max(4, buf.width * 0.0056);
	const labelSz = Math.max(10, buf.width * 0.0115);
	const isActive = isHovered || isSelected;

	buf.noFill();
	buf.stroke(...THEME.GREEN_PRIMARY, isActive ? 220 : 150);
	buf.strokeWeight(1);
	buf.circle(center.x, center.y, dotR * 4);

	buf.noStroke();
	buf.fill(...THEME.GREEN_PRIMARY, isActive ? 255 : 230);
	buf.circle(center.x, center.y, dotR * 2);

	applyThemeCanvasFont(buf, labelSz, p);
	buf.textAlign(p.CENTER, p.BOTTOM);
	buf.fill(255, 255, 255, 255);
	buf.text(overlay.name, center.x, center.y - dotR * 2.1);
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

function computeOverlayAnchor(rings) {
	if (!Array.isArray(rings) || rings.length === 0) return null;
	let largestRing = null;
	let largestArea = 0;
	for (let i = 0; i < rings.length; i++) {
		const ring = rings[i];
		const area = polygonSignedArea(ring);
		const absArea = Math.abs(area);
		if (absArea > largestArea) {
			largestArea = absArea;
			largestRing = ring;
		}
	}
	if (!largestRing || largestRing.length < 3) return null;
	const centroid = polygonCentroid(largestRing);
	return centroid ?? averagePoint(largestRing);
}

function polygonSignedArea(ring) {
	if (!Array.isArray(ring) || ring.length < 3) return 0;
	let area = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		area += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
	}
	return area * 0.5;
}

function polygonCentroid(ring) {
	const area = polygonSignedArea(ring);
	if (Math.abs(area) < 1e-8) return null;
	let cx = 0;
	let cy = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const cross = ring[j].x * ring[i].y - ring[i].x * ring[j].y;
		cx += (ring[j].x + ring[i].x) * cross;
		cy += (ring[j].y + ring[i].y) * cross;
	}
	return {
		x: cx / (6 * area),
		y: cy / (6 * area),
	};
}

function averagePoint(ring) {
	let x = 0;
	let y = 0;
	for (let i = 0; i < ring.length; i++) {
		x += ring[i].x;
		y += ring[i].y;
	}
	return {
		x: x / ring.length,
		y: y / ring.length,
	};
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

function drawBottomStatusBar(buf, w, h, p) {
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
	buf.textAlign(p.CENTER, p.CENTER);
	buf.text("2D View", w * 0.5, barY + barH * 0.5);
	return barH;
}
