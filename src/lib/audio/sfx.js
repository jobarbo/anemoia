/**
 * Short UI / game sounds via HTMLAudioElement.
 * Uses a small pool per `src` so rapid triggers (e.g. typing) can overlap.
 */

const DEFAULT_POOL = 4;

/** @type {Map<string, { audios: HTMLAudioElement[], i: number }>} */
const pools = new Map();

/**
 * @param {string} src - URL from site root (e.g. `/assets/...`), file must live under `public/`
 * @param {{ volume?: number, poolSize?: number }} [options]
 */
export function playSfx(src, options = {}) {
	if (!src || typeof Audio === "undefined") return;

	const volume = options.volume ?? 1;
	const poolSize = Math.max(1, options.poolSize ?? DEFAULT_POOL);

	let pool = pools.get(src);
	if (!pool) {
		const audios = [];
		for (let n = 0; n < poolSize; n++) {
			const a = new Audio(src);
			a.volume = volume;
			audios.push(a);
		}
		pool = {audios, i: 0};
		pools.set(src, pool);
	}

	const a = pool.audios[pool.i];
	pool.i = (pool.i + 1) % pool.audios.length;
	a.volume = volume;
	a.currentTime = 0;
	const p = a.play();
	if (p !== undefined) p.catch(() => {});
}
