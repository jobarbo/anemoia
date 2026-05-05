/**
 * Desktop sketch — retro GUI landing screen between splash and overworld.
 *
 * Interactions:
 * - Mouse hover highlights tree rows.
 * - Click navigates: readme story, overworld, each neighborhood, and per-neighborhood
 *   stories (from `src/data/neighborhoods/index.json` + embedded story content).
 * - No keyboard navigation.
 */

import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {getNeighborhoods, getStory} from "../../lib/data/scene-data.js";
import {prefetchOverworldMapData} from "../../lib/data/overworld-map-data.js";
import {THEME, applyThemeCanvasFont, hitTest} from "../../lib/utils/retro-theme.js";
import {createCanvasCursor, drawCanvasCursor} from "../../lib/input/canvas-cursor.js";

export default function (container) {
	return (sketch) => {
		let artBuffer;
		let canvasCursor;
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
			sketch.pixelDensity(1);
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			canvasCursor = createCanvasCursor({canvasEl: canvas.elt});

			artBuffer = sketch.createGraphics(w, h);
			artBuffer.pixelDensity(1);
			artBuffer.noStroke();
			artBuffer.textFont(THEME.FONT);
			const nowMs = sketch.millis();
			scheduleNextBlink(nowMs);
			scheduleNextGazeHold(nowMs);
			void startLiveContext((nextLocation, nextWeather) => {
				locationLabel = nextLocation;
				weatherLabel = nextWeather;
			});
			void prefetchOverworldMapData(getNeighborhoods());
			// Pre-load Weather Icons font so the canvas can use it immediately
			void document.fonts.load('16px "Weather Icons"');
		};

		sketch.draw = () => {
			const w = artBuffer.width;
			const h = artBuffer.height;
			const pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: w, height: h});
			hoveredRowAction = interactiveRows.find((row) => hitTest(pointer.x, pointer.y, row.rect))?.action ?? null;

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
			drawCanvasCursor(artBuffer, pointer, {hovered: Boolean(hoveredRowAction)});

			sketch.clear();
			sketch.image(artBuffer, 0, 0);
		};

		sketch.mousePressed = () => {
			const pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: artBuffer.width, height: artBuffer.height});
			const clickedRow = interactiveRows.find((row) => hitTest(pointer.x, pointer.y, row.rect));
			if (!clickedRow) return;
			navigateFromDesktopAction(clickedRow.action);
		};

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
			artBuffer.pixelDensity(1);
		};

		if (typeof sketch.registerMethod === "function") {
			sketch.registerMethod("remove", () => {
				canvasCursor?.destroy();
			});
		}
	};
}

function drawDesktopBackground(buf, w, h, p) {
	buf.background(...THEME.BG);
	buf.noStroke();
	buf.fill(...THEME.GREEN_PRIMARY, 20);
	const cols = 38;
	const rows = 24;
	const dotSize = Math.max(1.5, Math.min(w / cols, h / rows) * 0.14);
	for (let c = 0; c <= cols; c++) {
		for (let r = 0; r <= rows; r++) {
			buf.ellipse((c / cols) * w, (r / rows) * h, dotSize, dotSize);
		}
	}
}

