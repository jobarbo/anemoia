import staticMapCache from "../../data/map-cache.json";
import {nominatimAcceptLanguageHeader} from "../i18n/nominatim-lang.js";
import {getLocale} from "./scene-data.js";

const OVERWORLD_MAP_CACHE_KEY = "anemoia.overworldMapData.v2";
const OVERWORLD_MAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

let memoryCache = null;
let inFlightRequest = null;

const MAP_DEBUG_SLUGS = new Set(["st-romuald", "saint-romuald", "st romuald", "saint romuald"]);

function shouldDebugNeighborhood(neighborhood) {
	const slug = String(neighborhood?.slug ?? "")
		.trim()
		.toLowerCase();
	const id = String(neighborhood?.id ?? "")
		.trim()
		.toLowerCase();
	const name = String(neighborhood?.name ?? "")
		.trim()
		.toLowerCase();
	return MAP_DEBUG_SLUGS.has(slug) || MAP_DEBUG_SLUGS.has(id) || name.includes("romuald");
}

function logMapDebug(message, payload) {
	console.log(`[overworld-map-debug] ${message}`, payload);
}

export function getFallbackOverworldMapOutline() {
	return FALLBACK_QUEBEC_OUTLINE;
}

export function prefetchOverworldMapData(neighborhoods) {
	return getOverworldMapData(neighborhoods).catch(() => null);
}

function isValidStaticCache(cache) {
	return Boolean(
		cache &&
		typeof cache.generatedAt === "string" &&
		cache.generatedAt !== null &&
		Array.isArray(cache.mapOutline) && cache.mapOutline.length > 0 &&
		Array.isArray(cache.overlays) &&
		cache.unionBounds !== null,
	);
}

export async function getOverworldMapData(neighborhoods) {
	if (isValidStaticCache(staticMapCache)) {
		return {
			mapOutline: staticMapCache.mapOutline,
			unionBounds: staticMapCache.unionBounds,
			overlays: staticMapCache.overlays,
		};
	}
	const signature = createNeighborhoodSignature(neighborhoods);
	const debugHood = Array.isArray(neighborhoods) ? neighborhoods.find((hood) => shouldDebugNeighborhood(hood)) : null;
	if (Array.isArray(neighborhoods) && neighborhoods.length > 0 && !debugHood) {
		console.warn("[overworld-map-debug] st-romuald was not found in neighborhoods list", {
			slugs: neighborhoods.map((hood) => String(hood?.slug ?? "").trim()).filter(Boolean),
			ids: neighborhoods.map((hood) => String(hood?.id ?? "").trim()).filter(Boolean),
			names: neighborhoods.map((hood) => String(hood?.name ?? "").trim()).filter(Boolean),
		});
	}

	if (memoryCache?.signature === signature && memoryCache.expiresAt > Date.now()) {
		if (debugHood) {
			logMapDebug("Using in-memory cache", {
				signature,
				stRomualdOverlayFound:
					memoryCache.data?.overlays?.some((overlay) =>
						MAP_DEBUG_SLUGS.has(
							String(overlay?.slug ?? "")
								.trim()
								.toLowerCase(),
						),
					) ?? false,
				overlaySlugs: (memoryCache.data?.overlays ?? []).map((overlay) => overlay?.slug),
			});
		}
		return memoryCache.data;
	}

	const persisted = readPersistedCache(signature);
	if (persisted) {
		if (debugHood) {
			logMapDebug("Using persisted cache", {
				signature,
				stRomualdOverlayFound:
					persisted.data?.overlays?.some((overlay) =>
						MAP_DEBUG_SLUGS.has(
							String(overlay?.slug ?? "")
								.trim()
								.toLowerCase(),
						),
					) ?? false,
				overlaySlugs: (persisted.data?.overlays ?? []).map((overlay) => overlay?.slug),
			});
		}
		memoryCache = persisted;
		return persisted.data;
	}

	if (inFlightRequest?.signature === signature) {
		return inFlightRequest.promise;
	}

	const promise = fetchAndCacheOverworldMapData(neighborhoods, signature).finally(() => {
		if (inFlightRequest?.signature === signature) {
			inFlightRequest = null;
		}
	});

	inFlightRequest = {signature, promise};
	return promise;
}

