/**
 * Shared looping ambient on #global-audio for desktop / overworld / neighborhood / story.
 * Scene router owns lifecycle so src/currentTime persist across navigations.
 */

import {refreshGlobalAudioPlayer, tryPlayGlobalAudio} from "./global-audio-ui.js";

export const WORLD_AMBIENT_SRC = "/assets/audio/machine_ambiant.mp3";

/** Gain for machine ambient on `#global-audio` (0–1). */
export const WORLD_AMBIENT_VOLUME = 0.35;

/** @type {ReadonlySet<string>} */
export const WORLD_AMBIENT_ROUTES = new Set(["desktop", "overworld", "neighborhood", "story"]);

/**
 * @param {string} route - SceneRouter route name
 */
export function syncWorldAmbient(route) {
	const audio = /** @type {HTMLAudioElement|null} */ (document.getElementById("global-audio"));
	if (!audio) return;

	if (route === "splash") {
		audio.pause();
		return;
	}

	if (!WORLD_AMBIENT_ROUTES.has(route)) return;

	const resolved = new URL(WORLD_AMBIENT_SRC, location.href).href;
	if (audio.src !== resolved) {
		audio.src = WORLD_AMBIENT_SRC;
	}
	audio.loop = true;
	audio.volume = WORLD_AMBIENT_VOLUME;
	refreshGlobalAudioPlayer();
	tryPlayGlobalAudio(audio);
}
