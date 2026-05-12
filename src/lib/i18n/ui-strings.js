/**
 * Central UI copy for fr / en. Callers pass locale from {@link ../data/scene-data.js#getLocale}.
 */

/** @param {string} [locale] */
export function normalizeLocale(locale) {
	return locale === "en" ? "en" : "fr";
}

/**
 * @param {'fr'|'en'} locale
 * @param {string} route
 * @param {Record<string,string>} params
 * @param {(slug: string) => string | undefined} getNeighborhoodName
 * @param {(slug: string) => string | undefined} getStoryTitle
 */
export function pageTitle(locale, route, params, getNeighborhoodName, getStoryTitle) {
	const L = normalizeLocale(locale);
	if (route === "splash") return "Anemoia";
	if (route === "desktop") return L === "en" ? "Anemoia — Desktop" : "Anemoia — Bureau";
	if (route === "overworld") return L === "en" ? "Anemoia — Map" : "Anemoia — Carte";
	if (route === "neighborhood") {
		const name = getNeighborhoodName(params.slug);
		return `Anemoia — ${name ?? params.slug}`;
	}
	if (route === "story") {
		const title = getStoryTitle(params.slug);
		return `Anemoia — ${title ?? params.slug}`;
	}
	return "Anemoia";
}

/** @param {'fr'|'en'} locale */
export function navStrings(locale) {
	const L = normalizeLocale(locale);
	if (L === "en") {
		return {
			navigation: "Navigation",
			desktop: "Desktop",
			map: "Map",
			thisNeighborhood: "This district",
			stories: "Stories",
			noLinkedStories: "No linked stories",
		};
	}
	return {
		navigation: "Navigation",
		desktop: "Bureau",
		map: "Carte",
		thisNeighborhood: "Ce quartier",
		stories: "Récits",
		noLinkedStories: "Aucun récit lié",
	};
}

/** @param {'fr'|'en'} locale */
export function desktopStrings(locale) {
	const L = normalizeLocale(locale);
	if (L === "en") {
		return {
			locationPending: "Location...",
			weatherDefault: "Weather: --",
			weatherUnavailable: "Weather unavailable",
			locationUnavailable: "Location unavailable",
			weatherLoading: "Loading weather...",
			locationRounded: (lat, lon) => `Location ${lat.toFixed(2)}, ${lon.toFixed(2)}`,
			menuMain: "main_menu",
			archivesToggle: (open) => `${open ? "[-]" : "[+]"} Archives`,
			verticalCities: "Vertical Cities",
			accessDenied: "ACCESS DENIED",
			statsCpuCores: "CPU CORES",
			statsCpuThreads: "THREADS",
			statsRamTotal: "TOTAL RAM",
			statsDisplay: "DISPLAY",
			statsRegion: "REGION",
			statsFallback: [
				{label: "CPU CLK", value: "64 MHZ"},
				{label: "TOTAL RAM", value: "10 MB"},
				{label: "FREE RAM", value: "5 MB"},
				{label: "I/O MODE", value: "MIDI"},
			],
			fileManager: "File manager",
		};
	}
	return {
		locationPending: "Localisation...",
		weatherDefault: "Météo : --",
		weatherUnavailable: "Météo indisponible",
		locationUnavailable: "Localisation indisponible",
		weatherLoading: "Chargement de la météo...",
		locationRounded: (lat, lon) => `Localisation ${lat.toFixed(2)}, ${lon.toFixed(2)}`,
		menuMain: "menu_principal",
		archivesToggle: (open) => `${open ? "[-]" : "[+]"} Les archives`,
		verticalCities: "Les Villes Verticales",
		accessDenied: "ACCÈS BLOQUÉ",
		statsCpuCores: "CŒURS CPU",
		statsCpuThreads: "FILS",
		statsRamTotal: "RAM TOTALE",
		statsDisplay: "AFFICHAGE",
		statsRegion: "RÉGION",
		statsFallback: [
			{label: "HORL. CPU", value: "64 MHZ"},
			{label: "RAM TOTALE", value: "10 MB"},
			{label: "RAM LIBRE", value: "5 MB"},
			{label: "MODE E/S", value: "MIDI"},
		],
		fileManager: "Gestionnaire de fichiers",
	};
}

