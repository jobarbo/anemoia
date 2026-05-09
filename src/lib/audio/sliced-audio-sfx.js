/**
 * Fichiers audio « empilés » : plusieurs one-shots dans une seule piste.
 * Détection de transitoires (log-énergie + pics de nouveauté) → segments
 * `{ startSec, durationSec }`, lecture via Web Audio (`AudioBufferSourceNode`).
 *
 * Réutilisable pour claviers, pas de pas, variations de SFX, etc.
 */

/** @typedef {{ startSec: number, durationSec: number }} SlicedSfxSegment */

/** @type {AudioContext | null} */
let sharedCtx = null;

function getAudioContext() {
	if (typeof window === "undefined") return null;
	const AC = window.AudioContext || window.webkitAudioContext;
	if (!AC) return null;
	if (!sharedCtx) sharedCtx = new AC();
	return sharedCtx;
}

/**
 * @param {AudioBuffer} buffer
 * @returns {Float32Array}
 */
function mixToMono(buffer) {
	const {numberOfChannels, length} = buffer;
	const mono = new Float32Array(length);
	for (let c = 0; c < numberOfChannels; c++) {
		const ch = buffer.getChannelData(c);
		for (let i = 0; i < length; i++) mono[i] += ch[i];
	}
	const inv = 1 / numberOfChannels;
	for (let i = 0; i < length; i++) mono[i] *= inv;
	return mono;
}

/**
 * @param {Float32Array} mono
 * @param {number} sampleRate
 * @param {{
 *   hopMs?: number,
 *   windowMs?: number,
 *   minOnsetGapMs?: number,
 *   noveltyThreshold?: number,
 * }} [options]
 * @returns {number[]} indices d’échantillon des onsets
 */
function detectOnsetSamples(mono, sampleRate, options = {}) {
	const hopMs = options.hopMs ?? 2;
	const windowMs = options.windowMs ?? 5;
	const minOnsetGapMs = options.minOnsetGapMs ?? 42;
	const noveltyThreshold = options.noveltyThreshold ?? 0.18;

	const hop = Math.max(1, Math.floor((hopMs / 1000) * sampleRate));
	const win = Math.max(1, Math.floor((windowMs / 1000) * sampleRate));
	const minGapHops = Math.max(1, Math.floor(((minOnsetGapMs / 1000) * sampleRate) / hop));

	const nHop = Math.floor((mono.length - win) / hop);
	if (nHop < 4) return [0];

	const logE = new Float32Array(nHop);
	for (let h = 0; h < nHop; h++) {
		let sum = 0;
		const s0 = h * hop;
		for (let j = 0; j < win; j++) {
			const v = mono[s0 + j];
			sum += v * v;
		}
		logE[h] = Math.log(Math.max(1e-15, sum / win));
	}

	const novelty = new Float32Array(nHop);
	for (let h = 1; h < nHop; h++) {
		const d = logE[h] - logE[h - 1];
		novelty[h] = Math.max(0, d);
	}

	let maxN = 0;
	for (let h = 0; h < nHop; h++) if (novelty[h] > maxN) maxN = novelty[h];
	if (maxN < 1e-12) return [0];

	const thresh = noveltyThreshold * maxN;
	const onsets = [];
	let lastH = -minGapHops;

	for (let h = 2; h < nHop - 1; h++) {
		const peak = novelty[h] >= novelty[h - 1] && novelty[h] >= novelty[h + 1] && novelty[h] >= thresh;
		if (peak && h - lastH >= minGapHops) {
			onsets.push(h * hop);
			lastH = h;
		}
	}

	if (onsets.length === 0) return [0];
	return onsets;
}

/**
 * Construit les segments à partir des onsets.
 *
 * **Durée variable (comportement par défaut)** : chaque segment va du transitoire `i`
 * jusqu’au transitoire suivant (ou la fin du fichier). L’écart entre deux pics n’est pas
 * constant dans la matrice audio → certains sons paraissent courts, d’autres longs.
 * `minDurationSec` / `maxDurationSec` ne font qu’**encadrer** cette durée naturelle ;
 * les mettre à des valeurs minuscules (ex. 1e-5) ne « rallonge » pas le son, ça le casse.
 *
 * **Durée homogène** : passe `fixedSliceSec` — on lit toujours N secondes depuis chaque onset
 * (tronqué en fin de fichier ; peut chevaucher le clic suivant).
 *
 * @param {Float32Array} mono
 * @param {number} sampleRate
 * @param {number[]} onsetSamples
 * @param {{
 *   gapBeforeNextMs?: number,
 *   minDurationSec?: number,
 *   maxDurationSec?: number,
 *   fixedSliceSec?: number,
 * }} [options]
 * @returns {SlicedSfxSegment[]}
 */
