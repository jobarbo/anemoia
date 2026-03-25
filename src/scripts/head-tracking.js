import {createParallaxUpdater, initMouseParallax, initParallaxFromInput} from "./parallax.js";

const HEAD_TRACKING_PREFERENCE_KEY = "anemoia.headTracking.enabled";
const DEFAULT_HEAD_TRACKING_ENABLED = true;
const LANDMARK_SMOOTHING = 0.2;
const DEADZONE = 0.04;
const TRACKING_STALL_TIMEOUT_MS = 2200;
const TRACKING_WATCHDOG_INTERVAL_MS = 900;
const INVERT_HEAD_TRACKING_Y = true;

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function normalizeAxis(value) {
	if (Math.abs(value) < DEADZONE) {
		return 0;
	}
	return clamp(value, -1, 1);
}

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

function getVideoPoint(point) {
	try {
		if (!point) return null;
		if (typeof point.dataSync === "function") {
			const values = Array.from(point.dataSync());
			if (values.length >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1])) {
				return {x: values[0], y: values[1]};
			}
		}
		if (Array.isArray(point)) {
			if (point.length === 0) return null;
			if (Array.isArray(point[0])) {
				return getVideoPoint(point[0]);
			}
			if (point[0] && typeof point[0].dataSync === "function") {
				return getVideoPoint(point[0]);
			}
			if (Number.isFinite(point[0]) && Number.isFinite(point[1])) {
				return {x: point[0], y: point[1]};
			}
			return null;
		}
		if (typeof point.x === "number" && typeof point.y === "number") {
			return {x: point.x, y: point.y};
		}
		if (Number.isFinite(point[0]) && Number.isFinite(point[1])) {
			return {x: point[0], y: point[1]};
		}
		return null;
	} catch {
		// Some ml5 payload entries can reference tensors that are already disposed.
		return null;
	}
}

function toVideoPixelPoint(point, video) {
	if (!point) return null;
	const hasVideoSize = Boolean(video?.videoWidth && video?.videoHeight);
	if (!hasVideoSize) return point;
	if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

	const x = point.x;
	const y = point.y;

	const isZeroOne = x >= 0 && x <= 1 && y >= 0 && y <= 1;
	if (isZeroOne) {
		return {
			x: x * video.videoWidth,
			y: y * video.videoHeight,
		};
	}

	const isSignedOne = x >= -1 && x <= 1 && y >= -1 && y <= 1;
	if (isSignedOne) {
		return {
			x: ((x + 1) / 2) * video.videoWidth,
			y: ((y + 1) / 2) * video.videoHeight,
		};
	}

	const isPercent = x >= 0 && x <= 100 && y >= 0 && y <= 100;
	if (isPercent) {
		return {
			x: (x / 100) * video.videoWidth,
			y: (y / 100) * video.videoHeight,
		};
	}

	return {x, y};
}

function getMeshPoints(face, video) {
	const keypoints = face?.keypoints || face?.scaledMesh || face?.landmarks;
	if (!Array.isArray(keypoints)) return [];
	return keypoints.map((entry) => toVideoPixelPoint(getVideoPoint(entry), video)).filter(Boolean);
}

