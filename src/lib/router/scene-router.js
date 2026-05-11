/**
 * SPA Scene Router
 *
 * Manages client-side scene transitions without ever destroying the GlobalShaderOverlay.
 * The shader pipeline runs continuously — scenes swap inside a fixed container.
 *
 * Architecture:
 *   - One persistent #game-container [data-game-screen] in the DOM
 *   - navigateTo(route, params) mounts/unmounts scene modules dynamically
 *   - history.pushState keeps the URL in sync for deep-linking
 *   - popstate handles browser back/forward
 *
 * Scene modules live in src/scenes/ and follow the interface:
 *   export async function mount(container, params, data) { ... return { unmount } }
 *
 * Transition:
 *   GlobalShaderOverlay runs a CRT-style beam collapse (power off), the router swaps
 *   the DOM inside #game-container, then a beam expand (power on). Shader runs uninterrupted.
 */

import {ensureTransitionSfxPackLoaded, playRandomTransitionSfx} from "../audio/transition-sfx.js";
import {syncWorldAmbient} from "../audio/world-ambient.js";
import {getNeighborhoods, getStory} from "../data/scene-data.js";

/** Vertical phosphor “tube off / on” timing — feels like old CRT input switching */
const CRT_OUT_MS = 220;
const CRT_IN_MS = 260;

/** @type {SceneRouter | null} */
let _instance = null;

/** Singleton accessor — set by SceneRouter constructor */
export function getSceneRouter() {
	return _instance;
}

export class SceneRouter {
	/**
	 * @param {{
	 *   container: HTMLElement,
	 *   overlay: import('./global-shader-overlay.js').GlobalShaderOverlay
	 * }} opts
	 */
	constructor({container, overlay}) {
		this._container = container;
		this._overlay = overlay;
		this._current = null; // { route, params, unmount }
		this._transitioning = false;

		_instance = this;

		ensureTransitionSfxPackLoaded();

		window.addEventListener("popstate", (e) => {
			const state = e.state;
			if (state?.route) {
				this._mount(state.route, state.params ?? {}, false);
			}
		});
	}

	/**
	 * Navigate to a named route, pushing to history.
	 * @param {string} route - 'splash' | 'desktop' | 'overworld' | 'neighborhood' | 'story'
	 * @param {Record<string,string>} [params] - e.g. { slug: 'saint-roch' }
	 */
	async navigateTo(route, params = {}) {
		if (this._transitioning) return;
		await this._mount(route, params, true);
	}

	/**
	 * Boot the router from the current URL without pushing history.
	 * Call once on app startup.
	 */
	async bootFromUrl() {
		const {route, params} = parseUrl(location.pathname);
		history.replaceState({route, params}, "", location.pathname);
		await this._mount(route, params, false);
	}

	async _mount(route, params, pushHistory) {
		if (this._transitioning) return;
		this._transitioning = true;

		const hadScene = Boolean(this._current);

		if (hadScene) {
			playRandomTransitionSfx();
			await this._overlay.crtSceneTransition("out", CRT_OUT_MS);
		}

		// Unmount previous scene
		if (this._current) {
			try {
				await this._current.unmount();
			} catch (e) {
				console.warn("[SceneRouter] unmount error", e);
			}
		}

		// Clear container content
		this._container.innerHTML = "";

		// Update container data attribute so the overlay knows which composite mode to use
		this._container.dataset.gameScreen = route;
		// Remove leftover mode attributes from previous scene
		delete this._container.dataset.domSnapshot;

		// Update history
		if (pushHistory) {
			const url = buildUrl(route, params);
			history.pushState({route, params}, "", url);
		}

		// Update document title
		document.title = buildTitle(route, params);

		// Mount new scene
		let unmountFn = () => {};
		let sceneEffects = {};
		try {
			const mod = await loadSceneModule(route);
			sceneEffects = mod.SCENE_EFFECTS ?? {};
			const data = buildSceneData(route, params);
			const result = await mod.mount(this._container, params, data);
			if (result?.unmount) unmountFn = result.unmount;
		} catch (e) {
			console.error("[SceneRouter] mount error for route:", route, e);
		}

		// Apply per-scene shader overrides (or reset to defaults if none defined)
		this._overlay.setEffects(sceneEffects);

		// Tell the overlay to point at the (possibly re-populated) container
		this._overlay.setContainer(this._container);

		this._current = {route, params, unmount: unmountFn};

		syncWorldAmbient(route);

		if (hadScene) {
			await this._overlay.crtSceneTransition("in", CRT_IN_MS);
		}

		this._transitioning = false;
	}
}

// ── Route parsing / building ──────────────────────────────────────────────────

/**
 * @param {string} pathname
 * @returns {{ route: string, params: Record<string,string> }}
 */
function parseUrl(pathname) {
	const neighborhoodMatch = pathname.match(/^\/neighborhood\/([^/]+)\/?$/);
	if (neighborhoodMatch) return {route: "neighborhood", params: {slug: neighborhoodMatch[1]}};

	const storyMatch = pathname.match(/^\/story\/([^/]+)\/?$/);
	if (storyMatch) return {route: "story", params: {slug: storyMatch[1]}};

	if (pathname === "/desktop" || pathname === "/desktop/") return {route: "desktop", params: {}};
	if (pathname === "/overworld" || pathname === "/overworld/") return {route: "overworld", params: {}};

	return {route: "splash", params: {}};
}

/**
 * @param {string} route
 * @param {Record<string,string>} params
 * @returns {string}
 */
function buildUrl(route, params) {
	if (route === "splash") return "/";
	if (route === "desktop") return "/desktop";
	if (route === "overworld") return "/overworld";
	if (route === "neighborhood") return `/neighborhood/${params.slug}`;
	if (route === "story") return `/story/${params.slug}`;
	return "/";
}

/**
 * @param {string} route
 * @param {Record<string,string>} params
 * @returns {string}
 */
function buildTitle(route, params) {
	if (route === "splash") return "Anemoia";
	if (route === "desktop") return "Anemoia — Bureau";
	if (route === "overworld") return "Anemoia — Carte";
	if (route === "neighborhood") {
		const hood = getNeighborhoods().find((n) => n.slug === params.slug);
		return `Anemoia — ${hood?.name ?? params.slug}`;
	}
	if (route === "story") {
		const story = getStory(params.slug);
		return `Anemoia — ${story?.title ?? params.slug}`;
	}
	return "Anemoia";
}

// ── Scene module loader ───────────────────────────────────────────────────────

/** @param {string} route */
async function loadSceneModule(route) {
	switch (route) {
		case "splash":
			return import("../../scenes/splash-scene.js");
		case "overworld":
			return import("../../scenes/overworld-scene.js");
		case "desktop":
			return import("../../scenes/desktop-scene.js");
		case "neighborhood":
			return import("../../scenes/neighborhood-scene.js");
		case "story":
			return import("../../scenes/story-scene.js");
		default:
			throw new Error(`[SceneRouter] Unknown route: "${route}"`);
	}
}

// ── Scene data builders ───────────────────────────────────────────────────────

/** @param {string} route @param {Record<string,string>} params */
function buildSceneData(route, params) {
	if (route === "overworld") {
		return {neighborhoods: getNeighborhoods()};
	}
	if (route === "neighborhood") {
		return getNeighborhoods().find((n) => n.slug === params.slug) ?? {};
	}
	if (route === "story") {
		return getStory(params.slug) ?? {};
	}
	return {};
}
