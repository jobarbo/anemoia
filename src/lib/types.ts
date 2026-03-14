export interface LayerPosition {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface Interaction {
	type: "navigate" | "state";
	target?: string;
	hoverImage?: string | null;
}

export interface Layer {
	name: string;
	file: string;
	zIndex: number;
	position: LayerPosition;
	parallaxSpeed: number;
	interactive: boolean;
	interaction?: Interaction;
	type?: "image" | "video";
}

export interface SceneManifest {
	canvas: { width: number; height: number };
	layers: Layer[];
}
