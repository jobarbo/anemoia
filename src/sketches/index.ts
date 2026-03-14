/**
 * Registry of sketch names → dynamic import.
 * Add new sketches here; then use <SketchCanvas sketch="your-name" />.
 */
import type p5 from "p5";

export type SketchFactory = (container: HTMLElement) => (sketch: p5) => void;

const sketchLoaders: Record<string, () => Promise<{ default: SketchFactory }>> = {
	snow: () => import("./snow"),
};

export function getSketchLoader(name: string): Promise<{ default: SketchFactory }> | null {
	return name in sketchLoaders ? sketchLoaders[name]!() : null;
}

export function getKnownSketchNames(): string[] {
	return Object.keys(sketchLoaders);
}
