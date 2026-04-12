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
