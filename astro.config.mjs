import {defineConfig} from "astro/config";
import netlify from "@astrojs/netlify";

const watchParallaxConfig = {
	name: "watch-parallax-config",
	configureServer(server) {
		server.watcher.add("public/assets/scenes/**/parallax-config.json");
		server.watcher.on("change", (path) => {
			if (path.includes("parallax-config.json")) {
				server.ws.send({type: "full-reload"});
			}
		});
	},
};

export default defineConfig({
	adapter: netlify(),
	vite: {
		plugins: [watchParallaxConfig],
		optimizeDeps: {
			include: ["locomotive-scroll", "gsap", "gsap/ScrollTrigger", "p5", "ml5"],
		},
		server: {
			// SPA fallback: serve index.html for all unmatched routes in dev
			historyApiFallback: true,
		},
	},
});
