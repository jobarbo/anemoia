/**
 * Head tracking orchestrator: coordinates camera, orientation, and mouse fallbacks.
 * Pure logic; delegates to face-pose.js and ml5-face-mesh.js for implementation details.
 */
import {createParallaxUpdater, initMouseParallax, initParallaxFromInput} from "./parallax.js";
import {clamp} from "../lib/utils.js";
import {initMl5Source} from "./ml5-face-mesh.js";

const HEAD_TRACKING_PREFERENCE_KEY = "anemoia.headTracking.enabled";
const DEFAULT_HEAD_TRACKING_ENABLED = true;
const TRACKING_STALL_TIMEOUT_MS = 2200;
const TRACKING_WATCHDOG_INTERVAL_MS = 900;
const INVERT_HEAD_TRACKING_Y = true;
/** Pixels per second at full vertical deflection (|drive| ≈ 1). */
const HEAD_SCROLL_SPEED_PX_PER_SEC = 95;
/** Lerp/sec toward latest head Y so motion stays fluid without jitter (higher = tighter to pose). */
const HEAD_SCROLL_DRIVE_SMOOTHING = 18;

function isCoarsePointerDevice() {
	return window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
}

function readHeadTrackingPreference() {
	try {
		const raw = localStorage.getItem(HEAD_TRACKING_PREFERENCE_KEY);
		if (raw === null) return DEFAULT_HEAD_TRACKING_ENABLED;
		return raw === "true";
	} catch {
		return DEFAULT_HEAD_TRACKING_ENABLED;
	}
}

export function setHeadTrackingPreference(enabled) {
	try {
		localStorage.setItem(HEAD_TRACKING_PREFERENCE_KEY, String(Boolean(enabled)));
	} catch {
		// Ignore storage errors (private mode, disabled storage, etc.)
	}
}

/**
 * Smooth continuous scroll from sustained gaze: velocity ∝ vertical parallax drive (~−1..1).
 * "Look up / sky" keeps scrolling until you return to neutral.
 */
function createHeadScrollLoop(scrollContainer) {
	let targetDrive = 0;
	let smoothedDrive = 0;
	let rafId = null;
	let lastTs = 0;
	let running = false;

	const tick = (now) => {
		if (!running) return;

		if (!lastTs) lastTs = now;
		const rawDt = (now - lastTs) / 1000;
		lastTs = now;
		// Cap step after tab backgrounding so scroll doesn't jump.
		const dt = Math.min(0.064, rawDt);

		const t = Math.min(1, HEAD_SCROLL_DRIVE_SMOOTHING * dt);
		smoothedDrive += (targetDrive - smoothedDrive) * t;

		const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
		if (maxScroll > 0 && Math.abs(smoothedDrive) > 1e-6) {
			// Negated so "look up" (positive parallaxNormY after invert) decreases scrollTop.
			const delta = -smoothedDrive * HEAD_SCROLL_SPEED_PX_PER_SEC * dt;
			scrollContainer.scrollTop = clamp(scrollContainer.scrollTop + delta, 0, maxScroll);
		}

		rafId = requestAnimationFrame(tick);
	};

	return {
		setDrive(parallaxNormY) {
			targetDrive = clamp(parallaxNormY, -1, 1);
		},
		start() {
			if (running) return;
			running = true;
			lastTs = 0;
			rafId = requestAnimationFrame(tick);
		},
		stop() {
			running = false;
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
			lastTs = 0;
			targetDrive = 0;
			smoothedDrive = 0;
		},
	};
}

async function initMl5Parallax(layers, onModeChange, scrollDriver) {
	const updateParallax = createParallaxUpdater(layers);
	let stopped = false;
	let sourceCleanup = () => {};
	let restartPromise = null;
	let watchdogId = null;
	let lastPoseAt = performance.now();

	const onMove = (x, y) => {
		lastPoseAt = performance.now();
		const parallaxNormY = INVERT_HEAD_TRACKING_Y ? -y : y;
		updateParallax(x, parallaxNormY);
		scrollDriver?.setDrive(parallaxNormY);
	};

	const startSource = async () => {
		sourceCleanup = await initMl5Source(onMove);
		lastPoseAt = performance.now();
		onModeChange?.("camera");
	};

	const restartSource = async () => {
		if (stopped) return;
		if (restartPromise) return restartPromise;

		restartPromise = (async () => {
			try {
				sourceCleanup();
			} catch {
				// Ignore cleanup errors before restart.
			}
			sourceCleanup = () => {};
			await startSource();
		})().finally(() => {
			restartPromise = null;
		});

		return restartPromise;
	};

	await startSource();

	watchdogId = window.setInterval(() => {
		if (stopped || restartPromise) return;
		const staleFor = performance.now() - lastPoseAt;
		if (staleFor > TRACKING_STALL_TIMEOUT_MS) {
			restartSource().catch(() => {
				// Keep fallback handling in outer flow; swallow internal restart errors.
			});
		}
	}, TRACKING_WATCHDOG_INTERVAL_MS);

	return () => {
		stopped = true;
		if (watchdogId !== null) {
			window.clearInterval(watchdogId);
		}
		if (restartPromise) {
			restartPromise.catch(() => {
				// Ignore in-flight restart errors during teardown.
			});
		}
		sourceCleanup();
	};
}

function initDeviceOrientationSource(onMove) {
	if (typeof window === "undefined" || typeof window.DeviceOrientationEvent === "undefined") {
		return null;
	}

	if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
		// iOS requires a user gesture; auto-start mode cannot prompt here.
		return null;
	}

	function normalizeAxis(value) {
		const deadzone = 0.04;
		if (Math.abs(value) < deadzone) {
			return 0;
		}
		return clamp(value, -1, 1);
	}

	const handleOrientation = (event) => {
		const rawX = (event.gamma ?? 0) / 35;
		const rawY = (event.beta ?? 0) / 50;
		onMove(normalizeAxis(rawX), normalizeAxis(rawY));
	};

	window.addEventListener("deviceorientation", handleOrientation, {passive: true});

	return () => {
		window.removeEventListener("deviceorientation", handleOrientation);
	};
}

export async function initHeadTrackingParallax(layers, options = {}) {
	const {allowDeviceOrientationFallback = true, allowMouseFallback = true, onModeChange, scrollContainer = null} = options;

	if (!readHeadTrackingPreference()) {
		onModeChange?.("disabled");
		return allowMouseFallback ? initMouseParallax(layers) : () => {};
	}

	const scrollDriver = scrollContainer ? createHeadScrollLoop(scrollContainer) : null;
	scrollDriver?.start();

	try {
		const innerCleanup = await initMl5Parallax(layers, onModeChange, scrollDriver);
		return () => {
			innerCleanup();
			scrollDriver?.stop();
		};
	} catch {
		// Continue to fallbacks below.
	}

	if (allowDeviceOrientationFallback && isCoarsePointerDevice()) {
		const cleanup = initParallaxFromInput(layers, (updateParallax) =>
			initDeviceOrientationSource((x, y) => {
				updateParallax(x, y);
				scrollDriver?.setDrive(y);
			}),
		);
		onModeChange?.("orientation");
		return () => {
			if (typeof cleanup === "function") cleanup();
			scrollDriver?.stop();
		};
	}

	if (allowMouseFallback) {
		onModeChange?.("mouse");
		scrollDriver?.stop();
		return initMouseParallax(layers);
	}

	scrollDriver?.stop();
	onModeChange?.("none");
	return () => {};
}
