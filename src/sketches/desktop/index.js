/**
 * Desktop sketch — retro GUI landing screen between splash and overworld.
 *
 * Interactions:
 * - Mouse hover highlights the desktop shortcut.
 * - Mouse click on shortcut navigates to overworld.
 * - No keyboard navigation.
 */

import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {THEME, applyThemeCanvasFont, hitTest} from "../../lib/utils/retro-theme.js";

export default function (container) {
	return (sketch) => {
		let artBuffer;
		let interactiveRows = [];
		let hoveredRowAction = null;
		let locationLabel = "Localisation...";
		let weatherLabel = "Météo : --";
		let blinkStartMs = -1;
		let blinkDurationMs = 150;
		let nextBlinkAtMs = 0;
		let gazeX = 0;
		let gazeY = 0;
		let gazeFromX = 0;
		let gazeFromY = 0;
		let gazeToX = 0;
		let gazeToY = 0;
		let gazeMoveStartMs = 0;
		let gazeMoveDurationMs = 0;
		let gazeHoldUntilMs = 0;
		let gazeMoving = false;

		const scheduleNextBlink = (nowMs) => {
			// Irregular cadence keeps blinking from feeling robotic.
			nextBlinkAtMs = nowMs + sketch.random(1800, 5200);
		};
		const scheduleNextGazeHold = (nowMs) => {
			gazeHoldUntilMs = nowMs + sketch.random(800, 2300);
		};
		const pickGazeTarget = () => ({
			x: sketch.random(-1, 1),
			y: sketch.random(-1, 1),
		});

		sketch.setup = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);

			artBuffer = sketch.createGraphics(w, h);
			artBuffer.noStroke();
			artBuffer.textFont(THEME.FONT);
			const nowMs = sketch.millis();
			scheduleNextBlink(nowMs);
			scheduleNextGazeHold(nowMs);
			void startLiveContext((nextLocation, nextWeather) => {
				locationLabel = nextLocation;
				weatherLabel = nextWeather;
			});
		};

		sketch.draw = () => {
			const w = artBuffer.width;
			const h = artBuffer.height;

			drawDesktopBackground(artBuffer, w, h, sketch);
			drawTopBar(artBuffer, w, h, sketch);
			drawBottomNav(artBuffer, w, h, locationLabel, weatherLabel, sketch);

			interactiveRows = drawInteractivePanel(artBuffer, w, h, hoveredRowAction, sketch);
			const nowMs = sketch.millis();
			if (blinkStartMs < 0 && nowMs >= nextBlinkAtMs) {
				blinkStartMs = nowMs;
				blinkDurationMs = sketch.random(110, 210);
			}
			let blink = 0;
			if (blinkStartMs >= 0) {
				const t = (nowMs - blinkStartMs) / Math.max(1, blinkDurationMs);
				if (t >= 1) {
					blinkStartMs = -1;
					scheduleNextBlink(nowMs);
				} else {
					// Fast close/open eyelid profile.
					blink = t < 0.5 ? t * 2 : (1 - t) * 2;
				}
			}
			if (!gazeMoving && nowMs >= gazeHoldUntilMs) {
				const target = pickGazeTarget();
				gazeFromX = gazeX;
				gazeFromY = gazeY;
				gazeToX = target.x;
				gazeToY = target.y;
				gazeMoveStartMs = nowMs;
				gazeMoveDurationMs = sketch.random(120, 240);
				gazeMoving = true;
			}
			if (gazeMoving) {
				const moveT = pClamp((nowMs - gazeMoveStartMs) / Math.max(1, gazeMoveDurationMs), 0, 1);
				const easedT = moveT * moveT * (3 - 2 * moveT);
				gazeX = sketch.lerp(gazeFromX, gazeToX, easedT);
				gazeY = sketch.lerp(gazeFromY, gazeToY, easedT);
				if (moveT >= 1) {
					gazeX = gazeToX;
					gazeY = gazeToY;
					gazeMoving = false;
					scheduleNextGazeHold(nowMs);
				}
			}
			drawSystemCard(artBuffer, w, h, sketch, blink, gazeX, gazeY);

			sketch.clear();
			sketch.image(artBuffer, 0, 0);
			container.style.cursor = hoveredRowAction ? "pointer" : "default";
		};

		sketch.mouseMoved = () => {
			const hoveredRow = interactiveRows.find((row) => hitTest(sketch.mouseX, sketch.mouseY, row.rect));
			hoveredRowAction = hoveredRow?.action ?? null;
		};

		sketch.mousePressed = () => {
			const clickedRow = interactiveRows.find((row) => hitTest(sketch.mouseX, sketch.mouseY, row.rect));
			if (!clickedRow) return;
			if (clickedRow.action === "story:lismoi") {
				sceneNavigate("story", {slug: "la-memoire"});
				return;
			}
			if (clickedRow.action === "overworld") {
				sceneNavigate("overworld");
			}
		};

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
		};
	};
}

