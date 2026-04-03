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
}