function drawTopBar(buf, w, h, p) {
	const barH = h * 0.07;

	// Chrome gradient title bar
	const ctx = buf.drawingContext;
	const grad = ctx.createLinearGradient(0, 0, 0, barH);
	grad.addColorStop(0, "rgba(95, 48, 28, 0.97)");
	grad.addColorStop(0.45, "rgba(52, 28, 16, 0.97)");
	grad.addColorStop(1, "rgba(16, 9, 5, 0.98)");
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, w, barH);

	// Highlight line at very top
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(1);
	buf.line(0, 0, w, 0);
	// Bottom separator (bright + faint secondary)
	buf.stroke(...THEME.GREEN_MID, 100);
	buf.strokeWeight(2);
	buf.line(0, barH, w, barH);
	buf.stroke(...THEME.GREEN_PRIMARY, 35);
	buf.strokeWeight(1);
	buf.line(0, barH - 3, w, barH - 3);
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

	// Chrome gradient status bar
	const ctx = buf.drawingContext;
	const grad = ctx.createLinearGradient(0, barY, 0, barY + barH);
	grad.addColorStop(0, "rgba(16, 9, 5, 0.98)");
	grad.addColorStop(0.55, "rgba(52, 28, 16, 0.97)");
	grad.addColorStop(1, "rgba(95, 48, 28, 0.97)");
	ctx.fillStyle = grad;
	ctx.fillRect(0, barY, w, barH);

	buf.stroke(...THEME.GREEN_MID, 100);
	buf.strokeWeight(2);
	buf.line(0, barY, w, barY);
	buf.stroke(...THEME.GREEN_PRIMARY, 35);
	buf.strokeWeight(1);
	buf.line(0, barY + 3, w, barY + 3);
	buf.noStroke();

	const navSz = Math.max(11, w * 0.012);
	applyThemeCanvasFont(buf, navSz, p);
	buf.fill(...THEME.GREEN_MID, 230);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text(locationLabel, w * 0.03, barY + barH * 0.5);
	const {icon, text} = splitWeatherLabel(weatherLabel);
	const iconSize = Math.max(navSz * 1.4, w * 0.016);
	const iconX = w * 0.48;
	const iconY = barY + barH * 0.5;
	ctx.save();
	ctx.font = `${iconSize}px "Weather Icons", sans-serif`;
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	ctx.fillStyle = `rgba(${THEME.GREEN_MID[0]}, ${THEME.GREEN_MID[1]}, ${THEME.GREEN_MID[2]}, 0.9)`;
	ctx.fillText(icon, iconX, iconY);
	ctx.restore();
	applyThemeCanvasFont(buf, navSz, p);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text(text, w * 0.485, barY + barH * 0.5);
	buf.textAlign(p.RIGHT, p.CENTER);
	buf.text("Gestionnaire de fichiers", w * 0.97, barY + barH * 0.5);
}

function splitWeatherLabel(label) {
	const raw = String(label ?? "").trim();
	if (!raw) return {icon: WEATHER_ICON_NA, text: "Météo : --"};
	const firstSpace = raw.indexOf(" ");
	if (firstSpace <= 0) return {icon: WEATHER_ICON_NA, text: raw};
	const maybeIcon = raw.slice(0, firstSpace);
	const rest = raw.slice(firstSpace + 1).trim();
	return {
		icon: maybeIcon,
		text: rest || "Météo : --",
	};
}

// Weather Icons font (Erik Flowers) — Private Use Area codepoints
const WEATHER_ICON_NA = "\uF07B";

/** Labels + depths + route ids for the file-manager tree (single source: neighborhoods JSON). */
function buildDesktopTreeRows() {
	let storyRowKey = 0;
	const nextStoryAction = (slug) => `story:${slug}#${storyRowKey++}`;

	const rows = [
		{label: "LISMOI", depth: 0, interactive: true, action: nextStoryAction("la-memoire")},
		{label: "Les villes verticales", depth: 0, interactive: true, action: "overworld"},
	];
	for (const n of getNeighborhoods()) {
		rows.push({
			label: n.name,
			depth: 1,
			interactive: true,
			action: `neighborhood:${n.slug}`,
		});
		const storySlugs = Array.isArray(n.stories) ? n.stories : [];
		for (const slug of storySlugs) {
			const story = getStory(slug);
			if (!story) continue;
			rows.push({
				label: story.title ?? slug,
				depth: 2,
				interactive: true,
				action: nextStoryAction(slug),
			});
		}
	}
	return rows;
}

/** action: `overworld` | `story:<slug>#<uid>` | `neighborhood:<slug>` — `#uid` keeps hover ids unique when the same story appears twice. */
function navigateFromDesktopAction(action) {
	if (action === "overworld") {
		sceneNavigate("overworld");
		return;
	}
	const sep = action.indexOf(":");
	if (sep <= 0) return;
	const kind = action.slice(0, sep);
	let payload = action.slice(sep + 1);
	if (!payload) return;
	if (kind === "story") {
		const hash = payload.indexOf("#");
		if (hash >= 0) payload = payload.slice(0, hash);
		sceneNavigate("story", {slug: payload});
	} else if (kind === "neighborhood") {
		sceneNavigate("neighborhood", {slug: payload});
	}
}