function drawDesktopBackground(buf, w, h, p) {
	buf.background(...THEME.BG);
	buf.stroke(...THEME.GREEN_PRIMARY, 26);
	buf.strokeWeight(1);

	const cols = 36;
	const rows = 22;
	for (let c = 0; c <= cols; c++) {
		const x = (c / cols) * w;
		buf.line(x, 0, x, h);
	}
	for (let r = 0; r <= rows; r++) {
		const y = (r / rows) * h;
		buf.line(0, y, w, y);
	}
}

function drawTopBar(buf, w, h, p) {
	const barH = h * 0.07;
	buf.noStroke();
	buf.fill(8, 24, 38, 230);
	buf.rect(0, 0, w, barH);

	buf.stroke(...THEME.GREEN_MID, 90);
	buf.strokeWeight(2);
	buf.line(0, barH, w, barH);
	buf.noStroke();

	const textSize = Math.max(12, w * 0.014);
	applyThemeCanvasFont(buf, textSize, p);
	buf.fill(...THEME.GREEN_SUBTLE, 210);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text("Boot-Boy OS 3.0.1", w * 0.025, barH * 0.5);
	buf.textAlign(p.RIGHT, p.CENTER);
	buf.text(formatTopBarDateTime(new Date()), w * 0.975, barH * 0.5);
}

function formatTopBarDateTime(now) {
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const year = now.getFullYear();
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	return `${month}/${day}/${year} ${hours}:${minutes}`;
}

function drawBottomNav(buf, w, h, locationLabel, weatherLabel, p) {
	const barH = h * 0.072;
	const barY = h - barH;
	buf.noStroke();
	buf.fill(8, 24, 38, 235);
	buf.rect(0, barY, w, barH);
	buf.stroke(...THEME.GREEN_MID, 100);
	buf.strokeWeight(2);
	buf.line(0, barY, w, barY);
	buf.noStroke();

	const navSz = Math.max(11, w * 0.012);
	applyThemeCanvasFont(buf, navSz, p);
	buf.fill(...THEME.GREEN_MID, 230);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text(locationLabel, w * 0.03, barY + barH * 0.5);
	const {icon, text} = splitWeatherLabel(weatherLabel);
	const iconSize = Math.max(navSz * 2.5, w * 0.022);
	applyThemeCanvasFont(buf, iconSize, p);
	buf.textAlign(p.RIGHT, p.CENTER);
	buf.text(icon, w * 0.48, barY + barH * 0.4);
	applyThemeCanvasFont(buf, navSz, p);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text(text, w * 0.485, barY + barH * 0.5);
	buf.textAlign(p.RIGHT, p.CENTER);
	buf.text("Gestionnaire de fichiers", w * 0.97, barY + barH * 0.5);
}

function splitWeatherLabel(label) {
	const raw = String(label ?? "").trim();
	if (!raw) return {icon: "◌", text: "Météo : --"};
	const firstSpace = raw.indexOf(" ");
	if (firstSpace <= 0) return {icon: "◌", text: raw};
	return {
		icon: raw.slice(0, firstSpace),
		text: raw.slice(firstSpace + 1),
	};
}