function getBoxCenterPoint(box, video) {
	if (!box) return null;

	const topLeft = toVideoPixelPoint(getVideoPoint(box.topLeft), video);
	const bottomRight = toVideoPixelPoint(getVideoPoint(box.bottomRight), video);
	if (topLeft && bottomRight) {
		return {
			x: (topLeft.x + bottomRight.x) / 2,
			y: (topLeft.y + bottomRight.y) / 2,
		};
	}

	const startPoint = toVideoPixelPoint(getVideoPoint(box.startPoint), video);
	const endPoint = toVideoPixelPoint(getVideoPoint(box.endPoint), video);
	if (startPoint && endPoint) {
		return {
			x: (startPoint.x + endPoint.x) / 2,
			y: (startPoint.y + endPoint.y) / 2,
		};
	}

	const minXRaw = box.xMin ?? box.left ?? box.x1;
	const maxXRaw = box.xMax ?? box.right ?? box.x2;
	const minYRaw = box.yMin ?? box.top ?? box.y1;
	const maxYRaw = box.yMax ?? box.bottom ?? box.y2;

	if (Number.isFinite(minXRaw) && Number.isFinite(maxXRaw) && Number.isFinite(minYRaw) && Number.isFinite(maxYRaw)) {
		const minPoint = toVideoPixelPoint({x: minXRaw, y: minYRaw}, video);
		const maxPoint = toVideoPixelPoint({x: maxXRaw, y: maxYRaw}, video);
		if (minPoint && maxPoint) {
			return {
				x: (minPoint.x + maxPoint.x) / 2,
				y: (minPoint.y + maxPoint.y) / 2,
			};
		}
	}

	const widthRaw = box.width ?? box.w;
	const heightRaw = box.height ?? box.h;
	const xRaw = box.x ?? box.xMin ?? box.left;
	const yRaw = box.y ?? box.yMin ?? box.top;

	if (Number.isFinite(widthRaw) && Number.isFinite(heightRaw) && Number.isFinite(xRaw) && Number.isFinite(yRaw)) {
		const start = toVideoPixelPoint({x: xRaw, y: yRaw}, video);
		const size = toVideoPixelPoint({x: widthRaw, y: heightRaw}, video);
		if (start && size) {
			return {
				x: start.x + size.x / 2,
				y: start.y + size.y / 2,
			};
		}
	}

	return null;
}

function getFacePoints(face, video) {
	const meshPoints = getMeshPoints(face, video);
	if (meshPoints.length > 264) {
		const keypoints = face?.keypoints || face?.scaledMesh || face?.landmarks;
		const indexedNose = toVideoPixelPoint(getVideoPoint(keypoints[1]) || getVideoPoint(keypoints[4]), video);
		const leftEye = toVideoPixelPoint(getVideoPoint(keypoints[33]), video);
		const rightEye = toVideoPixelPoint(getVideoPoint(keypoints[263]), video);

		let nose = indexedNose;
		if (!nose && Array.isArray(face?.annotations?.noseTip) && face.annotations.noseTip.length > 0) {
			nose = toVideoPixelPoint(getVideoPoint(face.annotations.noseTip[0]), video);
		}

		if (!nose) {
			const minX = Math.min(...meshPoints.map((p) => p.x));
			const maxX = Math.max(...meshPoints.map((p) => p.x));
			const minY = Math.min(...meshPoints.map((p) => p.y));
			const maxY = Math.max(...meshPoints.map((p) => p.y));
			nose = {x: (minX + maxX) / 2, y: (minY + maxY) / 2};
		}

		return {nose, leftEye, rightEye};
	}

	const box = face?.box || face?.boundingBox;
	if (!box) return {nose: null, leftEye: null, rightEye: null};
	const boxCenter = getBoxCenterPoint(box, video);

	return {
		nose: boxCenter,
		leftEye: null,
		rightEye: null,
	};
}

function extractNormalizedPose(face, video) {
	const {nose, leftEye, rightEye} = getFacePoints(face, video);
	if (!nose || !video.videoWidth || !video.videoHeight) {
		return null;
	}

	const centerX = (nose.x / video.videoWidth - 0.5) * 2;
	const centerY = (nose.y / video.videoHeight - 0.5) * 2;

	let yawBias = 0;
	if (leftEye && rightEye) {
		const eyeMidX = (leftEye.x + rightEye.x) / 2;
		yawBias = ((nose.x - eyeMidX) / video.videoWidth) * 4;
	}

	return {
		x: normalizeAxis(centerX + yawBias),
		y: normalizeAxis(centerY),
	};
}

function smoothPose(previousPose, nextPose) {
	if (!nextPose) return previousPose;
	if (!previousPose) return nextPose;

	return {
		x: previousPose.x + (nextPose.x - previousPose.x) * LANDMARK_SMOOTHING,
		y: previousPose.y + (nextPose.y - previousPose.y) * LANDMARK_SMOOTHING,
	};
}

