/**
 * @param {'fr'|'en'} locale
 */
export function nominatimAcceptLanguageHeader(locale) {
	return locale === "en" ? "en-CA,en,fr" : "fr-CA,fr,en";
}