function drawInteractivePanel(buf, w, h, hoveredAction, p) {
	const panelX = w * 0.08;
	const panelY = h * 0.23;
	const panelW = w * 0.44;
	const panelH = h * 0.53;
	drawAngledPanel(buf, panelX, panelY, panelW, panelH, {
		bgAlpha: 220,
		borderAlpha: 180,
	});

	const panelTitleSz = Math.max(13, w * 0.016);
	const pathBoxY = panelY + panelH * 0.06;
	const pathBoxH = panelH * 0.1;
	const pathTextX = panelX + panelW * 0.08;
	const separatorY = pathBoxY + pathBoxH;
	const separatorPad = panelW * 0.0;

	buf.noFill();
	buf.stroke(...THEME.GREEN_MID, 170);
	buf.strokeWeight(2);
	buf.line(panelX + separatorPad, separatorY, panelX + panelW - separatorPad, separatorY);

	applyThemeCanvasFont(buf, panelTitleSz, p);
	buf.textAlign(p.LEFT, p.TOP);
	buf.fill(...THEME.GREEN_SUBTLE, 210);
	buf.noStroke();
	buf.text("/main_menu", pathTextX, pathBoxY + panelH * 0.018);

	const treeStartY = panelY + panelH * 0.24;
	const rowH = panelH * 0.1;
	const trunkX = panelX + panelW * 0.12;
	const nestedTrunkX = panelX + panelW * 0.21;
	const branchColor = [...THEME.GREEN_MID, 120];

	const rows = [
		{label: "LISMOI", depth: 0, interactive: true, action: "story:lismoi"},
		{label: "Les quartiers états", depth: 1, interactive: true, action: "overworld"},
	];

	buf.stroke(...branchColor);
	buf.strokeWeight(2);
	buf.noFill();
	const mainTrunkRows = rows
		.map((row, index) => ({row, index}))
		.filter(({row}) => row.depth <= 1)
		.map(({index}) => index);
	if (mainTrunkRows.length > 0) {
		const first = mainTrunkRows[0];
		const last = mainTrunkRows[mainTrunkRows.length - 1];
		const y1 = treeStartY + first * rowH;
		const y2 = treeStartY + last * rowH;
		buf.line(trunkX, y1, trunkX, y2);
	}

	const nestedTrunkRows = rows
		.map((row, index) => ({row, index}))
		.filter(({row}) => row.depth > 1)
		.map(({index}) => index);
	if (nestedTrunkRows.length > 0) {
		const first = nestedTrunkRows[0];
		const last = nestedTrunkRows[nestedTrunkRows.length - 1];
		const y1 = treeStartY + first * rowH;
		const y2 = treeStartY + last * rowH;
		buf.line(nestedTrunkX, y1, nestedTrunkX, y2);
	}

	const optionSz = Math.max(13, w * 0.016);
	applyThemeCanvasFont(buf, optionSz, p);
	buf.textAlign(p.LEFT, p.CENTER);

	const interactiveRows = [];
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const y = treeStartY + i * rowH;
		const labelX = panelX + panelW * (0.2 + row.depth * 0.09);
		const connectorX = row.depth <= 1 ? trunkX : nestedTrunkX;

		buf.stroke(...branchColor);
		buf.line(connectorX, y, labelX - panelW * 0.03, y);

		const isInteractive = Boolean(row.interactive);
		if (isInteractive) {
			const rowBoxX = labelX - panelW * 0.03;
			const rowBoxY = y - rowH * 0.42;
			const rowBoxW = panelW * 0.56;
			const rowBoxH = rowH * 0.84;
			const rowRect = {x: rowBoxX, y: rowBoxY, w: rowBoxW, h: rowBoxH};
			interactiveRows.push({action: row.action, rect: rowRect});
			const rowHovered = hoveredAction === row.action;
			buf.noStroke();
			buf.fill(...THEME.GREEN_PRIMARY, rowHovered ? 75 : 45);
			buf.rect(rowBoxX, rowBoxY, rowBoxW, rowBoxH, 4);
		}

		buf.noStroke();
		const rowActive = isInteractive && hoveredAction === row.action;
		buf.fill(...THEME.GREEN_SUBTLE, rowActive ? 255 : 210);
		buf.text(row.label, labelX, y);
	}

	return interactiveRows;
}

