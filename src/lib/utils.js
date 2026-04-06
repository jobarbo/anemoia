/**
 * Shared utility functions
 */

/**
 * Clamp a value between a min and max
 */
export function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

// --- Cubic Bézier evaluator (CSS timing-function style) ---
// Control points: P0=(0,0), P1=(x1,y1), P2=(x2,y2), P3=(1,1)
// Matches cubic-bezier.com / DevTools curve editor.

function _cubicBezier1D(p1, p2, t) {
	return 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
}

function _cubicBezierDerivative1D(p1, p2, t) {
	return 3 * (1 - t) * (1 - t) * p1 + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

function _solveCubicBezierT(x1, x2, x) {
	let t = x; // initial guess — good for near-linear curves
	for (let i = 0; i < 8; i++) {
		const err = _cubicBezier1D(x1, x2, t) - x;
		if (Math.abs(err) < 1e-6) break;
		const dx = _cubicBezierDerivative1D(x1, x2, t);
		if (Math.abs(dx) < 1e-9) break;
		t = clamp(t - err / dx, 0, 1);
	}
	return t;
}

/**
 * Evaluate a CSS-style cubic-bezier at progress x ∈ [0, 1].
 * cp = [x1, y1, x2, y2] — control points matching cubic-bezier() CSS syntax.
 * Returns the y value for the given x input.
 * Falls back to linear (y = x) when cp is null/invalid.
 */
export function evaluateCubicBezier(x, cp) {
	if (!cp || cp.length !== 4) return x;
	const [x1, y1, x2, y2] = cp;
	const t = _solveCubicBezierT(x1, x2, clamp(x, 0, 1));
	return _cubicBezier1D(y1, y2, t);
}
