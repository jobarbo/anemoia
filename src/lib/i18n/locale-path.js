/**
 * URL helpers for default locale (fr, no prefix) vs English (/en/...).
 * Safe to import from Astro frontmatter (no DOM).
 */

/** @param {string} pathname */
export function parseGamePathname(pathname) {
	let p = pathname || "/";
	if (!p.startsWith("/")) p = `/${p}`;
	let locale = "fr";
	if (p === "/en" || p.startsWith("/en/")) {
		locale = "en";
		p = p === "/en" ? "/" : p.slice(3) || "/";
	}
	if (!p.startsWith("/")) p = `/${p}`;
	return {locale, logicalPath: p};
}

/**
 * @param {string} logicalPath - e.g. /desktop, /story/foo
 * @param {'fr'|'en'} locale
 */
export function toBrowserPath(logicalPath, locale) {
	let path = logicalPath || "/";
	if (!path.startsWith("/")) path = `/${path}`;
	if (locale === "en") {
		if (path === "/") return "/en/";
		return `/en${path}`;
	}
	return path;
}

/**
 * @param {string} pathname - current location.pathname
 * @param {'fr'|'en'} targetLocale
 */
export function localizedHref(pathname, targetLocale) {
	const {logicalPath} = parseGamePathname(pathname);
	return toBrowserPath(logicalPath, targetLocale);
}

/**
 * Updates lang switch anchors after client-side route changes.
 */
export function syncLangSwitchAnchors() {
	if (typeof document === "undefined") return;
	const fr = document.getElementById("lang-switch-fr");
	const en = document.getElementById("lang-switch-en");
	if (!fr || !en) return;
	const path = location.pathname;
	fr.setAttribute("href", localizedHref(path, "fr"));
	en.setAttribute("href", localizedHref(path, "en"));
}