async function fetchAndCacheOverworldMapData(neighborhoods, signature) {
	const city = await loadQuebecOutlineRaw();
	if (!city.geojson || !city.bounds) {
		return {
			mapOutline: FALLBACK_QUEBEC_OUTLINE,
			unionBounds: null,
			overlays: [],
		};
	}

	if (!Array.isArray(neighborhoods) || neighborhoods.length === 0) {
		const outline = normalizeGeoJsonRings(city.geojson, city.bounds);
		const data = {
			mapOutline: outline.length > 0 ? outline : FALLBACK_QUEBEC_OUTLINE,
			unionBounds: city.bounds,
			overlays: [],
		};
		writeCaches(signature, data);
		return data;
	}

	const hoodRaw = [];
	for (let i = 0; i < neighborhoods.length; i++) {
		const hood = neighborhoods[i];
		const geojson = await fetchFirstNeighborhoodPolygonGeoJson(hood);
		if (shouldDebugNeighborhood(hood)) {
			logMapDebug("Neighborhood lookup result", {
				hood,
				geojsonType: geojson?.type ?? null,
				hasGeojson: Boolean(geojson),
			});
		}
		hoodRaw.push({hood, geojson});
	}

	let unionBounds = {...city.bounds};
	for (let i = 0; i < hoodRaw.length; i++) {
		const geojson = hoodRaw[i].geojson;
		if (!geojson) continue;
		const bounds = computeGeoBounds(extractRawRings(geojson));
		if (bounds) unionBounds = mergeGeoBounds(unionBounds, bounds);
	}

	const mapOutline = normalizeGeoJsonRings(city.geojson, unionBounds);
	const overlays = [];
	for (let i = 0; i < hoodRaw.length; i++) {
		const {hood, geojson} = hoodRaw[i];
		if (!geojson) continue;
		const rings = normalizeGeoJsonRings(geojson, unionBounds);
		if (shouldDebugNeighborhood(hood)) {
			logMapDebug("Normalized overlay rings", {
				hood,
				ringCount: rings.length,
				firstRingPointCount: rings[0]?.length ?? 0,
			});
		}
		if (rings.length === 0) continue;
		overlays.push({
			name: hood.name,
			slug: hood.slug,
			neighborhoodKey: getNeighborhoodKey(hood),
			rings,
			anchor: computeOverlayAnchor(rings),
		});
	}

	const data = {
		mapOutline: mapOutline.length > 0 ? mapOutline : FALLBACK_QUEBEC_OUTLINE,
		unionBounds,
		overlays,
	};
	writeCaches(signature, data);
	return data;
}

function writeCaches(signature, data) {
	const record = {
		signature,
		expiresAt: Date.now() + OVERWORLD_MAP_CACHE_TTL_MS,
		data,
	};
	memoryCache = record;
	writePersistedCache(record);
}

function readPersistedCache(signature) {
	try {
		const raw = localStorage.getItem(OVERWORLD_MAP_CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		if (parsed.signature !== signature) return null;
		if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
			localStorage.removeItem(OVERWORLD_MAP_CACHE_KEY);
			return null;
		}
		if (!isValidMapDataShape(parsed.data)) {
			localStorage.removeItem(OVERWORLD_MAP_CACHE_KEY);
			return null;
		}
		return {
			signature,
			expiresAt: parsed.expiresAt,
			data: parsed.data,
		};
	} catch {
		return null;
	}
}

function writePersistedCache(record) {
	try {
		localStorage.setItem(OVERWORLD_MAP_CACHE_KEY, JSON.stringify(record));
	} catch {
		// Ignore storage failures and keep memory cache active for the current tab.
	}
}

function isValidMapDataShape(data) {
	return Boolean(data && typeof data === "object" && Array.isArray(data.mapOutline) && Array.isArray(data.overlays) && "unionBounds" in data);
}

function createNeighborhoodSignature(neighborhoods) {
	if (!Array.isArray(neighborhoods)) return "[]";
	return JSON.stringify(
		neighborhoods.map((hood) => ({
			id: String(hood?.id ?? ""),
			slug: String(hood?.slug ?? ""),
		})),
	);
}

function getNeighborhoodKey(neighborhood) {
	const slug = String(neighborhood?.slug ?? "").trim();
	if (slug) return slug;
	const id = String(neighborhood?.id ?? "").trim();
	if (id) return id;
	return String(neighborhood?.name ?? "").trim();
}

