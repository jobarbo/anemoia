/**
 * Shared utility functions
 */

/**
 * Clamp a value between a min and max
 */
export function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}
