/**
 * Desktop sketch — retro GUI landing screen between splash and overworld.
 *
 * Interactions:
 * - Mouse hover highlights the desktop shortcut.
 * - Mouse click on shortcut navigates to overworld.
 * - No keyboard navigation.
 */

import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {THEME, applyThemeCanvasFont, hitTest, tickBlink} from "../../lib/utils/retro-theme.js";

export default function (container) {
	return (sketch) => {
		let artBuffer;
		let iconRect = null;
		let iconHovered = false;
		let blinkVisible = true;
		let lastBlink = 0;
		let locationLabel = "Locating...";
		let weatherLabel = "Weather: --";

		sketch.setup = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);

			artBuffer = sketch.createGraphics(w, h);
			artBuffer.noStroke();
			artBuffer.textFont(THEME.FONT);
			void startLiveContext((nextLocation, nextWeather) => {
				locationLabel = nextLocation;
				weatherLabel = nextWeather;
			});
		};

		sketch.draw = () => {
			const now = sketch.millis();
			const w = artBuffer.width;
			const h = artBuffer.height;

			const blink = tickBlink(blinkVisible, lastBlink, now);
			blinkVisible = blink.visible;
			lastBlink = blink.lastBlink;

			drawDesktopBackground(artBuffer, w, h, sketch);
			drawTopBar(artBuffer, w, h, sketch);
			drawBottomNav(artBuffer, w, h, locationLabel, weatherLabel, sketch);

			iconRect = drawInteractivePanel(artBuffer, w, h, iconHovered, blinkVisible, sketch);
			drawSystemCard(artBuffer, w, h, sketch);

			const hintSize = Math.max(12, w * 0.013);
			applyThemeCanvasFont(artBuffer, hintSize, sketch);
			artBuffer.fill(...THEME.GREEN_SUBTLE, 200);
			artBuffer.textAlign(sketch.CENTER, sketch.CENTER);
			artBuffer.text("CLICK 'CARTE DE LA VILLE' TO OPEN OVERWORLD", w * 0.5, h - h * 0.09);

			sketch.clear();
			sketch.image(artBuffer, 0, 0);
			container.style.cursor = iconHovered ? "pointer" : "default";
		};

		sketch.mouseMoved = () => {
			iconHovered = Boolean(iconRect && hitTest(sketch.mouseX, sketch.mouseY, iconRect));
		};

		sketch.mousePressed = () => {
			if (iconRect && hitTest(sketch.mouseX, sketch.mouseY, iconRect)) {
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
	buf.textAlign(p.CENTER, p.CENTER);
	buf.text(weatherLabel, w * 0.5, barY + barH * 0.5);
	buf.textAlign(p.RIGHT, p.CENTER);
	buf.text("File Manager", w * 0.97, barY + barH * 0.5);
}

function drawInteractivePanel(buf, w, h, shortcutHovered, blinking, p) {
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
		{label: "LISMOI", depth: 0, interactive: true},
		{label: "Les quartiers états", depth: 1, interactive: true},
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

	let interactiveRect = {x: panelX + panelW * 0.2, y: treeStartY, w: panelW * 0.58, h: rowH * 0.84};
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
			interactiveRect = {x: rowBoxX, y: rowBoxY, w: rowBoxW, h: rowBoxH};
			buf.noStroke();
			buf.fill(...THEME.GREEN_PRIMARY, shortcutHovered ? 75 : 45);
			buf.rect(rowBoxX, rowBoxY, rowBoxW, rowBoxH, 4);
		}

		buf.noStroke();
		buf.fill(...THEME.GREEN_SUBTLE, isInteractive && (shortcutHovered || blinking) ? 255 : 210);
		buf.text(row.label, labelX, y);
	}

	return interactiveRect;
}

function drawSystemCard(buf, w, h, p) {
	const cardX = w * 0.75;
	const cardY = h * 0.23;
	const cardW = w * 0.19;
	const cardH = h * 0.5;
	drawAngledPanel(buf, cardX, cardY, cardW, cardH, {
		bgAlpha: 200,
		borderAlpha: 120,
	});

	const eyeX = cardX + cardW * 0.1;
	const eyeY = cardY + cardH * 0.08;
	const eyeW = cardW * 0.8;
	const eyeH = cardH * 0.22;
	buf.noStroke();
	buf.fill(...THEME.GREEN_SUBTLE, 30);
	buf.rect(eyeX, eyeY, eyeW, eyeH, 6);
	buf.fill(...THEME.GREEN_MID, 85);
	buf.ellipse(eyeX + eyeW * 0.5, eyeY + eyeH * 0.53, eyeW * 0.78, eyeH * 0.75);
	buf.fill(...THEME.BG, 210);
	buf.circle(eyeX + eyeW * 0.5, eyeY + eyeH * 0.53, eyeH * 0.48);

	const statSz = Math.max(11, w * 0.012);
	applyThemeCanvasFont(buf, statSz, p);
	buf.fill(...THEME.GREEN_SUBTLE, 210);
	buf.textAlign(p.LEFT, p.TOP);
	const statsX = cardX + cardW * 0.12;
	const statsY = cardY + cardH * 0.4;
	buf.text("CPU CLOCK\n64 MHZ\n\nTOTAL RAM\n10 MB\n\nFREE RAM\n5 MB\n\nI/O MODE\nMIDI", statsX, statsY);
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
		onUpdate("Location unavailable", "Weather unavailable");
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
		onUpdate("Location unavailable", "Weather unavailable");
		return;
	}

	const lat = position.coords.latitude;
	const lon = position.coords.longitude;
	const roundedLocation = `Location ${lat.toFixed(2)}, ${lon.toFixed(2)}`;

	const place = await fetchPlaceLabel(lat, lon);
	onUpdate(place ?? roundedLocation, "Loading weather...");

	const weather = await fetchWeatherLabel(lat, lon);
	onUpdate(place ?? roundedLocation, weather ?? "Weather unavailable");
}

async function fetchPlaceLabel(lat, lon) {
	try {
		const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
		const res = await fetch(url, {headers: {"Accept-Language": "en"}});
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
		const weatherName = weatherCodeToLabel(current.weather_code);
		return `${weatherName} ${temp}`;
	} catch {
		return null;
	}
}

function weatherCodeToLabel(code) {
	const map = {
		0: "Clear",
		1: "Mostly clear",
		2: "Partly cloudy",
		3: "Overcast",
		45: "Fog",
		48: "Rime fog",
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
		96: "Thunderstorm hail",
		99: "Thunderstorm hail",
	};
	return map[code] ?? "Weather";
}
