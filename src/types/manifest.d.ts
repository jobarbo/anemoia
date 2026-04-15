export interface LayerPosition {
	centerLeft: number;
	centerTop: number;
	width: number;
	height: number;
}

export interface LayerInteraction {
	type: "navigate" | "state";
	target: string;
	hoverImage: string | null;
}

export interface LayerEffectAttachment {
	sketch: string;
	mode?: "recopie" | "overlay";
	enabled?: boolean;
	opacity?: number;
	mixBlendMode?: string;
	zOffset?: number;
}

export type SceneShaderEffects = Record<string, Record<string, unknown>>;
export interface SceneSketchAttachment {
	sketch: string;
	slot?: string;
	enabled?: boolean;
	data?: Record<string, unknown>;
}

export interface SceneLayer {
	name: string;
	file: string;
	zIndex: number;
	position: LayerPosition;
	parallaxSpeed?: number;
	opacity?: number;
	blendMode?: string;
	clipped?: boolean;
	clippedTo?: string;
	interactive?: boolean;
	interaction?: LayerInteraction;
}

export interface SceneManifest {
	canvas: { width: number; height: number };
	layers: SceneLayer[];
	layerEffects?: Record<string, LayerEffectAttachment[]>;
	sceneEffects?: SceneShaderEffects;
	sceneSketches?: SceneSketchAttachment[];
	/**
	 * Optional scene-level depth curve controlling how parallax speed is distributed
	 * across the layer stack (background → foreground).
	 * CSS cubic-bezier control points [x1, y1, x2, y2].
	 * Defined in scene-config.json under parallaxConfig (legacy: parallax-config.json).
	 * Omit or null → falls back to the built-in power curve (Math.pow(depth, 2.2)).
	 */
	depthCurve?: SpeedCurve | null;
	/**
	 * Independent depth curve for vertical scroll parallax.
	 * Falls back to depthCurve if not set.
	 * Use to give scroll a different feel from head/mouse tracking (e.g. height and scale).
	 */
	scrollDepthCurve?: SpeedCurve | null;
}
