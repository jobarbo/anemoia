function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function isFinePointerDevice() {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
	return window.matchMedia("(pointer: fine)").matches;
}

const POINTER_LOCK_PREFERENCE_KEY = "anemoia:pointer-lock-preferred";

function readPointerLockPreference() {
	if (typeof window === "undefined") return false;
	try {
		return window.sessionStorage.getItem(POINTER_LOCK_PREFERENCE_KEY) === "1";
	} catch {
		return false;
	}
}

function writePointerLockPreference(preferred) {
	if (typeof window === "undefined") return;
	try {
		if (preferred) {
			window.sessionStorage.setItem(POINTER_LOCK_PREFERENCE_KEY, "1");
		} else {
			window.sessionStorage.removeItem(POINTER_LOCK_PREFERENCE_KEY);
		}
	} catch {
		// Ignore storage failures (private mode, blocked storage, etc.)
	}
}

const pointerLockPreference = {
	wantsLock: readPointerLockPreference(),
	escListenerBound: false,
};

function bindEscapePreferenceListener() {
	if (pointerLockPreference.escListenerBound || typeof document === "undefined") return;
	pointerLockPreference.escListenerBound = true;
	document.addEventListener("keydown", (e) => {
		if (e.key !== "Escape") return;
		pointerLockPreference.wantsLock = false;
		writePointerLockPreference(false);
	});
}

/**
 * Track a software cursor position in canvas space and optionally lock
 * the pointer to the canvas (FPS-style). Escape exits lock natively.
 *
 * @param {{
 *   canvasEl: HTMLCanvasElement,
 *   lockOnClick?: boolean,
 * }} options
 */
export function createCanvasCursor(options) {
	const {canvasEl, lockOnClick = true} = options;

	function requestPointerLockSafely() {
		if (!canvasEl || typeof canvasEl.requestPointerLock !== "function") return;
		if (!canvasEl.isConnected) return;
		if (canvasEl.ownerDocument !== document) return;
		if (document.pointerLockElement === canvasEl) return;
		try {
			const maybePromise = canvasEl.requestPointerLock();
			if (maybePromise && typeof maybePromise.catch === "function") {
				maybePromise.catch(() => {
					// Ignore pointer-lock failures during scene swaps or browser restrictions.
				});
			}
		} catch {
			// Ignore pointer-lock failures during scene swaps or browser restrictions.
		}
	}

	let canvasW = 1;
	let canvasH = 1;
	let x = 0;
	let y = 0;
	let hasPosition = false;
	let insideCanvas = false;
	const finePointer = isFinePointerDevice();

	const state = {
		locked: false,
	};

	bindEscapePreferenceListener();

	let didAutoRelockAttempt = false;

	function tryRestorePointerLock() {
		if (!finePointer || !lockOnClick) return;
		if (!pointerLockPreference.wantsLock) return;
		if (document.pointerLockElement === canvasEl) return;
		requestPointerLockSafely();
	}

	function syncFromClient(clientX, clientY) {
		const rect = canvasEl.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;
		const nx = (clientX - rect.left) / rect.width;
		const ny = (clientY - rect.top) / rect.height;
		x = clamp(nx * canvasW, 0, canvasW);
		y = clamp(ny * canvasH, 0, canvasH);
		hasPosition = true;
	}

	/** @param {MouseEvent} e */
	function onCanvasMouseDown(e) {
		if (!finePointer) return;
		// Only sync from client coords when NOT locked — during pointer lock,
		// clientX/clientY are frozen to the lock-engagement position and would
		// snap the software cursor back to that stale position on every click.
		if (document.pointerLockElement !== canvasEl) {
			syncFromClient(e.clientX, e.clientY);
		}
		insideCanvas = true;
		if (!lockOnClick || e.button !== 0) return;
		pointerLockPreference.wantsLock = true;
		writePointerLockPreference(true);
		if (document.pointerLockElement === canvasEl) return;
		requestPointerLockSafely();
	}

	/** @param {MouseEvent} e */
	function onWindowMouseMove(e) {
		if (!finePointer) return;
		if (document.pointerLockElement === canvasEl) {
			x = clamp(x + e.movementX, 0, canvasW);
			y = clamp(y + e.movementY, 0, canvasH);
			hasPosition = true;
			insideCanvas = true;
		}
	}

	function onPointerLockChange() {
		state.locked = document.pointerLockElement === canvasEl;
		if (state.locked) {
			pointerLockPreference.wantsLock = true;
			writePointerLockPreference(true);
		}
	}

	canvasEl.addEventListener("mousedown", onCanvasMouseDown);
	window.addEventListener("mousemove", onWindowMouseMove);
	document.addEventListener("pointerlockchange", onPointerLockChange);

	return {
		/**
		 * @param {{
		 *   mouseX: number,
		 *   mouseY: number,
		 *   width: number,
		 *   height: number,
		 * }} frame
		 */
		beginFrame(frame) {
			canvasW = Math.max(1, frame.width);
			canvasH = Math.max(1, frame.height);

			if (!didAutoRelockAttempt) {
				didAutoRelockAttempt = true;
				tryRestorePointerLock();
			}

			if (!hasPosition) {
				x = canvasW * 0.5;
				y = canvasH * 0.5;
				hasPosition = true;
			}

			if (!state.locked && finePointer) {
				const validMouse = Number.isFinite(frame.mouseX) && Number.isFinite(frame.mouseY);
				if (validMouse) {
					insideCanvas = frame.mouseX >= 0 && frame.mouseX <= canvasW && frame.mouseY >= 0 && frame.mouseY <= canvasH;
					x = clamp(frame.mouseX, 0, canvasW);
					y = clamp(frame.mouseY, 0, canvasH);
				}
			}

			return {
				x,
				y,
				insideCanvas,
				locked: state.locked,
				visible: finePointer && hasPosition,
			};
		},

		isLocked() {
			return state.locked;
		},

		destroy() {
			canvasEl.removeEventListener("mousedown", onCanvasMouseDown);
			window.removeEventListener("mousemove", onWindowMouseMove);
			document.removeEventListener("pointerlockchange", onPointerLockChange);
		},
	};
}

