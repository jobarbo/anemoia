/**
 * Fetches Quebec City + neighbourhood boundary polygons from Nominatim once
 * and writes pre-computed, normalised data to src/data/map-cache.json.
 *
 * Run: node tools/generate-map-cache.mjs
 *
 * The output file is committed to the repo so the app never needs to call
 * the Nominatim API at runtime.
 */

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const NEIGHBORHOODS_PATH = path.join(ROOT, "src/data/neighborhoods/index.json");
const OUTPUT_PATH = path.join(ROOT, "src/data/map-cache.json");

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "anemoia-map-cache-generator/1.0";
const ACCEPT_LANG = "fr-CA,fr,en";
const THROTTLE_MS = 1100;

// ── Fallback outline (same as overworld-map-data.js) ─────────────────────────

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

// ── Throttle ──────────────────────────────────────────────────────────────────

let lastRequestAt = 0;

async function throttle() {
	const now = Date.now();
	const wait = Math.max(0, THROTTLE_MS - (now - lastRequestAt));
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	lastRequestAt = Date.now();
}

// ── Nominatim ─────────────────────────────────────────────────────────────────

async function nominatimSearch({q, featuretype = null, limit = 8}) {
	const url = new URL(NOMINATIM_BASE);
	url.searchParams.set("format", "jsonv2");
	url.searchParams.set("polygon_geojson", "1");
	url.searchParams.set("limit", String(limit));
	url.searchParams.set("q", q);
	if (featuretype) url.searchParams.set("featuretype", featuretype);

	await throttle();
	process.stdout.write(`    GET ${url.toString().slice(0, 100)}...\n`);

	const res = await fetch(url.toString(), {
		headers: {
			"Accept-Language": ACCEPT_LANG,
			"User-Agent": USER_AGENT,
		},
	});

	if (!res.ok) {
		console.warn(`    HTTP ${res.status}`);
		return null;
	}
	return res.json();
}

async function fetchCityOutline() {
	console.log("\n[city] Fetching Quebec City outline...");
	const results = await nominatimSearch({q: "La Cité-Limoilou, Quebec, Canada", limit: 1});
	if (!Array.isArray(results) || results.length === 0) return {geojson: null, bounds: null};
	const geojson = results[0]?.geojson;
	if (!geojson) return {geojson: null, bounds: null};
	const bounds = computeGeoBounds(extractRawRings(geojson));
	return {geojson, bounds};
}

function firstPolygon(results) {
	if (!Array.isArray(results)) return null;
	for (const r of results) {
		const g = r?.geojson;
		if (g?.type === "Polygon" || g?.type === "MultiPolygon") return g;
	}
	return null;
}

async function fetchNeighborhoodPolygon(hood) {
	const candidates = neighborhoodQueryCandidates(hood);
	for (const candidate of candidates) {
		const q = buildNeighborhoodSearchQuery(candidate);
		const withSuburb = await nominatimSearch({q, featuretype: "suburb", limit: 8});
		const fromSuburb = firstPolygon(withSuburb);
		if (fromSuburb) return fromSuburb;
		const unfiltered = await nominatimSearch({q, limit: 8});
		const fromUnfiltered = firstPolygon(unfiltered);
		if (fromUnfiltered) return fromUnfiltered;
	}
	return null;
}

// ── Pure geometry helpers (copied from overworld-map-data.js) ─────────────────

function getNeighborhoodKey(neighborhood) {
	const slug = String(neighborhood?.slug ?? "").trim();
	if (slug) return slug;
	const id = String(neighborhood?.id ?? "").trim();
	if (id) return id;
	return String(neighborhood?.name ?? "").trim();
}

function neighborhoodQueryCandidates(neighborhood) {
	const apiSearchTerms = Array.isArray(neighborhood?.apiSearchTerms) ? neighborhood.apiSearchTerms : [];
	const baseSlug = String(neighborhood?.slug ?? neighborhood?.id ?? "").trim();
	const candidates = [];
	for (let i = 0; i < apiSearchTerms.length; i++) {
		const term = String(apiSearchTerms[i] ?? "").trim();
		if (term) candidates.push(term);
	}
	if (baseSlug) candidates.push(baseSlug.replace(/[-_]+/g, " "));
	return [...new Set(candidates)];
}

function buildNeighborhoodSearchQuery(candidate) {
	const value = String(candidate ?? "").trim();
	if (!value) return "Quebec City, Quebec, Canada";
	const lower = value.toLowerCase();
	const looksQualified =
		value.includes(",") ||
		lower.includes("quebec") ||
		lower.includes("québec") ||
		lower.includes("canada") ||
		lower.includes("levis") ||
		lower.includes("lévis");
	if (looksQualified) return value;
	return `${value}, Quebec City, Quebec, Canada`;
}