/** @param {'fr'|'en'} locale @param {number} code */
export function weatherConditionLabel(locale, code) {
	const L = normalizeLocale(locale);
	const fr = {
		0: "Dégagé",
		1: "Principalement dégagé",
		2: "Partiellement nuageux",
		3: "Couvert",
		45: "Brouillard",
		48: "Brouillard givrant",
		51: "Bruine",
		53: "Bruine",
		55: "Forte bruine",
		56: "Bruine verglaçante",
		57: "Bruine verglaçante",
		61: "Pluie",
		63: "Pluie",
		65: "Forte pluie",
		66: "Pluie verglaçante",
		67: "Pluie verglaçante",
		71: "Neige",
		73: "Neige",
		75: "Forte neige",
		77: "Grains de neige",
		80: "Averses de pluie",
		81: "Averses de pluie",
		82: "Fortes averses",
		85: "Averses de neige",
		86: "Fortes averses de neige",
		95: "Orage",
		96: "Tempête de grêle",
		99: "Tempête de grêle",
	};
	const en = {
		0: "Clear",
		1: "Mainly clear",
		2: "Partly cloudy",
		3: "Overcast",
		45: "Fog",
		48: "Freezing fog",
		51: "Drizzle",
		53: "Drizzle",
		55: "Heavy drizzle",
		56: "Freezing drizzle",
		57: "Freezing drizzle",
		61: "Rain",
		63: "Rain",
		65: "Heavy rain",
		66: "Freezing rain",
		67: "Freezing rain",
		71: "Snow",
		73: "Snow",
		75: "Heavy snow",
		77: "Snow grains",
		80: "Rain showers",
		81: "Rain showers",
		82: "Heavy showers",
		85: "Snow showers",
		86: "Heavy snow showers",
		95: "Thunderstorm",
		96: "Hail thunderstorm",
		99: "Hail thunderstorm",
	};
	const map = L === "en" ? en : fr;
	return map[code] ?? (L === "en" ? "Weather" : "Météo");
}

/** @param {'fr'|'en'} locale */
export function overworldStrings(locale) {
	const L = normalizeLocale(locale);
	if (L === "en") {
		return {
			accessDenied: "ACCESS DENIED",
			backToMenu: "Back to main menu",
			mapTitle: "Vertical Cities",
			keyboardHints: "↑↓ SELECT   ENTER CONFIRM   ESC CLOSE   🖱↑↓ ZOOM/PAN",
			districtListTitle: "Districts",
			mapStatus: "Mapping active",
			view2D: "2D View",
			districtFallback: (i) => `District ${i + 1}`,
		};
	}
	return {
		accessDenied: "ACCÈS BLOQUÉ",
		backToMenu: "Retour au menu principal",
		mapTitle: "Les Villes Verticales",
		keyboardHints: "↑↓ CHOISIR   ENTRÉE CONFIRMER   ÉCH FERMER   🖱↑↓ ZOOM/PAN",
		districtListTitle: "Quartiers",
		mapStatus: "Cartographie active",
		view2D: "2D View",
		districtFallback: (i) => `Quartier ${i + 1}`,
	};
}

/** @param {'fr'|'en'} locale */
export function neighborhoodStrings(locale) {
	const L = normalizeLocale(locale);
	if (L === "en") {
		return {
			backToMap: "[ BACK TO MAP ]",
			activeScene: "ACTIVE DISTRICT SCENE",
		};
	}
	return {
		backToMap: "[ RETOUR À LA CARTE ]",
		activeScene: "SCÈNE DE QUARTIER ACTIVE",
	};
}

/** @param {'fr'|'en'} locale */
export function storyStrings(locale) {
	const L = normalizeLocale(locale);
	return {
		defaultTitle: L === "en" ? "Story viewer" : "Visionneuse de récit",
	};
}

/** @param {'fr'|'en'} locale */
export function splashClickPrompt(locale) {
	return normalizeLocale(locale) === "en" ? "[ CLICK TO START ]" : "[ CLIQUER POUR DÉMARRER ]";
}