function drawInteractivePanel(buf, w, h, hoveredAction, p) {
	const panelX = w * 0.08;
	const panelY = h * 0.23;
	const panelW = w * 0.44;
	const panelH = h * 0.53;
	drawAngledPanel(buf, panelX, panelY, panelW, panelH, {
		bgAlpha: 255,
		borderAlpha: 255,
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

	const rows = buildDesktopTreeRows();

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
			if (rowHovered) {
				const ctx = buf.drawingContext;
				const rg = ctx.createLinearGradient(rowBoxX, 0, rowBoxX + rowBoxW, 0);
				rg.addColorStop(0, `rgba(${THEME.GREEN_MID.join(",")}, 0.06)`);
				rg.addColorStop(0.45, `rgba(${THEME.GREEN_MID.join(",")}, 0.20)`);
				rg.addColorStop(1, `rgba(${THEME.GREEN_MID.join(",")}, 0.06)`);
				ctx.fillStyle = rg;
				const r = 4;
				ctx.beginPath();
				ctx.roundRect(rowBoxX, rowBoxY, rowBoxW, rowBoxH, r);
				ctx.fill();
				buf.noFill();
				buf.stroke(...THEME.GREEN_MID, 80);
				buf.strokeWeight(1);
				buf.rect(rowBoxX, rowBoxY, rowBoxW, rowBoxH, r);
				buf.noStroke();
			} else {
				buf.fill(...THEME.GREEN_PRIMARY, 28);
				buf.rect(rowBoxX, rowBoxY, rowBoxW, rowBoxH, 4);
			}
		}

		buf.noStroke();
		const rowActive = isInteractive && hoveredAction === row.action;
		buf.fill(...THEME.GREEN_SUBTLE, rowActive ? 255 : 210);
		buf.text(row.label, labelX, y);
	}

	return interactiveRows;
}

function drawSystemCard(buf, w, h, p, blink, gazeXNorm, gazeYNorm) {
	const statsText = "HORLOGE CPU\n64 MHZ\n\nRAM TOTALE\n10 MO\n\nRAM LIBRE\n5 MO\n\nMODE E/S\nMIDI";
	const statsLines = statsText.split("\n");
	const cardY = h * 0.23;
	const cardRight = w * 0.95;
	const cardGapY = Math.max(14, h * 0.03);
	const cardPadX = Math.max(16, w * 0.018);
	const cardPadY = Math.max(14, h * 0.024);

	const maxCardW = w * 0.47;
	let statSz = Math.max(20, w * 0.012);
	applyThemeCanvasFont(buf, statSz, p);
	let statsMaxW = Math.max(...statsLines.map((line) => (line ? buf.textWidth(line) : 0)));
	while (statsMaxW > maxCardW - cardPadX * 2 && statSz > 9) {
		statSz -= 1;
		applyThemeCanvasFont(buf, statSz, p);
		statsMaxW = Math.max(...statsLines.map((line) => (line ? buf.textWidth(line) : 0)));
	}

	const lineH = statSz * 1.2;
	const statsH = (statsLines.length - 1) * lineH + statSz;
	const eyeW = Math.max(statsMaxW, w * 0.22);
	const eyeH = Math.max(76, eyeW * 0.28);
	const contentW = Math.max(eyeW, statsMaxW);
	const contentH = eyeH + cardGapY + statsH;

	const cardW = contentW + cardPadX * 2;
	const cardH = contentH + cardPadY * 2;
	const cardX = cardRight - cardW;
	drawAngledPanel(buf, cardX, cardY, cardW, cardH, {
		bgAlpha: 255,
		borderAlpha: 255,
	});

	const eyeX = cardX + (cardW - eyeW) * 0.5;
	const eyeY = cardY + cardPadY;
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

	applyThemeCanvasFont(buf, statSz, p);
	buf.textLeading(lineH);
	buf.fill(...THEME.GREEN_SUBTLE, 255);
	buf.textAlign(p.LEFT, p.TOP);
	const statsX = cardX + (cardW - statsMaxW) * 0.15;
	const statsY = eyeY + eyeH + cardGapY;
	buf.text(statsText, statsX, statsY);
}

function pClamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function drawAngledPanel(buf, x, y, w, h, opts) {
	const cut = Math.min(w, h) * 0.08;

	// Main fill
	buf.noStroke();
	buf.fill(...THEME.BG, opts.bgAlpha);
	buf.beginShape();
	buf.vertex(x, y);
	buf.vertex(x + w, y);
	buf.vertex(x + w, y + h - cut);
	buf.vertex(x + w - cut, y + h);
	buf.vertex(x, y + h);
	buf.endShape(buf.CLOSE);

	// Chrome gradient header strip
	const ctx = buf.drawingContext;
	const headerH = Math.min(h * 0.065, 16);
	const hGrad = ctx.createLinearGradient(x, y, x, y + headerH);
	hGrad.addColorStop(0, `rgba(${THEME.GREEN_PRIMARY.join(",")}, 0.32)`);
	hGrad.addColorStop(1, `rgba(${THEME.GREEN_PRIMARY.join(",")}, 0.04)`);
	ctx.fillStyle = hGrad;
	ctx.fillRect(x, y, w, headerH);

	// Outer bright border (highlight)
	buf.noFill();
	buf.stroke(...THEME.GREEN_MID, opts.borderAlpha);
	buf.strokeWeight(1.5);
	buf.beginShape();
	buf.vertex(x, y);
	buf.vertex(x + w, y);
	buf.vertex(x + w, y + h - cut);
	buf.vertex(x + w - cut, y + h);
	buf.vertex(x, y + h);
	buf.endShape(buf.CLOSE);
	buf.line(x, y, x, y + h);

	// Inner inset shadow border
	const inset = 3;
	buf.stroke(...THEME.GREEN_PRIMARY, opts.borderAlpha * 0.28);
	buf.strokeWeight(1);
	buf.beginShape();
	buf.vertex(x + inset, y + inset);
	buf.vertex(x + w - inset, y + inset);
	buf.vertex(x + w - inset, y + h - cut - inset);
	buf.vertex(x + w - cut - inset, y + h - inset);
	buf.vertex(x + inset, y + h - inset);
	buf.endShape(buf.CLOSE);
	buf.line(x + inset, y + inset, x + inset, y + h - inset);
	buf.noStroke();
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
	// Codepoints: Weather Icons font by Erik Flowers (PUA \uF000+)
	// wi-day-sunny \uF00D · wi-day-sunny-overcast \uF00C · wi-day-cloudy \uF002
	// wi-cloudy \uF013 · wi-fog \uF014 · wi-sprinkle \uF01C · wi-rain-mix \uF017
	// wi-rain \uF019 · wi-snow \uF01B · wi-snowflake-cold \uF076 · wi-showers \uF01A
	// wi-snow-wind \uF064 · wi-thunderstorm \uF01E · wi-hail \uF015 · wi-na \uF07B
	const map = {
		0:  {icon: "\uF00D", label: "Dégagé"},
		1:  {icon: "\uF00C", label: "Plutôt dégagé"},
		2:  {icon: "\uF002", label: "Partiellement nuageux"},
		3:  {icon: "\uF013", label: "Couvert"},
		45: {icon: "\uF014", label: "Brouillard"},
		48: {icon: "\uF014", label: "Brouillard givrant"},
		51: {icon: "\uF01C", label: "Bruine"},
		53: {icon: "\uF01C", label: "Bruine"},
		55: {icon: "\uF019", label: "Forte bruine"},
		56: {icon: "\uF017", label: "Bruine verglaçante"},
		57: {icon: "\uF017", label: "Bruine verglaçante"},
		61: {icon: "\uF019", label: "Pluie"},
		63: {icon: "\uF019", label: "Pluie"},
		65: {icon: "\uF019", label: "Forte pluie"},
		66: {icon: "\uF017", label: "Pluie verglaçante"},
		67: {icon: "\uF017", label: "Pluie verglaçante"},
		71: {icon: "\uF01B", label: "Neige"},
		73: {icon: "\uF01B", label: "Neige"},
		75: {icon: "\uF01B", label: "Forte neige"},
		77: {icon: "\uF076", label: "Neige en grains"},
		80: {icon: "\uF01A", label: "Averses de pluie"},
		81: {icon: "\uF01A", label: "Averses de pluie"},
		82: {icon: "\uF019", label: "Fortes averses"},
		85: {icon: "\uF064", label: "Averses de neige"},
		86: {icon: "\uF064", label: "Fortes averses de neige"},
		95: {icon: "\uF01E", label: "Orage"},
		96: {icon: "\uF015", label: "Orage de grêle"},
		99: {icon: "\uF015", label: "Orage de grêle"},
	};
	return map[code] ?? {icon: WEATHER_ICON_NA, label: "Météo"};
}