const CURSOR_SPRITES = {
	initialized: false,
	normal: null,
	hover: null,
};

function colorizeForTheme(svgContent) {
	if (!svgContent) return svgContent;
	const orange = "rgb(255, 155, 82)";
	return svgContent
		.replace(/#1C274C|#000000/g, orange)
		.replace(/fill=[\"']?#?1C274C[\"']?/g, `fill="${orange}"`)
		.replace(/fill=[\"']?#?000000[\"']?/g, `fill="${orange}"`);
}

async function loadSvgFile(path) {
	if (typeof Image === "undefined") return null;
	try {
		const response = await fetch(path);
		if (!response.ok) return null;
		const svgText = await response.text();
		const colorized = colorizeForTheme(svgText);
		const image = new Image();
		image.decoding = "async";
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colorized)}`;
		return image;
	} catch (e) {
		console.warn(`[canvas-cursor] Failed to load SVG from ${path}:`, e);
		return null;
	}
}

async function ensureCursorSprites() {
	if (CURSOR_SPRITES.initialized) return;
	CURSOR_SPRITES.initialized = true;
	try {
		CURSOR_SPRITES.normal = await loadSvgFile("/assets/svg/cursor.svg");
		CURSOR_SPRITES.hover = await loadSvgFile("/assets/svg/pointer.svg");
	} catch (e) {
		console.warn("[canvas-cursor] Failed to initialize sprites", e);
	}
}

/**
 * Draw retro software cursor in canvas space.
 *
 * @param {import('p5').Graphics} buf
 * @param {{ x: number, y: number, visible?: boolean }} pointer
 * @param {{ hovered?: boolean }} [options]
 */
export function drawCanvasCursor(buf, pointer, options = {}) {
	if (!pointer || pointer.visible === false) return;
	const {hovered = false} = options;

	if (!CURSOR_SPRITES.initialized) {
		void ensureCursorSprites();
	}

	const sprite_state = hovered ? "hover" : "normal";
	const sprite = hovered ? CURSOR_SPRITES.hover : CURSOR_SPRITES.normal;
	const size = hovered ? 40 : 40;

	if (sprite && sprite.complete && sprite.naturalWidth > 0) {
		buf.push();
		if (sprite_state === "normal") {
			buf.drawingContext.drawImage(sprite, pointer.x - 7, pointer.y - 7, size, size);
		} else {
			buf.drawingContext.drawImage(sprite, pointer.x - 15, pointer.y - 4, size, size);
		}
		buf.pop();
		return;
	}
}
