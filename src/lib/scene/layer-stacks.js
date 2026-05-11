/**
 * Scene layer stacks: PSD groups that share one `.scene__layer-container` (sceneGroupId).
 * Used by psd-export, Astro SceneRenderer, neighborhood-scene, and scene-data after config merge.
 */

const MIN_PARALLAX_SPEED = 0.0;
const MAX_PARALLAX_SPEED = 0.6;
const PARALLAX_SPEED_CURVE = 1.6;

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

/**
 * Parallax speed for a stack from its index in the back-to-front stack list (0 = back).
 * @param {number} stackIndex
 * @param {number} stackCount
 */
export function parallaxSpeedForStackIndex(stackIndex, stackCount) {
	const maxIndex = Math.max(stackCount - 1, 1);
	const normalized = stackIndex / maxIndex;
	const d = clamp(normalized, 0, 1);
	return MIN_PARALLAX_SPEED + Math.pow(d, PARALLAX_SPEED_CURVE) * (MAX_PARALLAX_SPEED - MIN_PARALLAX_SPEED);
}

/** @param {Record<string, unknown>} layer */
export function stackKeyForLayer(layer) {
	const gid = layer.sceneGroupId;
	return typeof gid === "string" && gid.length > 0 ? `g:${gid}` : `s:${layer.name}`;
}

/**
 * Group manifest layers into stacks (same sceneGroupId → one stack; solo layers → one member each).
 * Stacks are ordered back-to-front by min(member.zIndex), tie-break first appearance in `layers`.
 *
 * @param {Array<Record<string, unknown>>} layers
 * @returns {Array<{ sceneGroupId: string | null, members: any[], minZ: number, maxZ: number }>}
 */
export function buildLayerStacks(layers) {
	if (!Array.isArray(layers) || layers.length === 0) return [];

	const keyToMembers = new Map();
	/** @type {string[]} */
	const keyOrder = [];

	for (const layer of layers) {
		const key = stackKeyForLayer(layer);
		if (!keyToMembers.has(key)) {
			keyToMembers.set(key, []);
			keyOrder.push(key);
		}
		keyToMembers.get(key).push(layer);
	}

	const stacks = keyOrder.map((key) => {
		const members = keyToMembers.get(key);
		const sorted = [...members].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
		const sceneGroupId = typeof sorted[0].sceneGroupId === "string" && sorted[0].sceneGroupId.length > 0 ? sorted[0].sceneGroupId : null;
		const zs = sorted.map((m) => m.zIndex ?? 0);
		const minZ = Math.min(...zs);
		const maxZ = Math.max(...zs);
		let firstManifestIndex = Infinity;
		for (const m of sorted) {
			const idx = layers.indexOf(m);
			if (idx >= 0 && idx < firstManifestIndex) firstManifestIndex = idx;
		}
		return {sceneGroupId, members: sorted, minZ, maxZ, firstManifestIndex};
	});

	stacks.sort((a, b) => {
		if (a.minZ !== b.minZ) return a.minZ - b.minZ;
		return a.firstManifestIndex - b.firstManifestIndex;
	});

	return stacks.map(({sceneGroupId, members, minZ, maxZ}) => ({sceneGroupId, members, minZ, maxZ}));
}

/** @param {Array<Record<string, unknown>>} members */
export function getStackContainerZIndex(members) {
	return Math.max(...members.map((m) => m.zIndex ?? 0), 0);
}

/** @param {Array<Record<string, unknown>>} members */
export function getStackParallaxSpeed(members) {
	const s = members[0]?.parallaxSpeed;
	return typeof s === "number" ? s : Number(s) || 0;
}

/**
 * Recompute `parallaxSpeed` on every layer from stack order (after hand edits or scene-config patches).
 * @param {Array<Record<string, unknown>>} layers
 */
export function syncStackParallaxFromDepth(layers) {
	if (!Array.isArray(layers) || layers.length === 0) return;
	const stacks = buildLayerStacks(layers);
	const n = stacks.length;
	for (let si = 0; si < n; si++) {
		const speed = parallaxSpeedForStackIndex(si, n);
		for (const layer of stacks[si].members) {
			layer.parallaxSpeed = speed;
		}
	}
}