function drawSystemCard(buf, w, h, p, blink, gazeXNorm, gazeYNorm) {
	const cardX = w * 0.75;
	const cardY = h * 0.23;
	const cardW = w * 0.19;
	const cardH = h * 0.5;
	drawAngledPanel(buf, cardX, cardY, cardW, cardH, {
		bgAlpha: 200,
		borderAlpha: 200,
	});

	const eyeX = cardX + cardW * 0.1;
	const eyeY = cardY + cardH * 0.08;
	const eyeW = cardW * 0.8;
	const eyeH = cardH * 0.22;
	const gazeX = p.map(gazeXNorm, -1, 1, -eyeW * 0.09, eyeW * 0.09, true);
	const gazeY = p.map(gazeYNorm, -1, 1, -eyeH * 0.07, eyeH * 0.07, true);
	const eyelidOpen = 1 - Math.min(1, Math.max(0, blink));
	const eyeVisibleH = Math.max(eyeH * 0.12, eyeH * eyelidOpen);

	buf.noStroke();
	buf.fill(...THEME.GREEN_SUBTLE, 30);
	buf.rect(eyeX, eyeY, eyeW, eyeH, 6);
	buf.drawingContext.save();
	buf.drawingContext.beginPath();
	buf.drawingContext.rect(eyeX, eyeY + (eyeH - eyeVisibleH) * 0.5, eyeW, eyeVisibleH);
	buf.drawingContext.clip();
	buf.fill(255, 255, 255, 85);
	buf.ellipse(eyeX + eyeW * 0.5, eyeY + eyeH * 0.53, eyeW * 0.78, eyeH * 0.75);
	buf.fill(...THEME.BG, 210);
	buf.circle(eyeX + eyeW * 0.5 + gazeX, eyeY + eyeH * 0.53 + gazeY, eyeH * 0.48);
	buf.drawingContext.restore();

	const statSz = Math.max(11, w * 0.012);
	applyThemeCanvasFont(buf, statSz, p);
	buf.fill(...THEME.GREEN_SUBTLE, 210);
	buf.textAlign(p.LEFT, p.TOP);
	const statsX = cardX + cardW * 0.12;
	const statsY = cardY + cardH * 0.4;
	buf.text("HORLOGE CPU\n64 MHZ\n\nRAM TOTALE\n10 MO\n\nRAM LIBRE\n5 MO\n\nMODE E/S\nMIDI", statsX, statsY);
}

function pClamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function drawAngledPanel(buf, x, y, w, h, opts) {
	const cut = Math.min(w, h) * 0.08;
	buf.noStroke();
	buf.fill(...THEME.BG, opts.bgAlpha);
	buf.beginShape();
	buf.vertex(x, y);
	buf.vertex(x + w, y);
	buf.vertex(x + w, y + h - cut);
	buf.vertex(x + w - cut, y + h);
	buf.vertex(x, y + h);
	buf.endShape(buf.CLOSE);

	buf.noFill();
	buf.stroke(...THEME.GREEN_MID, opts.borderAlpha);
	buf.strokeWeight(2);
	buf.beginShape();
	buf.vertex(x, y);
	buf.vertex(x + w, y);
	buf.vertex(x + w, y + h - cut);
	buf.vertex(x + w - cut, y + h);
	buf.vertex(x, y + h);
	buf.endShape(buf.CLOSE);

	// Explicit left border to keep panel framing balanced.
	buf.line(x, y, x, y + h);
}

