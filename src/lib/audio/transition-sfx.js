/**
 * Son de transition entre scènes (router) : fichier « empilé » découpé par transitoires,
 * une variante aléatoire à chaque navigation. Voir `sliced-audio-sfx.js`.
 */

import {loadSlicedSfx, playSlicedSfx} from "./sliced-audio-sfx.js";

export const TRANSITION_SFX_URL = "/assets/audio/transition_array.mp3";

/**
 * Ajuster détection (`minOnsetGapMs`, `noveltyThreshold`) ou longueur :
 * - `maxDurationSec` : plafond si la zone entre deux transitoires est longue ;
 * - `fixedSliceSec` (ex. 0.85) : même durée lue depuis chaque onset (plus homogène, peut chevaucher le son suivant).
 */
export const TRANSITION_SFX_ANALYSIS = {
	minOnsetGapMs: 45,
	noveltyThreshold: 0.15,
	gapBeforeNextMs: 0,
	maxDurationSec: 1.5,
	fixedSliceSec: 1.85,
};

export const TRANSITION_SFX_VOLUME = 0.85;

/** @type {{ buffer: AudioBuffer, segments: { startSec: number, durationSec: number }[] } | null} */
let pack = null;
let loadStarted = false;

/** Lance le fetch/décodage dès le boot du routeur (prêt avant la 1re navigation). */
export function ensureTransitionSfxPackLoaded() {
	if (loadStarted) return;
	loadStarted = true;
	void loadSlicedSfx(TRANSITION_SFX_URL, TRANSITION_SFX_ANALYSIS).then((data) => {
		if (data.buffer && data.segments.length > 0) pack = data;
	});
}

/**
 * Joue un segment au hasard (index `i` : `playSlicedSfx(pack.buffer, pack.segments[i], vol)`).
 */
export function playRandomTransitionSfx(volume = TRANSITION_SFX_VOLUME) {
	if (!pack?.buffer || pack.segments.length === 0) return;
	const idx = Math.floor(Math.random() * pack.segments.length);
	playSlicedSfx(pack.buffer, pack.segments[idx], volume);
}
