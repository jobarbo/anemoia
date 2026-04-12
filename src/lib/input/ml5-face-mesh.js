/**
 * ML5 face mesh camera adapter.
 * Initializes camera, loads model, runs detection loop.
 * Accepts an onMove callback to report detected poses.
 */
import {extractNormalizedPose, smoothPose} from "./face-pose.js";

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

export {initMl5Source};
