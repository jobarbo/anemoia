/**
 * Lazy navigation for sketches and scene modules.
 *
 * Avoids circular static imports: scene-router dynamically imports scene modules,
 * which must not statically import scene-router (Vite returns 500 on the sketch chunk).
 *
 * @param {string} route
 * @param {Record<string, string>} [params]
 */
export function sceneNavigate(route, params = {}) {
	void import("./scene-router.js").then((m) => {
		m.getSceneRouter()?.navigateTo(route, params);
	});
}

/**
 * Returns to the previous history entry (same stack as {@link SceneRouter}'s `pushState`).
 * Used e.g. for the story reader close control so it mirrors the real navigation stack,
 * not frontmatter `returnTo`.
 */
export function sceneHistoryBack() {
	history.back();
}