function onsetsToSegments(mono, sampleRate, onsetSamples, options = {}) {
	const gapBeforeNext = Math.floor(((options.gapBeforeNextMs ?? 0) / 1000) * sampleRate);
	const minDur = options.minDurationSec ?? 0.012;
	const maxDur = options.maxDurationSec ?? 1.2;
	const minSamples = Math.floor(minDur * sampleRate);
	const fixedSliceSec = options.fixedSliceSec;
	const monoEndSec = mono.length / sampleRate;

	const segments = [];
	for (let i = 0; i < onsetSamples.length; i++) {
		const start = onsetSamples[i];
		const startSec = start / sampleRate;

		let durationSec;
		if (fixedSliceSec != null && fixedSliceSec > 0) {
			durationSec = Math.min(fixedSliceSec, monoEndSec - startSec);
		} else {
			const next = i + 1 < onsetSamples.length ? onsetSamples[i + 1] : mono.length;
			let end = next - gapBeforeNext;
			const minEnd = start + minSamples;
			end = Math.max(minEnd, end);
			end = Math.min(mono.length, end);
			durationSec = (end - start) / sampleRate;
		}
		durationSec = Math.min(maxDur, Math.max(minDur, durationSec));
		if (durationSec > 0) {
			segments.push({startSec, durationSec});
		}
	}
	return segments;
}

/**
 * Télécharge et décode `url`, segmente par transitoires.
 *
 * @param {string} url — chemin sous `public/` (ex. `/assets/...`)
 * @param {{
 *   hopMs?: number,
 *   windowMs?: number,
 *   minOnsetGapMs?: number,
 *   noveltyThreshold?: number,
 *   gapBeforeNextMs?: number,
 *   minDurationSec?: number,
 *   maxDurationSec?: number,
 *   fixedSliceSec?: number, // durée fixe depuis chaque onset (ignore l’écart jusqu’au suivant)
 * }} [analysisOptions]
 * @returns {Promise<{ buffer: AudioBuffer | null, segments: SlicedSfxSegment[] }>}
 */
export async function loadSlicedSfx(url, analysisOptions = {}) {
	const ctx = getAudioContext();
	if (!ctx || !url) {
		return {buffer: null, segments: []};
	}

	const res = await fetch(url);
	const raw = await res.arrayBuffer();
	const buffer = await ctx.decodeAudioData(raw.slice(0));

	const mono = mixToMono(buffer);
	const onsets = detectOnsetSamples(mono, buffer.sampleRate, analysisOptions);
	let segments = onsetsToSegments(mono, buffer.sampleRate, onsets, analysisOptions);

	if (segments.length === 0) {
		segments = [{startSec: 0, durationSec: buffer.duration}];
	}

	return {buffer, segments};
}

/**
 * Joue un segment (plusieurs lectures peuvent se chevaucher).
 *
 * @param {AudioBuffer} buffer
 * @param {SlicedSfxSegment} segment
 * @param {number} [volume]
 */
export function playSlicedSfx(buffer, segment, volume = 1) {
	const ctx = getAudioContext();
	if (!ctx || !buffer || !segment) return;

	const {startSec, durationSec} = segment;
	if (durationSec <= 0 || startSec < 0 || startSec >= buffer.duration) return;

	const dur = Math.min(durationSec, buffer.duration - startSec);

	void ctx.resume().then(() => {
		const src = ctx.createBufferSource();
		const gain = ctx.createGain();
		gain.gain.value = volume;
		src.buffer = buffer;
		src.connect(gain);
		gain.connect(ctx.destination);
		try {
			src.start(0, startSec, dur);
		} catch {
			// ignore
		}
	});
}