/** Logo phase — OEM footer under firmware line */
export function splashLogoOemFooter(locale) {
	return normalizeLocale(locale) === "en"
		? "1998 BootSoft Inc.  OEM startup environment"
		: "1998 BootSoft Inc.  Environnement de démarrage OEM";
}

/** Title phase — click to continue after title card */
export function splashTitleContinuePrompt(locale) {
	return normalizeLocale(locale) === "en" ? "[ CLICK TO CONTINUE ]" : "[ CLIQUER POUR CONTINUER ]";
}

/** @param {'fr'|'en'} locale */
export function splashBootMessage(locale) {
	return normalizeLocale(locale) === "en" ? "Starting system…" : "Mise en route du système…";
}

/** @param {'fr'|'en'} locale */
export function splashBiosLines(locale) {
	const L = normalizeLocale(locale);
	if (L === "en") {
		return [
			"BOOT-BOY BIOS  Version 1.04",
			"Copyright (C) 1998-2026  BootSoft Inc.  All rights reserved.",
			"",
			"CPU : Z80 compatible  @  4.00 MHz .............. OK",
			"MEMORY TEST: 640K  Base memory ................. OK",
			"MEMORY TEST: 32768K  Extended memory .......... OK",
			"IDE CHANNEL 0: Primary Master",
			"  QUANTUM FIREBALL  2.1GB  LBA HDS=4092 C=16 S=63",
			"PCI BUS INITIALIZATION ..................... OK",
			"",
			"LOADING  BOOT-BOY OS  3.0 ...",
		];
	}
	return [
		"BOOT-BOY BIOS  Version 1.04",
		"Copyright (C) 1998-2026  BootSoft Inc.  Tous droits réservés.",
		"",
		"CPU : Compatible Z80  @  4.00 MHz .............. OK",
		"TEST MÉMOIRE: 640K  Mémoire de base ............ OK",
		"TEST MÉMOIRE: 32768K  Mémoire étendue ......... OK",
		"IDE CHANNEL 0: Primary Master",
		"  QUANTUM FIREBALL  2.1GB  LBA HDS=4092 C=16 S=63",
		"INITIALISATION BUS PCI ..................... OK",
		"",
		"CHARGEMENT  BOOT-BOY OS  3.0 ...",
	];
}

/**
 * @param {'fr'|'en'} locale
 * @returns {{
 *   username: string,
 *   password: string,
 *   authBase: string,
 *   granted: string,
 *   usernameLabel: string,
 *   passwordLabel: string,
 *   incorrectLine: string,
 *   header: string,
 *   connected: string,
 *   passwordHint: string,
 * }}
 */
export function splashLoginStrings(locale) {
	const L = normalizeLocale(locale);
	if (L === "en") {
		return {
			username: "Archivist",
			password: "ketchup",
			authBase: "Authenticating",
			granted: "ACCESS GRANTED — Welcome, Archivist.",
			usernameLabel: "username: ",
			passwordLabel: "password: ",
			incorrectLine: "  Incorrect login. Please try again.",
			header: "Boot-Boy OS  3.0  —  ANEMOIA Interactive System",
			connected: "CONNECTED TO: ANEMOIA-SRV-01",
			passwordHint: "Enter password and press ENTER",
		};
	}
	return {
		username: "Archiviste",
		password: "ketchup",
		authBase: "Authentification",
		granted: "ACCÈS ACCORDÉ — Bienvenue, Archiviste.",
		usernameLabel: "identifiant: ",
		passwordLabel: "mot de passe: ",
		incorrectLine: "  Identifiant incorrect. Veuillez réessayer.",
		header: "Boot-Boy OS  3.0  —  Système Interactif ANEMOIA",
		connected: "CONNECTÉ À: ANEMOIA-SRV-01",
		passwordHint: "Entrez le mot de passe et appuyez sur ENTRÉE",
	};
}

/** @param {'fr'|'en'} locale */
export function backButtonLabel(locale) {
	return normalizeLocale(locale) === "en" ? "Back" : "Retour";
}
