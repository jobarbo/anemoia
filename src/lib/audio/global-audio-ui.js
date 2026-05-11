/**
 * Shared UI for #global-audio: toggle icons and player visibility.
 * Used by AudioPlayer (astro:page-load) and world-ambient sync (SPA).
 */

export function syncGlobalAudioToggleIcons(playing) {
	const btn = document.getElementById("toggle-audio");
	if (!btn) return;
	const iconPlay = btn.querySelector(".icon-play");
	const iconPause = btn.querySelector(".icon-pause");
	if (!iconPlay || !iconPause) return;
	if (playing) {
		iconPlay.style.display = "none";
		iconPause.style.display = "inline";
	} else {
		iconPlay.style.display = "inline";
		iconPause.style.display = "none";
	}
}

/** @param {HTMLAudioElement} audio */
function ensureErrorListener(audio) {
	if (audio.dataset.anemoiaErrorWired === "1") return;
	audio.dataset.anemoiaErrorWired = "1";
	audio.addEventListener("error", () => {
		const container = document.getElementById("audio-player-container");
		if (container) container.style.display = "none";
	});
}

/**
 * Show or hide the floating toggle; sync icons with current paused state.
 * Call after changing src or when the page may have a new audio context (SPA).
 */
export function refreshGlobalAudioPlayer() {
	const container = document.getElementById("audio-player-container");
	const audio = /** @type {HTMLAudioElement|null} */ (document.getElementById("global-audio"));
	if (!container) return;

	if (!audio || !audio.src || audio.src === window.location.href) {
		container.style.display = "none";
		return;
	}

	ensureErrorListener(audio);

	if (audio.error && audio.error.code !== 0) {
		container.style.display = "none";
		return;
	}

	container.style.display = "block";
	syncGlobalAudioToggleIcons(!audio.paused);
}

/**
 * Start playback when a source is set (may fail under browser autoplay policy).
 * @param {HTMLAudioElement|null} audio
 */
export function tryPlayGlobalAudio(audio) {
	if (!audio?.src || audio.src === window.location.href) return;
	return audio.play().catch(() => {});
}
