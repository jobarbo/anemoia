/**
 * Helpers for `#global-audio` playback (no UI; ambient / scene code owns src).
 */

/**
 * Start playback when a source is set (may fail under browser autoplay policy).
 * @param {HTMLAudioElement|null} audio
 */
export function tryPlayGlobalAudio(audio) {
	if (!audio?.src || audio.src === window.location.href) return;
	return audio.play().catch(() => {});
}
