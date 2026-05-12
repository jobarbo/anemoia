/**
 * Calendrier de l'ère REM (Révolution Écolomobiliste)
 *
 * Formats supportes :
 * - "Busedi, 12 Reveillase, an 4 REM"
 * - "Reveillase 12, Year 4 After REM"
 */

/** Mois dans l'ordre chronologique (index 0 = premier mois de l'an). */
export const MONTHS = ["Reveillase", "Nevrose", "Sucriene", "Slochimene", "Esperance", "Sainhanbatis", "Caniculasse", "Humidase", "Feuillandre", "Macabrase", "Griseille", "Bacaisse"];

/** Jours dans l'ordre chronologique (registre du transport). */
export const DAYS = ["Tramedi", "Vélocredi", "Métreudi", "Piétonnedi", "Busedi", "Covoituredi", "Triportanche"];

/**
 * Parse une date REM en valeurs numériques comparables.
 *
 * @param {string | null | undefined} dateStr
 * @returns {{ year: number, monthIndex: number, day: number, dayIndex: number } | null}
 */
export function parseRemDate(dateStr) {
	if (!dateStr) return null;

	const legacyMatch = dateStr.match(/^(\S+),\s*(\d+)\s+(\S+),\s*an\s+(\d+)\s+REM$/i);
	const englishMatch = dateStr.match(/^(?:(\S+),\s*)?(\S+)\s+(\d+),\s*Year\s+(\d+)\s+After\s+REM$/i);
	/** e.g. "Busedi, Reveillase 12, Année 4 Après REM" */
	const frAfterMatch = dateStr.match(/^(\S+),\s*(\S+)\s+(\d+),\s*Année\s+(\d+)\s+Après\s+REM$/i);
	if (!legacyMatch && !englishMatch && !frAfterMatch) return null;

	const dayName = legacyMatch?.[1] ?? englishMatch?.[1] ?? frAfterMatch?.[1] ?? null;
	const dayNumStr = legacyMatch?.[2] ?? englishMatch?.[3] ?? frAfterMatch?.[3];
	const monthName = legacyMatch?.[3] ?? englishMatch?.[2] ?? frAfterMatch?.[2];
	const yearStr = legacyMatch?.[4] ?? englishMatch?.[4] ?? frAfterMatch?.[4];

	const dayIndex = dayName ? DAYS.findIndex((d) => d.toLowerCase() === dayName.toLowerCase()) : 0;
	const monthIndex = MONTHS.findIndex((m) => m.toLowerCase() === monthName.toLowerCase());

	if (monthIndex === -1) return null;

	return {
		year: parseInt(yearStr, 10),
		monthIndex,
		day: parseInt(dayNumStr, 10),
		dayIndex: dayIndex === -1 ? 0 : dayIndex,
	};
}

/**
 * Canonical REM date string for UI (story subtitle), localized.
 * Falls back to the raw string if parsing fails.
 *
 * @param {string | null | undefined} dateStr
 * @param {'fr'|'en'} locale
 * @returns {string}
 */
export function formatRemDateForDisplay(dateStr, locale) {
	if (!dateStr) return "";
	const p = parseRemDate(dateStr);
	if (!p) return String(dateStr);
	const dayLabel = DAYS[p.dayIndex] ?? DAYS[0];
	const monthLabel = MONTHS[p.monthIndex] ?? "";
	if (locale === "en") {
		return `${dayLabel}, ${monthLabel} ${p.day}, Year ${p.year} After REM`;
	}
	return `${dayLabel}, ${monthLabel} ${p.day}, Année ${p.year} Après REM`;
}

/**
 * Compare deux strings de date REM pour Array.sort().
 * Retourne un nombre négatif, zéro, ou positif.
 * Si l'une des dates est invalide, retourne 0 (ordre stable).
 *
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {number}
 */
export function compareRemDates(a, b) {
	const da = parseRemDate(a);
	const db = parseRemDate(b);

	if (!da || !db) return 0;

	if (da.year !== db.year) return da.year - db.year;
	if (da.monthIndex !== db.monthIndex) return da.monthIndex - db.monthIndex;
	return da.day - db.day;
}
