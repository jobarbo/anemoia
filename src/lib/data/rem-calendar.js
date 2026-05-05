/**
 * Calendrier de l'ère REM (Révolution Écolomobiliste)
 *
 * Format de date : "Busedi, 12 Reveillase, an 4 REM"
 *                   [jour], [jour_num] [mois], an [année] REM
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

	// "Busedi, 12 Reveillase, an 4 REM"
	const match = dateStr.match(/^(\S+),\s*(\d+)\s+(\S+),\s*an\s+(\d+)\s+REM$/i);
	if (!match) return null;

	const [, dayName, dayNumStr, monthName, yearStr] = match;

	const dayIndex = DAYS.findIndex((d) => d.toLowerCase() === dayName.toLowerCase());
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
