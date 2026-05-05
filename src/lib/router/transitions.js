/**
 * Shared transitions for Astro view transitions.
 * Modify duration, easing and slide direction here.
 */
import {fade, slide} from "astro:transitions";

const duration = "1.4s";
const easing = "ease-in-out";

export const pageFade = fade({duration, ...(easing && {easing})});
export const pageSlide = slide({duration, ...(easing && {easing})});

/** Vertical slide: new page enters from the bottom, old page exits to the top */
export const pageSlideFromBottom = {
	forwards: {
		old: {name: "view-slide-out-to-top", duration, easing},
		new: {name: "view-slide-in-from-bottom", duration, easing},
	},
	backwards: {
		old: {name: "view-slide-out-to-bottom", duration, easing},
		new: {name: "view-slide-in-from-top", duration, easing},
	},
};

/** Vertical slide: new page enters from the top, old page exits to the bottom */
export const pageSlideFromTop = {
	forwards: {
		old: {name: "view-slide-out-to-bottom", duration, easing},
		new: {name: "view-slide-in-from-top", duration, easing},
	},
	backwards: {
		old: {name: "view-slide-out-to-top", duration, easing},
		new: {name: "view-slide-in-from-bottom", duration, easing},
	},
};
