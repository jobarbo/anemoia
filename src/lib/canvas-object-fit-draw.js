/**
 * Canvas2D draw that matches CSS object-fit / object-position on replaced elements.
 * Used by GlobalShaderOverlay so compositing matches visible &lt;img&gt; / &lt;video&gt; layout.
 */

/** @param {Element} el */
function getIntrinsicSize(el) {
	if (el instanceof HTMLImageElement) {
		const iw = el.naturalWidth;
		const ih = el.naturalHeight;
		if (!iw || !ih) return null;
		return {iw, ih};
	}
	if (el instanceof HTMLVideoElement) {
		const iw = el.videoWidth;
		const ih = el.videoHeight;
		if (!iw || !ih) return null;
		return {iw, ih};
	}
	if (el instanceof HTMLCanvasElement) {
		return {iw: el.width, ih: el.height};
	}
	return null;
}

const H_KEY = {left: 0, center: 0.5, right: 1};
const V_KEY = {top: 0, center: 0.5, bottom: 1};

/**
 * Map one token to horizontal / vertical alignment (0..1). `center` fills both.
 * @param {string} tok
 * @returns {{h: number|null, v: number|null}}
 */
function keywordHV(tok) {
	const t = tok.toLowerCase();
	if (t.endsWith("%")) {
		const n = parseFloat(t);
		const p = Number.isFinite(n) ? clamp01(n / 100) : null;
		return {h: p, v: p};
	}
	let h = null;
	let v = null;
	if (t in H_KEY) h = /** @type {number} */ (H_KEY[/** @type {keyof typeof H_KEY} */ (t)]);
	if (t in V_KEY) v = /** @type {number} */ (V_KEY[/** @type {keyof typeof V_KEY} */ (t)]);
	return {h, v};
}

/**
 * @param {string} raw - getComputedStyle(...).objectPosition
 * @returns {{x: number, y: number}} alignment 0..1 per axis (CSS 0%..100%)
 */
function parseObjectPosition(raw) {
	if (!raw || typeof raw !== "string") {
		return {x: 0.5, y: 0.5};
	}
	const parts = raw.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return {x: 0.5, y: 0.5};

	if (parts.length === 1) {
		const t = parts[0].toLowerCase();
		if (t.endsWith("%")) {
			const n = parseFloat(t);
			const x = Number.isFinite(n) ? clamp01(n / 100) : 0.5;
			return {x, y: 0.5};
		}
		const {h, v} = keywordHV(parts[0]);
		if (h !== null && v !== null) return {x: h, y: v};
		if (h !== null) return {x: h, y: 0.5};
		if (v !== null) return {x: 0.5, y: v};
		return {x: 0.5, y: 0.5};
	}

	const A = keywordHV(parts[0]);
	const B = keywordHV(parts[1]);
	let x = 0.5;
	let y = 0.5;

	const aH = A.h !== null;
	const aV = A.v !== null;
	const bH = B.h !== null;
	const bV = B.v !== null;

	if (aH && !aV && !bH && bV) {
		x = /** @type {number} */ (A.h);
		y = /** @type {number} */ (B.v);
	} else if (!aH && aV && bH && !bV) {
		y = /** @type {number} */ (A.v);
		x = /** @type {number} */ (B.h);
	} else if (parts[0].toLowerCase().endsWith("%") && parts[1].toLowerCase().endsWith("%")) {
		x = /** @type {number} */ (A.h);
		y = /** @type {number} */ (B.v);
	} else if (aH !== null && bH !== null && A.v === null && B.v === null) {
		x = /** @type {number} */ (A.h);
		y = /** @type {number} */ (B.h);
	} else if (A.h === null && B.h === null && aV !== null && bV !== null) {
		y = /** @type {number} */ (A.v);
		x = /** @type {number} */ (B.v);
	} else {
		x = A.h ?? A.v ?? 0.5;
		y = B.v ?? B.h ?? 0.5;
	}

	return {x: clamp01(x), y: clamp01(y)};
}

function clamp01(v) {
	if (!Number.isFinite(v)) return 0.5;
	return Math.min(1, Math.max(0, v));
}

