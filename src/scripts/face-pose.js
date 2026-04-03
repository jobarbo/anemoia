/**
 * Pure pose extraction from ML5 face detection results.
 * No DOM side effects, no ml5 dependencies.
 */
import {clamp} from "../lib/utils.js";

const LANDMARK_SMOOTHING = 0.2;
const DEADZONE = 0.04;

function normalizeAxis(value) {
	if (Math.abs(value) < DEADZONE) {
		return 0;
	}
	return clamp(value, -1, 1);
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

export function extractNormalizedPose(face, video) {
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

export function smoothPose(previousPose, nextPose) {
	if (!nextPose) return previousPose;
	if (!previousPose) return nextPose;

	return {
		x: previousPose.x + (nextPose.x - previousPose.x) * LANDMARK_SMOOTHING,
		y: previousPose.y + (nextPose.y - previousPose.y) * LANDMARK_SMOOTHING,
	};
}