function extractRawRings(geojson) {
	const rawRings = [];
	if (geojson?.type === "Polygon") {
		for (let i = 0; i < geojson.coordinates.length; i++) rawRings.push(geojson.coordinates[i]);
	} else if (geojson?.type === "MultiPolygon") {
		for (let i = 0; i < geojson.coordinates.length; i++) {
			const polygon = geojson.coordinates[i];
			for (let j = 0; j < polygon.length; j++) rawRings.push(polygon[j]);
		}
	}
	return rawRings;
}

function computeGeoBounds(rawRings) {
	if (!Array.isArray(rawRings) || rawRings.length === 0) return null;
	let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
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
	if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) return null;
	return {minLon, maxLon, minLat, maxLat};
}

function mergeGeoBounds(a, b) {
	return {
		minLon: Math.min(a.minLon, b.minLon),
		maxLon: Math.max(a.maxLon, b.maxLon),
		minLat: Math.min(a.minLat, b.minLat),
		maxLat: Math.max(a.maxLat, b.maxLat),
	};
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
			reduced.push({x: (lon - bounds.minLon) / lonSpan, y: (lat - bounds.minLat) / latSpan});
		}
		if (reduced.length >= 3) normalized.push(reduced);
	}
	return normalized;
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
	let cx = 0, cy = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const cross = ring[j].x * ring[i].y - ring[i].x * ring[j].y;
		cx += (ring[j].x + ring[i].x) * cross;
		cy += (ring[j].y + ring[i].y) * cross;
	}
	return {x: cx / (6 * area), y: cy / (6 * area)};
}

function averagePoint(ring) {
	let x = 0, y = 0;
	for (let i = 0; i < ring.length; i++) {
		x += ring[i].x;
		y += ring[i].y;
	}
	return {x: x / ring.length, y: y / ring.length};
}

function computeOverlayAnchor(rings) {
	if (!Array.isArray(rings) || rings.length === 0) return null;
	let largestRing = null, largestArea = 0;
	for (let i = 0; i < rings.length; i++) {
		const area = Math.abs(polygonSignedArea(rings[i]));
		if (area > largestArea) {
			largestArea = area;
			largestRing = rings[i];
		}
	}
	if (!largestRing || largestRing.length < 3) return null;
	return polygonCentroid(largestRing) ?? averagePoint(largestRing);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	const neighborhoods = JSON.parse(fs.readFileSync(NEIGHBORHOODS_PATH, "utf8"));
	console.log(`Loaded ${neighborhoods.length} neighborhoods`);

	const city = await fetchCityOutline();
	if (!city.geojson || !city.bounds) {
		console.error("ERROR: Could not fetch city outline. Aborting.");
		process.exit(1);
	}
	console.log("  City outline OK.");

	console.log(`\nFetching ${neighborhoods.length} neighborhood polygons...`);
	const hoodRaw = [];
	for (let i = 0; i < neighborhoods.length; i++) {
		const hood = neighborhoods[i];
		process.stdout.write(`  [${i + 1}/${neighborhoods.length}] ${hood.id} ... `);
		const geojson = await fetchNeighborhoodPolygon(hood);
		if (geojson) {
			process.stdout.write(`OK (${geojson.type})\n`);
		} else {
			process.stdout.write(`SKIP (no polygon found)\n`);
		}
		hoodRaw.push({hood, geojson});
	}

	let unionBounds = {...city.bounds};
	for (const {geojson} of hoodRaw) {
		if (!geojson) continue;
		const b = computeGeoBounds(extractRawRings(geojson));
		if (b) unionBounds = mergeGeoBounds(unionBounds, b);
	}

	const mapOutline = normalizeGeoJsonRings(city.geojson, unionBounds);
	const overlays = [];
	for (const {hood, geojson} of hoodRaw) {
		if (!geojson) continue;
		const rings = normalizeGeoJsonRings(geojson, unionBounds);
		if (rings.length === 0) continue;
		overlays.push({
			name: hood.name,
			slug: hood.slug,
			neighborhoodKey: getNeighborhoodKey(hood),
			rings,
			anchor: computeOverlayAnchor(rings),
		});
	}

	const output = {
		generatedAt: new Date().toISOString(),
		mapOutline: mapOutline.length > 0 ? mapOutline : FALLBACK_QUEBEC_OUTLINE,
		unionBounds,
		overlays,
	};

	fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
	const kb = Math.round(fs.statSync(OUTPUT_PATH).size / 1024);
	console.log(`\nWrote ${OUTPUT_PATH}`);
	console.log(`  Size: ${kb} kB | Overlays: ${overlays.length}/${neighborhoods.length}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
