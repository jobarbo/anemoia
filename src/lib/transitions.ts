/**
 * Transitions partagées pour les view transitions Astro.
 * Modifier duration, easing et direction du slide ici.
 */
import {fade, slide} from "astro:transitions";

const duration = "1.4s";
const easing = "ease-in-out";

export const pageFade = fade({duration, ...(easing && {easing})});
export const pageSlide = slide({duration, ...(easing && {easing})});

/** Slide vertical : nouvelle page entre par le bas, ancienne sort par le haut */
export const pageSlideFromBottom = {
	forwards: {
		old: {name: "view-slide-out-to-top", duration, easing},
		new: {name: "view-slide-in-from-bottom", duration, easing},
	},
	backwards: {
		old: {name: "view-slide-out-to-bottom", duration, easing},
		new: {name: "view-slide-in-from-top", duration, easing},
	},
} as const;

/** Slide vertical : nouvelle page entre par le haut, ancienne sort par le bas */
export const pageSlideFromTop = {
	forwards: {
		old: {name: "view-slide-out-to-bottom", duration, easing},
		new: {name: "view-slide-in-from-top", duration, easing},
	},
	backwards: {
		old: {name: "view-slide-out-to-top", duration, easing},
		new: {name: "view-slide-in-from-bottom", duration, easing},
	},
} as const;
