/**
 * Pointer-coordinate remapping for CRT shader distortion.
 *
 * The shader pipeline warps the visual output (barrel distortion, zoom) but DOM
 * elements and p5 canvases remain at their original logical positions.  This
 * module intercepts pointer events, applies the inverse of each UV-distorting
 * shader pass to recover the logical game coordinates, then re-dispatches the
 * event on the element that lives at those coordinates.
 *
 * Pipeline (forward, last pass = crtWarp):
 *   game content → zoom → ... → crtWarp → screen
 *
 * Inverse (screen → game):
 *   screen → inverse crtWarp (barrel) → inverse zoom → logical game coords
 */

import {getGlobalShaderOverlay} from "./global-shader-overlay.js";

// ── Inverse barrel distortion ────────────────────────────────────────────────

/**
 * Exact JS mirror of the GLSL `barrelDistortion` function in
 * `public/library/shaders/crt-warp/fragment.frag`.
 *
 * The forward transform maps logical UV → screen UV.
 * This function inverts it: given a screen pixel position, return the logical
 * pixel position using Newton-Raphson iteration (converges in ~6 steps).
 *
 * @param {number} screenX  Screen pixel X (0 … W)
 * @param {number} screenY  Screen pixel Y (0 … H)
 * @param {number} W        Viewport width
 * @param {number} H        Viewport height
 * @param {number} warpAmount  `uWarpAmount` uniform (e.g. 0.2)
 * @param {number} aspectCorrect  `uAspectCorrect` uniform (0 or 1)
 * @returns {{ x: number, y: number }}  Logical pixel position
 */
function inverseBarrel(screenX, screenY, W, H, warpAmount, aspectCorrect) {
	// Normalize to centered UV space [-0.5, 0.5]
	let cx = screenX / W - 0.5;
	let cy = screenY / H - 0.5;

	const aspect = W / Math.max(H, 1);

	// Apply aspect correction (matches the GLSL branch)
	let cornerR2 = 0.5;
	if (aspectCorrect > 0.5) {
		cx *= aspect;
		cornerR2 = 0.25 * (aspect * aspect + 1);
	}

	const cornerDistortion = 1 + cornerR2 * warpAmount;

	// Radial distance of the *screen* point in (possibly aspect-corrected) space
	const rD = Math.sqrt(cx * cx + cy * cy);

	if (rD < 1e-10) {
		return {x: W * 0.5, y: H * 0.5};
	}

	// We need rC (logical radius) such that:
	//   rC * (1 + rC² * warpAmount) / cornerDistortion = rD
	// Rearranged as f(rC) = 0:
	//   f(rC)  = rC * (1 + rC² * warpAmount) / cornerDistortion - rD
	//   f'(rC) = (1 + 3 * rC² * warpAmount)  / cornerDistortion
	let rC = rD;
	for (let i = 0; i < 8; i++) {
		const rC2 = rC * rC;
		const f = (rC * (1 + rC2 * warpAmount)) / cornerDistortion - rD;
		const fPrime = (1 + 3 * rC2 * warpAmount) / cornerDistortion;
		if (Math.abs(fPrime) < 1e-12) break;
		rC -= f / fPrime;
		if (rC < 0) rC = 0;
	}

	// Restore direction; undo aspect correction
	const scale = rC / rD;
	let lx = cx * scale;
	let ly = cy * scale;

	if (aspectCorrect > 0.5) {
		lx /= aspect;
	}

	return {
		x: (lx + 0.5) * W,
		y: (ly + 0.5) * H,
	};
}

// ── Inverse zoom ─────────────────────────────────────────────────────────────

/**
 * Inverse of the zoom shader's UV transform.
 *
 * Forward (shader):  zoomedUV = center + (inputUV - center) / zoom
 * Inverse:           inputUV  = center + (zoomedUV - center) * zoom
 *
 * @param {number} px          Pre-warp pixel X (output of inverseBarrel)
 * @param {number} py          Pre-warp pixel Y
 * @param {number} W           Viewport width
 * @param {number} H           Viewport height
 * @param {number} zoomAmount  `uZoomAmount` uniform
 * @param {[number,number]} center  `uCenter` uniform ([0.5, 0.5] by default)
 * @returns {{ x: number, y: number }}
 */