async function startLiveContext(onUpdate) {
	if (!navigator.geolocation) {
		onUpdate("Localisation indisponible", "Météo indisponible");
		return;
	}

	const position = await new Promise((resolve, reject) => {
		navigator.geolocation.getCurrentPosition(resolve, reject, {
			enableHighAccuracy: false,
			timeout: 8000,
			maximumAge: 5 * 60 * 1000,
		});
	}).catch(() => null);

	if (!position) {
		onUpdate("Localisation indisponible", "Météo indisponible");
		return;
	}

	const lat = position.coords.latitude;
	const lon = position.coords.longitude;
	const roundedLocation = `Position ${lat.toFixed(2)}, ${lon.toFixed(2)}`;

	const place = await fetchPlaceLabel(lat, lon);
	onUpdate(place ?? roundedLocation, "Chargement de la météo...");

	const weather = await fetchWeatherLabel(lat, lon);
	onUpdate(place ?? roundedLocation, weather ?? "Météo indisponible");
}

async function fetchPlaceLabel(lat, lon) {
	try {
		const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
		const res = await fetch(url, {headers: {"Accept-Language": "fr-CA,fr"}});
		if (!res.ok) return null;
		const data = await res.json();
		const addr = data?.address ?? {};
		const city = addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.municipality;
		const state = addr.state ?? addr.region;
		const country = addr.country;
		if (city && state) return `${city}, ${state}`;
		if (city && country) return `${city}, ${country}`;
		if (city) return city;
		if (country) return country;
		return null;
	} catch {
		return null;
	}
}

async function fetchWeatherLabel(lat, lon) {
	try {
		const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code&timezone=auto`;
		const res = await fetch(url);
		if (!res.ok) return null;
		const data = await res.json();
		const current = data?.current;
		if (!current) return null;
		const temp = typeof current.temperature_2m === "number" ? `${Math.round(current.temperature_2m)}°C` : "--";
		const weather = weatherCodeToUi(current.weather_code);
		return `${weather.icon} ${weather.label} ${temp}`;
	} catch {
		return null;
	}
}

function weatherCodeToUi(code) {
	const map = {
		0: {icon: "☀", label: "Dégagé"},
		1: {icon: "🌤", label: "Plutôt dégagé"},
		2: {icon: "⛅", label: "Partiellement nuageux"},
		3: {icon: "☁", label: "Couvert"},
		45: {icon: "🌫", label: "Brouillard"},
		48: {icon: "🌫", label: "Brouillard givrant"},
		51: {icon: "🌦", label: "Bruine"},
		53: {icon: "🌦", label: "Bruine"},
		55: {icon: "🌧", label: "Forte bruine"},
		56: {icon: "🌧", label: "Bruine verglaçante"},
		57: {icon: "🌧", label: "Bruine verglaçante"},
		61: {icon: "🌧", label: "Pluie"},
		63: {icon: "🌧", label: "Pluie"},
		65: {icon: "🌧", label: "Forte pluie"},
		66: {icon: "🌧", label: "Pluie verglaçante"},
		67: {icon: "🌧", label: "Pluie verglaçante"},
		71: {icon: "❄", label: "Neige"},
		73: {icon: "❄", label: "Neige"},
		75: {icon: "❄", label: "Forte neige"},
		77: {icon: "🌨", label: "Neige en grains"},
		80: {icon: "🌦", label: "Averses de pluie"},
		81: {icon: "🌦", label: "Averses de pluie"},
		82: {icon: "🌧", label: "Fortes averses"},
		85: {icon: "🌨", label: "Averses de neige"},
		86: {icon: "🌨", label: "Fortes averses de neige"},
		95: {icon: "⛈", label: "Orage"},
		96: {icon: "⛈", label: "Orage de grêle"},
		99: {icon: "⛈", label: "Orage de grêle"},
	};
	return map[code] ?? {icon: "◌", label: "Météo"};
}