async function initMl5Source(onMove) {
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error("Camera API is not available.");
	}

	const stream = await navigator.mediaDevices.getUserMedia({
		audio: false,
		video: {facingMode: "user"},
	});

	const video = document.createElement("video");
	video.setAttribute("playsinline", "true");
	video.muted = true;
	video.autoplay = true;
	video.srcObject = stream;
	await video.play();

	const ml5Module = await import("ml5");
	const ml5 = ml5Module.default ?? ml5Module;
	const createFaceMesh = ml5.faceMesh ?? ml5.facemesh;
	if (typeof createFaceMesh !== "function") {
		throw new Error("ml5 face mesh API is unavailable.");
	}

	const faceMeshOptions = {
		maxFaces: 1,
		refineLandmarks: true,
		flipHorizontal: false,
		debug: true,
	};
	const {debug: enableDebugCanvas, ...modelOptions} = faceMeshOptions;

	let model = createFaceMesh(video, modelOptions);

	if (model && typeof model.then === "function") {
		model = await model;
	}

	if (!model) {
		throw new Error("ml5 face mesh model did not initialize.");
	}

	let rafId = null;
	let lastPose = null;
	let stopped = false;
	let unsubscribePredictions = () => {};

	const handleUnhandledRejection = (event) => {
		const reason = event?.reason;
		const message = String(reason?.message ?? reason ?? "");
		if (message.includes("Tensor is disposed")) {
			// Known transient ml5/tfjs race during webcam frame processing.
			event.preventDefault();
		}
	};

	window.addEventListener("unhandledrejection", handleUnhandledRejection);

	const handleResults = (results) => {
		if (stopped) return;
		try {
			const firstFace = Array.isArray(results) ? results[0] : null;
			const nextPose = extractNormalizedPose(firstFace, video);
			lastPose = smoothPose(lastPose, nextPose);
			if (lastPose) {
				onMove(lastPose.x, lastPose.y);
				if (enableDebugCanvas) {
					window.__htDebug?.(video, lastPose.x, lastPose.y);
				}
			}
		} catch {
			// Ignore transient inference payload errors and keep the tracker alive.
		}
	};

	if (typeof model.detect === "function") {
		const detectOnce = async () => {
			if (stopped) return;
			try {
				const results = await model.detect(video);
				handleResults(results);
			} catch {
				// Ignore intermittent detection errors and continue.
			}
			rafId = requestAnimationFrame(detectOnce);
		};

		rafId = requestAnimationFrame(detectOnce);
	} else if (typeof model.on === "function") {
		const eventName = "predict";
		const handlePredict = (results) => handleResults(results);
		model.on(eventName, handlePredict);
		unsubscribePredictions = () => {
			if (typeof model.removeListener === "function") {
				model.removeListener(eventName, handlePredict);
			}
			if (typeof model.off === "function") {
				model.off(eventName, handlePredict);
			}
		};
	} else {
		throw new Error("Unsupported ml5 face mesh API shape.");
	}

	return () => {
		stopped = true;
		window.removeEventListener("unhandledrejection", handleUnhandledRejection);
		unsubscribePredictions();
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
		}
		if (typeof model.stop === "function") {
			model.stop();
		}
		stream.getTracks().forEach((track) => track.stop());
		video.srcObject = null;
	};
}

async function initMl5Parallax(layers, onModeChange) {
	const updateParallax = createParallaxUpdater(layers);
	let stopped = false;
	let sourceCleanup = () => {};
	let restartPromise = null;
	let watchdogId = null;
	let lastPoseAt = performance.now();

	const onMove = (x, y) => {
		lastPoseAt = performance.now();
		updateParallax(x, INVERT_HEAD_TRACKING_Y ? -y : y);
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
	const {allowDeviceOrientationFallback = true, allowMouseFallback = true, onModeChange} = options;

	if (!readHeadTrackingPreference()) {
		onModeChange?.("disabled");
		return allowMouseFallback ? initMouseParallax(layers) : () => {};
	}

	try {
		return await initMl5Parallax(layers, onModeChange);
	} catch {
		// Continue to fallbacks below.
	}

	if (allowDeviceOrientationFallback && isCoarsePointerDevice()) {
		const cleanup = initParallaxFromInput(layers, (onMove) => initDeviceOrientationSource(onMove));
		onModeChange?.("orientation");
		return cleanup;
	}

	if (allowMouseFallback) {
		onModeChange?.("mouse");
		return initMouseParallax(layers);
	}

	onModeChange?.("none");
	return () => {};
}