function inverseZoom(px, py, W, H, zoomAmount, center) {
	const cx = center[0];
	const cy = center[1];
	const ux = px / W;
	const uy = py / H;
	return {
		x: (cx + (ux - cx) * zoomAmount) * W,
		y: (cy + (uy - cy) * zoomAmount) * H,
	};
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Remap a screen-space pointer position to logical game coordinates by inverting
 * the active UV-distorting shader passes (crtWarp, then zoom).
 *
 * @param {number} screenX
 * @param {number} screenY
 * @param {{ W: number, H: number, crtWarp: object|null, zoom: object|null }|null} warpParams
 * @returns {{ x: number, y: number }}
 */
export function remapPointer(screenX, screenY, warpParams) {
	if (!warpParams) return {x: screenX, y: screenY};

	const {W, H, crtWarp, zoom} = warpParams;

	let {x, y} = {x: screenX, y: screenY};

	// Invert crtWarp first (it is the *last* pass, so it is the outermost transform)
	if (crtWarp?.enabled && crtWarp.warpAmount) {
		const r = inverseBarrel(x, y, W, H, crtWarp.warpAmount, crtWarp.aspectCorrect ?? 1.0);
		x = r.x;
		y = r.y;
	}

	// Invert zoom (applied before crtWarp in the pipeline)
	if (zoom?.enabled && zoom.animateZoom < 0.5 && zoom.zoomAmount && zoom.zoomAmount !== 1.0) {
		const r = inverseZoom(x, y, W, H, zoom.zoomAmount, zoom.center ?? [0.5, 0.5]);
		x = r.x;
		y = r.y;
	}

	return {x, y};
}

// ── Pointer interceptor ───────────────────────────────────────────────────────

/**
 * Set of synthetic events created by this module — used to prevent re-interception
 * when a synthetic event bubbles back up through the container.
 * @type {WeakSet<Event>}
 */
const _synthetic = new WeakSet();

/**
 * Returns true for elements rendered outside the shader composite
 * (e.g. back button, audio player) that appear at their real CSS positions
 * and therefore must NOT have their coordinates remapped.
 *
 * @param {Element} el
 */
function isOutsideShader(el) {
	return el.closest("[data-html2canvas-ignore]") !== null;
}

/**
 * Install a capture-phase pointer interceptor on `container`.
 *
 * For every pointer event:
 *  1. Bail if the event was synthesised by this module (prevents loops).
 *  2. Bail if the original target is outside the shader composite.
 *  3. Apply inverse warp to recover logical coordinates.
 *  4. Bail if the remapped position is the same as the original (no warp active).
 *  5. Stop the original event and re-dispatch a synthetic one on the element
 *     found at the logical position, with corrected clientX/clientY so p5
 *     sketches receive the right mouseX/mouseY.
 *
 * @param {HTMLElement} container
 * @returns {() => void}  Cleanup function — call on scene unmount.
 */
export function installPointerRemap(container) {
	const TYPES = ["click", "mousedown", "mouseup", "mousemove"];

	/** @param {MouseEvent} e */
	function onPointerEvent(e) {
		// Skip our own synthetic events (prevent infinite loop)
		if (_synthetic.has(e)) return;

		// Skip UI elements that bypass the shader (e.g. back button, debug canvas)
		if (isOutsideShader(/** @type {Element} */ (e.target))) return;

		const params = getGlobalShaderOverlay()?.getWarpParams() ?? null;
		if (!params) return;

		const {x: lx, y: ly} = remapPointer(e.clientX, e.clientY, params);

		// If remapping moved less than half a pixel, nothing to correct
		if (Math.abs(lx - e.clientX) < 0.5 && Math.abs(ly - e.clientY) < 0.5) return;

		e.stopImmediatePropagation();
		e.preventDefault();

		const logicalTarget = document.elementFromPoint(lx, ly);
		if (!logicalTarget) return;

		const synthetic = new MouseEvent(e.type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			clientX: lx,
			clientY: ly,
			screenX: e.screenX + (lx - e.clientX),
			screenY: e.screenY + (ly - e.clientY),
			movementX: e.movementX,
			movementY: e.movementY,
			buttons: e.buttons,
			button: e.button,
			detail: e.detail,
			ctrlKey: e.ctrlKey,
			altKey: e.altKey,
			shiftKey: e.shiftKey,
			metaKey: e.metaKey,
			relatedTarget: e.relatedTarget,
		});

		_synthetic.add(synthetic);
		logicalTarget.dispatchEvent(synthetic);
	}

	for (const type of TYPES) {
		container.addEventListener(type, onPointerEvent, {capture: true});
	}

	return function cleanup() {
		for (const type of TYPES) {
			container.removeEventListener(type, onPointerEvent, {capture: true});
		}
	};
}