/**
 * Clamp source rectangle to bitmap bounds and scale destination proportionally (avoids drawImage throw / trim).
 * Destination may extend past the canvas; the 2D context clips to the bitmap like the browser viewport.
 */
function clampSourceRectToBitmap(sx, sy, sw, sh, iw, ih, dx, dy, dw, dh) {
	if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return null;
	const sx1 = Math.max(0, sx);
	const sy1 = Math.max(0, sy);
	const sx2 = Math.min(iw, sx + sw);
	const sy2 = Math.min(ih, sy + sh);
	const swC = sx2 - sx1;
	const shC = sy2 - sy1;
	if (swC <= 0 || shC <= 0) return null;
	const dxAdj = dx + ((sx1 - sx) / sw) * dw;
	const dyAdj = dy + ((sy1 - sy) / sh) * dh;
	const dwAdj = (swC / sw) * dw;
	const dhAdj = (shC / sh) * dh;
	return {sx: sx1, sy: sy1, sw: swC, sh: shC, dx: dxAdj, dy: dyAdj, dw: dwAdj, dh: dhAdj};
}

/**
 * Draw element like CSS replaced content with object-fit / object-position.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLElement} el - img, video, or canvas
 * @param {DOMRect} layoutRect - getBoundingClientRect()
 * @param {CSSStyleDeclaration} computed
 * @param {number} _viewportW
 * @param {number} _viewportH
 * @returns {boolean} false if skipped (no intrinsic size yet, or fully clipped)
 */
export function drawElementLikeObjectFit(ctx, el, layoutRect, computed, _viewportW, _viewportH) {
	const source = /** @type {CanvasImageSource} */ (el);
	const dw0 = layoutRect.width;
	const dh0 = layoutRect.height;
	if (dw0 <= 0 || dh0 <= 0) return false;

	const intrinsic = getIntrinsicSize(el);
	const objectFit = (computed.objectFit || "fill").toLowerCase();
	const pos = parseObjectPosition(computed.objectPosition || "50% 50%");

	if (!intrinsic) {
		try {
			ctx.drawImage(source, layoutRect.left, layoutRect.top, dw0, dh0);
		} catch {
			return false;
		}
		return true;
	}

	const {iw, ih} = intrinsic;
	if (iw <= 0 || ih <= 0) return false;

	let sx = 0;
	let sy = 0;
	let sw = iw;
	let sh = ih;
	let dx = layoutRect.left;
	let dy = layoutRect.top;
	let dw = dw0;
	let dh = dh0;

	if (objectFit === "fill") {
		/* Stretch full bitmap to box — old compositor behavior */
	} else if (objectFit === "cover") {
		const scale = Math.max(dw / iw, dh / ih);
		const W = iw * scale;
		const H = ih * scale;
		const tx = pos.x * (W - dw);
		const ty = pos.y * (H - dh);
		sx = tx / scale;
		sy = ty / scale;
		sw = dw / scale;
		sh = dh / scale;
	} else if (objectFit === "contain" || objectFit === "scale-down") {
		let scale = Math.min(dw / iw, dh / ih);
		if (objectFit === "scale-down") {
			scale = Math.min(scale, 1);
		}
		const W = iw * scale;
		const H = ih * scale;
		const tx = pos.x * (dw - W);
		const ty = pos.y * (dh - H);
		dx = layoutRect.left + tx;
		dy = layoutRect.top + ty;
		dw = W;
		dh = H;
		sx = 0;
		sy = 0;
		sw = iw;
		sh = ih;
	} else if (objectFit === "none") {
		const tx = pos.x * (dw - iw);
		const ty = pos.y * (dh - ih);
		dx = layoutRect.left + tx;
		dy = layoutRect.top + ty;
		dw = iw;
		dh = ih;
		sx = 0;
		sy = 0;
		sw = iw;
		sh = ih;
	} else {
		/* Unknown → fill */
	}

	const plane = clampSourceRectToBitmap(sx, sy, sw, sh, iw, ih, dx, dy, dw, dh);
	if (!plane) return false;

	try {
		ctx.drawImage(source, plane.sx, plane.sy, plane.sw, plane.sh, plane.dx, plane.dy, plane.dw, plane.dh);
	} catch {
		return false;
	}
	return true;
}
