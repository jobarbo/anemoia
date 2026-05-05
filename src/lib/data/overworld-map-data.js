const OVERWORLD_MAP_CACHE_KEY = "anemoia.overworldMapData.v1";
const OVERWORLD_MAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let memoryCache = null;
let inFlightRequest = null;

export function getFallbackOverworldMapOutline() {
	return [];
}

export function prefetchOverworldMapData(neighborhoods) {
	return getOverworldMapData(neighborhoods).catch(() => null);
}

export async function getOverworldMapData(neighborhoods) {
	const signature = createNeighborhoodSignature(neighborhoods);

	if (memoryCache?.signature === signature && memoryCache.expiresAt > Date.now()) {
		return memoryCache.data;
	}

	const persisted = readPersistedCache(signature);
	if (persisted) {
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
	if (!Array.isArray(neighborhoods) || neighborhoods.length === 0) {
		const data = {
			mapOutline: [],
			unionBounds: null,
			overlays: [],
		};
		writeCaches(signature, data);
		return data;
	}

	const hoodRaw = [];
	for (let i = 0; i < neighborhoods.length; i++) {
		const hood = neighborhoods[i];
		const geojson = await fetchFirstNeighborhoodPolygonGeoJson(hood);
		hoodRaw.push({hood, geojson});
	}

	let unionBounds = null;
	for (let i = 0; i < hoodRaw.length; i++) {
		const geojson = hoodRaw[i].geojson;
		if (!geojson) continue;
		const bounds = computeGeoBounds(extractRawRings(geojson));
		if (!bounds) continue;
		unionBounds = unionBounds ? mergeGeoBounds(unionBounds, bounds) : bounds;
	}

	if (!unionBounds) {
		const data = {
			mapOutline: [],
			unionBounds: null,
			overlays: [],
		};
		writeCaches(signature, data);
		return data;
	}

	const mapOutline = [];
	const overlays = [];
	for (let i = 0; i < hoodRaw.length; i++) {
		const {hood, geojson} = hoodRaw[i];
		if (!geojson) continue;
		const rings = normalizeGeoJsonRings(geojson, unionBounds);
		if (rings.length === 0) continue;
		for (let j = 0; j < rings.length; j++) {
			mapOutline.push(rings[j]);
		}
		overlays.push({
			name: hood.name,
			slug: hood.slug,
			neighborhoodKey: getNeighborhoodKey(hood),
			rings,
			anchor: computeOverlayAnchor(rings),
		});
	}

	const data = {
		mapOutline,
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
	return "";
}

async function fetchFirstNeighborhoodPolygonGeoJson(neighborhood) {
	try {
		const candidates = neighborhoodQueryCandidates(neighborhood);
		for (let i = 0; i < candidates.length; i++) {
			const geojson = await fetchNeighborhoodPolygonGeoJson(candidates[i]);
			if (geojson) return geojson;
		}
		return null;
	} catch {
		return null;
	}
}

async function fetchNeighborhoodPolygonGeoJson(neighborhoodName) {
	const baseUrl = "https://nominatim.openstreetmap.org/search";
	const params = new URLSearchParams({
		format: "jsonv2",
		polygon_geojson: "1",
		limit: "5",
		featuretype: "suburb",
		q: neighborhoodName,
	});
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

function neighborhoodQueryCandidates(neighborhood) {
	const baseName = String(neighborhood?.name ?? "").trim();
	const baseSlug = String(neighborhood?.slug ?? neighborhood?.id ?? "").trim();
	const apiSearchTerms = Array.isArray(neighborhood?.apiSearchTerms) ? neighborhood.apiSearchTerms : [];
	const candidates = [];
	for (let i = 0; i < apiSearchTerms.length; i++) {
		const term = String(apiSearchTerms[i] ?? "").trim();
		if (term) candidates.push(term);
	}
	if (baseName) candidates.push(baseName);
	if (baseSlug) candidates.push(baseSlug.replace(/[-_]+/g, " "));

	return [...new Set(candidates)];
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