async function loadQuebecOutlineRaw() {
	try {
		const loc = getLocale();
		const endpoint = "/api/nominatim.json?mode=search&format=jsonv2&polygon_geojson=1&limit=1&q=";
		const query = "La Cité-Limoilou, Quebec, Canada";
		const url = `${endpoint}${encodeURIComponent(query)}&lang=${encodeURIComponent(loc)}`;
		const res = await fetch(url, {
			headers: {
				"Accept-Language": nominatimAcceptLanguageHeader(loc),
			},
		});
		if (!res.ok) return {geojson: null, bounds: null};
		const results = await res.json();
		if (!Array.isArray(results) || results.length === 0) return {geojson: null, bounds: null};
		const geojson = results[0]?.geojson;
		if (!geojson) return {geojson: null, bounds: null};
		const bounds = computeGeoBounds(extractRawRings(geojson));
		if (!bounds) return {geojson: null, bounds: null};
		return {geojson, bounds};
	} catch {
		return {geojson: null, bounds: null};
	}
}

async function fetchFirstNeighborhoodPolygonGeoJson(neighborhood) {
	try {
		const candidates = neighborhoodQueryCandidates(neighborhood);
		if (shouldDebugNeighborhood(neighborhood)) {
			logMapDebug("Trying neighborhood API candidates", {
				neighborhood,
				candidates,
			});
		}
		for (let i = 0; i < candidates.length; i++) {
			const geojson = await fetchNeighborhoodPolygonGeoJson(candidates[i], neighborhood);
			if (geojson) return geojson;
		}
		if (shouldDebugNeighborhood(neighborhood)) {
			logMapDebug("No API candidate returned polygon", {neighborhood, candidates});
		}
		return null;
	} catch (error) {
		if (shouldDebugNeighborhood(neighborhood)) {
			logMapDebug("Neighborhood lookup failed with exception", {
				neighborhood,
				error: error instanceof Error ? error.message : String(error),
			});
		}
		return null;
	}
}

async function fetchNeighborhoodPolygonGeoJson(neighborhoodName, neighborhood) {
	const baseUrl = "/api/nominatim.json";
	const q = buildNeighborhoodSearchQuery(neighborhoodName);
	const attempts = [
		{label: "suburb-filter", featuretype: "suburb"},
		{label: "unfiltered", featuretype: null},
	];

	const loc = getLocale();
	for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
		const attempt = attempts[attemptIndex];
		const params = new URLSearchParams({
			mode: "search",
			format: "jsonv2",
			polygon_geojson: "1",
			limit: "8",
			q,
			lang: loc,
		});
		if (attempt.featuretype) params.set("featuretype", attempt.featuretype);

		const res = await fetch(`${baseUrl}?${params.toString()}`, {
			headers: {
				"Accept-Language": nominatimAcceptLanguageHeader(loc),
			},
		});
		if (shouldDebugNeighborhood(neighborhood)) {
			logMapDebug("API response received", {
				candidate: neighborhoodName,
				query: q,
				attempt: attempt.label,
				status: res.status,
				ok: res.ok,
			});
		}
		if (!res.ok) continue;

		const results = await res.json();
		if (shouldDebugNeighborhood(neighborhood)) {
			logMapDebug("API JSON payload", {
				candidate: neighborhoodName,
				attempt: attempt.label,
				resultCount: Array.isArray(results) ? results.length : 0,
				firstResult:
					Array.isArray(results) && results.length > 0
						? {
								display_name: results[0]?.display_name,
								class: results[0]?.class,
								type: results[0]?.type,
								geojsonType: results[0]?.geojson?.type ?? null,
							}
						: null,
			});
		}
		if (!Array.isArray(results) || results.length === 0) continue;

		for (let i = 0; i < results.length; i++) {
			const geojson = results[i]?.geojson;
			if (!geojson) continue;
			if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") return geojson;
		}
	}
	return null;
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
	const looksQualified = value.includes(",") || lower.includes("quebec") || lower.includes("québec") || lower.includes("canada") || lower.includes("levis") || lower.includes("lévis");
	if (looksQualified) return value;
	return `${value}, Quebec City, Quebec, Canada`;
}

function extractRawRings(geojson) {
	const rawRings = [];
	if (geojson?.type === "Polygon") {
		for (let i = 0; i < geojson.coordinates.length; i++) {
			rawRings.push(geojson.coordinates[i]);
		}
	} else if (geojson?.type === "MultiPolygon") {
		for (let i = 0; i < geojson.coordinates.length; i++) {
			const polygon = geojson.coordinates[i];
			for (let j = 0; j < polygon.length; j++) {
				rawRings.push(polygon[j]);
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
			reduced.push({
				x: (lon - bounds.minLon) / lonSpan,
				y: (lat - bounds.minLat) / latSpan,
			});
		}
		if (reduced.length >= 3) normalized.push(reduced);
	}
	return normalized;
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
