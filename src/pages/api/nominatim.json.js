const RESPONSE_CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
const MIN_UPSTREAM_INTERVAL_MS = 1100;

export const prerender = false;

/** @type {Map<string, {expiresAt:number, status:number, body:any}>} */
const responseCache = new Map();
/** @type {Map<string, Promise<{status:number, body:any}>>} */
const inFlightByKey = new Map();
let blockedUntil = 0;
let lastUpstreamAt = 0;

function cachedJson(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

function getCached(key) {
	const hit = responseCache.get(key);
	if (!hit) return null;
	if (hit.expiresAt <= Date.now()) {
		responseCache.delete(key);
		return null;
	}
	return hit;
}

function setCached(key, status, body) {
	responseCache.set(key, {
		expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
		status,
		body,
	});
}

async function throttleUpstream() {
	const now = Date.now();
	const waitMs = Math.max(0, MIN_UPSTREAM_INTERVAL_MS - (now - lastUpstreamAt));
	if (waitMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}
	lastUpstreamAt = Date.now();
}

export async function GET({request}) {
	const reqUrl = new URL(request.url);
	const mode = reqUrl.searchParams.get("mode");
	if (mode !== "search" && mode !== "reverse") {
		return cachedJson(400, {error: "Invalid mode"});
	}

	if (Date.now() < blockedUntil) {
		return cachedJson(503, {error: "Geocoder temporarily rate-limited", retryAfterMs: blockedUntil - Date.now()});
	}

	const outbound = new URL(`https://nominatim.openstreetmap.org/${mode}`);
	if (mode === "search") {
		outbound.searchParams.set("format", "jsonv2");
		outbound.searchParams.set("polygon_geojson", reqUrl.searchParams.get("polygon_geojson") ?? "1");
		outbound.searchParams.set("limit", reqUrl.searchParams.get("limit") ?? "8");
		const q = reqUrl.searchParams.get("q") ?? "";
		if (!q) return cachedJson(400, {error: "Missing q"});
		outbound.searchParams.set("q", q);
		const featuretype = reqUrl.searchParams.get("featuretype");
		if (featuretype) outbound.searchParams.set("featuretype", featuretype);
	}
	if (mode === "reverse") {
		outbound.searchParams.set("format", "jsonv2");
		const lat = reqUrl.searchParams.get("lat") ?? "";
		const lon = reqUrl.searchParams.get("lon") ?? "";
		if (!lat || !lon) return cachedJson(400, {error: "Missing lat/lon"});
		outbound.searchParams.set("lat", lat);
		outbound.searchParams.set("lon", lon);
	}

	const langParam = reqUrl.searchParams.get("lang");
	const acceptLang =
		langParam === "en" ? "en-CA,en,fr" : langParam === "fr" ? "fr-CA,fr,en" : request.headers.get("accept-language") || "fr-CA,fr,en";
	const cacheKey = `${acceptLang}::${outbound.toString()}`;

	const cached = getCached(cacheKey);
	if (cached) return cachedJson(cached.status, cached.body);

	const inFlight = inFlightByKey.get(cacheKey);
	if (inFlight) {
		const shared = await inFlight;
		return cachedJson(shared.status, shared.body);
	}

	try {
		const pending = (async () => {
			await throttleUpstream();
			const upstream = await fetch(outbound.toString(), {
				headers: {
					"Accept-Language": acceptLang,
					"User-Agent": "anemoia-dev/1.0 (local astro proxy)",
					Referer: reqUrl.origin,
				},
			});

			let body;
			try {
				body = await upstream.json();
			} catch {
				body = null;
			}

			if (upstream.status === 429) {
				blockedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
			}

			setCached(cacheKey, upstream.status, body);
			return {status: upstream.status, body};
		})();

		inFlightByKey.set(cacheKey, pending);
		const result = await pending;
		inFlightByKey.delete(cacheKey);
		return cachedJson(result.status, result.body);
	} catch {
		inFlightByKey.delete(cacheKey);
		return cachedJson(502, {error: "Failed to reach upstream geocoder"});
	}
}
