import { defineConfig } from "astro/config";

export default defineConfig({
	vite: {
		optimizeDeps: {
			include: ["locomotive-scroll", "gsap", "gsap/ScrollTrigger", "p5"]
		},
		css: {
			preprocessorOptions: {
				scss: {
					additionalData: `@use "/src/styles/_variables.scss" as *; @use "/src/styles/_mixins.scss" as *;`,
				},
			},
		},
	},
});
