/**
 * Shared canvas UI: main navigation sidebar (Bureau, Carte, quartier, récits).
 * Used by story and neighborhood p5 sketches — matches overworld list styling.
 */

import {getNeighborhood} from "../data/scene-data.js";
import {THEME, applyThemeCanvasFont, hitTest, truncateCanvasTextToFitWidth} from "../utils/retro-theme.js";

/** @typedef {{ id: string, label: string, needsNeighborhood?: boolean }} NavLinkDef */

/** @type {NavLinkDef[]} */
const NAV_LINK_DEFS = [
	{id: "desktop", label: "Bureau"},
	{id: "overworld", label: "Carte"},
	{id: "neighborhood", label: "Ce quartier", needsNeighborhood: true},
];

/**
 * @param {string | undefined} neighborhoodSlug
 * @param {{ omitNeighborhoodLink?: boolean, neighborhoodLinked?: boolean }} [options]
 * @returns {NavLinkDef[]}
 */
export function getVisibleNavLinks(neighborhoodSlug, options = {}) {
	const slug = String(neighborhoodSlug ?? "").trim();
	const omitSelf = options.omitNeighborhoodLink === true;
	const explicitLinked = options.neighborhoodLinked;

	return NAV_LINK_DEFS.filter((l) => {
		if (!l.needsNeighborhood) return true;
		if (omitSelf) return false;
		if (!slug.length) return false;
		const linked = typeof explicitLinked === "boolean" ? explicitLinked : Boolean(getNeighborhood(slug));
		return linked;
	});
}

/** @param {MainNavSidebarContext} ctx */
function navLinksForContext(ctx) {
	return getVisibleNavLinks(ctx.neighborhoodSlug, {
		omitNeighborhoodLink: ctx.omitNeighborhoodLink,
		neighborhoodLinked: ctx.neighborhoodLinked,
	});
}

/**
 * @param {number} canvasW
 * @param {number} topInset - y offset where the sidebar starts (e.g. story top bar height)
 * @param {number} canvasH
 */
export function computeMainNavSidebarRect(canvasW, topInset, canvasH) {
	const sidebarW = Math.max(240, Math.min(380, canvasW * 0.28));
	const h = Math.max(0, canvasH - topInset);
	return {x: 0, y: topInset, w: sidebarW, h};
}

/**
 * @param {number} canvasW
 * @returns {number}
 */
export function computeMainNavSidebarWidth(canvasW) {
	return Math.max(240, Math.min(380, canvasW * 0.28));
}

/**
 * @typedef {{
 *   neighborhoodSlug?: string,
 *   neighborhoodName?: string,
 *   stories?: Array<{ slug: string, title: string }>,
 *   currentStorySlug?: string | null,
 *   storyScrollY?: number,
 *   hoveredLinkId?: string | null,
 *   hoveredStorySlug?: string | null,
 *   omitNeighborhoodLink?: boolean,
 *   neighborhoodLinked?: boolean,
 * }} MainNavSidebarContext
 */

/**
 * Geometry for the story list (scroll + hit test).
 *
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {MainNavSidebarContext} ctx
 * @param {number} canvasW - full canvas width (for titleSize match with draw)
 * @returns {{
 *   storiesStartY: number,
 *   storyScrollMax: number,
 *   storiesClip: { x: number, y: number, w: number, h: number } | null,
 *   storyRowH: number,
 *   storyGap: number,
 *   padX: number,
 * }}
 */
export function measureMainNavStoryList(rect, ctx, canvasW) {
	const stories = Array.isArray(ctx.stories) ? ctx.stories : [];
	const padX = rect.w * 0.08;
	const padY = Math.max(10, rect.h * 0.028);
	const titleSize = Math.max(11, canvasW * 0.0105);
	const links = navLinksForContext(ctx);
	const linkSize = Math.max(12, rect.w * 0.078);
	const linkRowH = Math.max(30, linkSize * 1.55);
	const linkGap = Math.max(5, rect.h * 0.012);

	let cy = rect.y + padY + titleSize * 1.35;
	for (let i = 0; i < links.length; i++) {
		cy += linkRowH + linkGap;
	}
	cy += linkGap * 0.5 + padY * 0.9 + titleSize * 1.2;

	const storySize = Math.max(11, rect.w * 0.068);
	const storyRowH = Math.max(26, storySize * 1.45);
	const storyGap = Math.max(4, rect.h * 0.008);
	const clipTop = cy;
	const clipH = Math.max(0, rect.y + rect.h - padY - clipTop);
	const storiesClip = clipH > 8 ? {x: rect.x + padX * 0.5, y: clipTop, w: rect.w - padX, h: clipH} : null;
	const totalStoriesH = stories.length > 0 ? stories.length * (storyRowH + storyGap) - storyGap : 0;
	const storyScrollMax = Math.max(0, totalStoriesH - clipH);
	return {storiesStartY: cy, storyScrollMax, storiesClip, storyRowH, storyGap, padX};
}

/**
 * @param {p5.Graphics} buf
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {MainNavSidebarContext} ctx
 * @param {import('p5')} p
 * @returns {{ storyScrollMax: number, storiesClip: { x: number, y: number, w: number, h: number } | null, storyScrollY: number }}
 */
export function drawMainNavSidebar(buf, rect, ctx, p) {
	const stories = Array.isArray(ctx.stories) ? ctx.stories : [];
	const padX = rect.w * 0.08;
	const padY = Math.max(10, rect.h * 0.028);
	const titleSize = Math.max(11, buf.width * 0.0105);

	const listMetrics = measureMainNavStoryList(rect, ctx, buf.width);
	const clipTop = listMetrics.storiesStartY;
	const storiesClip = listMetrics.storiesClip;
	const clipH = storiesClip ? storiesClip.h : 0;
	const storyRowH = listMetrics.storyRowH;
	const storyGap = listMetrics.storyGap;
	const storyScrollMax = listMetrics.storyScrollMax;
	const scrollY = Math.min(Math.max(0, ctx.storyScrollY ?? 0), storyScrollMax);

	buf.fill(...THEME.BG, 228);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(2);
	buf.rect(rect.x, rect.y, rect.w, rect.h, 14);
	buf.noStroke();

	const links = navLinksForContext(ctx);
	const linkSize = Math.max(12, rect.w * 0.078);
	const linkRowH = Math.max(30, linkSize * 1.55);
	const linkGap = Math.max(5, rect.h * 0.012);

	let cy = rect.y + padY;
	applyThemeCanvasFont(buf, titleSize, p);
	buf.fill(255, 255, 255, 245);
	buf.textAlign(p.LEFT, p.TOP);
	buf.text("Navigation", rect.x + padX, cy);
	cy += titleSize * 1.35;

	for (const def of links) {
		const hovered = ctx.hoveredLinkId === def.id;
		const isNeighborhood = def.id === "neighborhood";
		buf.stroke(...THEME.GREEN_PRIMARY, hovered ? 200 : 100);
		buf.strokeWeight(2);
		buf.fill(...THEME.BG, hovered ? 200 : 140);
		buf.rect(rect.x + padX, cy, rect.w - padX * 2, linkRowH, 8);
		buf.noStroke();
		applyThemeCanvasFont(buf, linkSize, p);
		buf.fill(...THEME.GREEN_MID, hovered ? 255 : 220);
		buf.textAlign(p.LEFT, p.CENTER);
		const linkTextX = rect.x + padX * 1.35;
		const linkInnerRight = rect.x + rect.w - padX;
		const linkTextRightMargin = Math.max(8, padX * 0.55);
		const linkMaxW = Math.max(20, linkInnerRight - linkTextX - linkTextRightMargin);
		const rawLinkLabel = isNeighborhood ? ctx.neighborhoodName || ctx.neighborhoodSlug || def.label : def.label;
		const label = truncateCanvasTextToFitWidth(buf, rawLinkLabel, linkMaxW);
		buf.text(label, linkTextX, cy + linkRowH * 0.52);
		cy += linkRowH + linkGap;
	}

	cy += linkGap * 0.5;
	buf.stroke(...THEME.GREEN_MID, 90);
	buf.strokeWeight(1);
	buf.line(rect.x + padX, cy, rect.x + rect.w - padX, cy);
	buf.noStroke();
	cy += padY * 0.9;

	const secTitle = "Récits";
	applyThemeCanvasFont(buf, titleSize, p);
	buf.fill(...THEME.GREEN_SUBTLE, 230);
	buf.textAlign(p.LEFT, p.TOP);
	buf.text(secTitle, rect.x + padX, cy);
	cy += titleSize * 1.2;

	const storySize = Math.max(11, rect.w * 0.068);

	if (storiesClip && stories.length > 0) {
		buf.drawingContext.save();
		buf.drawingContext.beginPath();
		buf.drawingContext.rect(storiesClip.x, storiesClip.y, storiesClip.w, storiesClip.h);
		buf.drawingContext.clip();

		for (let i = 0; i < stories.length; i++) {
			const rowY = clipTop + i * (storyRowH + storyGap) - scrollY;
			const slug = stories[i].slug;
			const active = ctx.currentStorySlug === slug;
			const hovered = ctx.hoveredStorySlug === slug;
			buf.stroke(...THEME.GREEN_PRIMARY, hovered || active ? 190 : 85);
			buf.strokeWeight(active ? 2 : 1);
			buf.fill(...THEME.BG, hovered || active ? 195 : 115);
			buf.rect(rect.x + padX, rowY, rect.w - padX * 2, storyRowH, 7);
			buf.noStroke();
			applyThemeCanvasFont(buf, storySize, p);
			buf.fill(...THEME.GREEN_MID, 255);
			buf.textAlign(p.LEFT, p.CENTER);
			const storyTextX = rect.x + padX * 1.2;
			const storyInnerRight = rect.x + rect.w - padX;
			/** Réserve pour la barre de scroll (x ≈ rect.w−8, largeur 4) + marge intérieure du bouton */
			const storyRightReserve = storyScrollMax > 1 ? 22 : Math.max(8, padX * 0.6);
			const storyMaxW = Math.max(18, storyInnerRight - storyTextX - storyRightReserve);
			const t = truncateCanvasTextToFitWidth(buf, stories[i].title ?? slug, storyMaxW);
			buf.text(t, storyTextX, rowY + storyRowH * 0.52);
		}

		buf.drawingContext.restore();

		if (storyScrollMax > 1) {
			const barX = rect.x + rect.w - 6;
			const barY = clipTop;
			const barH = clipH;
			buf.noStroke();
			buf.fill(...THEME.GREEN_PRIMARY, 60);
			buf.rect(barX - 2, barY, 4, barH, 2);
			const thumbH = Math.max(16, barH * (clipH / (clipH + storyScrollMax)));
			const thumbY = barY + (storyScrollMax > 0 ? (scrollY / storyScrollMax) * (barH - thumbH) : 0);
			buf.fill(...THEME.GREEN_MID, 200);
			buf.rect(barX - 2, thumbY, 4, thumbH, 2);
		}
	} else if (stories.length === 0) {
		applyThemeCanvasFont(buf, storySize * 0.95, p);
		buf.fill(...THEME.GREEN_SUBTLE, 160);
		buf.textAlign(p.LEFT, p.TOP);
		buf.text("Aucun récit lié", rect.x + padX, clipTop);
	}

	return {storyScrollMax, storiesClip, storyScrollY: scrollY};
}

/**
 * @param {number} px
 * @param {number} py
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {MainNavSidebarContext} ctx
 * @param {import('p5')} p
 * @returns {{ kind: 'link', id: string } | { kind: 'story', slug: string } | null}
 */
export function hitMainNavSidebar(px, py, rect, ctx, p) {
	if (!hitTest(px, py, rect)) return null;
	const stories = Array.isArray(ctx.stories) ? ctx.stories : [];
	const padX = rect.w * 0.08;
	const padY = Math.max(10, rect.h * 0.028);
	const titleSize = Math.max(11, p.width * 0.0105);
	const links = navLinksForContext(ctx);
	const linkSize = Math.max(12, rect.w * 0.078);
	const linkRowH = Math.max(30, linkSize * 1.55);
	const linkGap = Math.max(5, rect.h * 0.012);

	let cy = rect.y + padY + titleSize * 1.35;
	for (const def of links) {
		const r = {x: rect.x + padX, y: cy, w: rect.w - padX * 2, h: linkRowH};
		if (hitTest(px, py, r)) return {kind: "link", id: def.id};
		cy += linkRowH + linkGap;
	}

	const m = measureMainNavStoryList(rect, ctx, p.width);
	const scrollY = Math.min(Math.max(0, ctx.storyScrollY ?? 0), m.storyScrollMax);

	if (m.storiesClip && stories.length > 0 && hitTest(px, py, m.storiesClip)) {
		for (let i = 0; i < stories.length; i++) {
			const rowY = m.storiesStartY + i * (m.storyRowH + m.storyGap) - scrollY;
			const r = {x: rect.x + padX, y: rowY, w: rect.w - padX * 2, h: m.storyRowH};
			if (rowY + m.storyRowH < m.storiesClip.y || rowY > m.storiesClip.y + m.storiesClip.h) continue;
			if (hitTest(px, py, r)) return {kind: "story", slug: stories[i].slug};
		}
	}

	return null;
}

/**
 * @param {number} px
 * @param {number} py
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {MainNavSidebarContext} ctx
 * @param {import('p5')} p
 */
export function pointerInMainNavStoriesClip(px, py, rect, ctx, p) {
	const m = measureMainNavStoryList(rect, ctx, p.width);
	const clip = m.storiesClip;
	return Boolean(clip && hitTest(px, py, rect) && hitTest(px, py, clip));
}

/** Width of the floating open-nav button (px). Used for hit-testing. */
export const NAV_SIDEBAR_TOGGLE_RAIL_PX = 40;

const NAV_TOGGLE_BTN_W = 40;
const NAV_TOGGLE_BTN_H = 120;

/**
 * Returns a rect for the floating "open nav" pill button anchored to the left edge.
 * @param {number} canvasH
 * @param {number} [topInset=0]
 */
export function layoutNavSidebarToggleRail(canvasH, topInset = 0) {
	const availH = Math.max(0, canvasH - topInset);
	const btnH = Math.min(NAV_TOGGLE_BTN_H, availH * 0.18);
	const btnY = topInset + (availH - btnH) / 2;
	return {x: 20, y: btnY, w: NAV_TOGGLE_BTN_W, h: btnH};
}

/**
 * Button in the top-right corner of the open sidebar to collapse it.
 *
 * @param {{ x: number, y: number, w: number, h: number }} sidebarRect
 */
export function layoutNavSidebarCollapseTab(sidebarRect) {
	const btnW = Math.min(52, sidebarRect.w * 0.22);
	const btnH = Math.min(40, Math.max(32, sidebarRect.h * 0.06));
	return {x: sidebarRect.x + sidebarRect.w - btnW - 6, y: sidebarRect.y + 6, w: btnW, h: btnH};
}

/**
 * @param {p5.Graphics} buf
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {boolean} hovered
 * @param {import('p5')} p
 */
export function drawNavSidebarToggleRail(buf, rect, hovered, p) {
	const r = rect.h * 0.38;
	// Drop shadow for depth
	buf.noStroke();
	buf.fill(0, 0, 0, hovered ? 90 : 60);
	buf.rect(rect.x + 3, rect.y + 4, rect.w, rect.h, 0, r, r, 0);
	// Button body — solid fill anchored to left edge (flat left, rounded right)
	buf.strokeWeight(2);
	buf.stroke(...THEME.GREEN_PRIMARY, hovered ? 255 : 190);
	buf.fill(...THEME.BG, hovered ? 240 : 210);
	buf.rect(rect.x, rect.y, rect.w, rect.h, r, r, r, r);
	buf.noStroke();
	// Three horizontal bars (hamburger icon)
	const cx = rect.x + rect.w * 0.54;
	const cy = rect.y + rect.h * 0.5;
	const barW = rect.w * 0.52;
	const barH = Math.max(2, rect.h * 0.025);
	const gap = rect.h * 0.085;
	buf.fill(...THEME.GREEN_MID, hovered ? 255 : 220);
	buf.rect(cx - barW / 2, cy - gap - barH / 2, barW, barH, 2);
	buf.rect(cx - barW / 2, cy - barH / 2, barW, barH, 2);
	buf.rect(cx - barW / 2, cy + gap - barH / 2, barW, barH, 2);
}

/**
 * @param {p5.Graphics} buf
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {boolean} hovered
 * @param {import('p5')} p
 */
export function drawNavSidebarCollapseTab(buf, rect, hovered, p) {
	const r = 6;
	// Drop shadow
	buf.noStroke();
	buf.fill(0, 0, 0, hovered ? 80 : 50);
	buf.rect(rect.x + 2, rect.y + 3, rect.w, rect.h, r);
	// Button body
	buf.strokeWeight(2);
	buf.stroke(...THEME.GREEN_PRIMARY, hovered ? 255 : 190);
	buf.fill(...THEME.BG, hovered ? 240 : 210);
	buf.rect(rect.x, rect.y, rect.w, rect.h, r);
	buf.noStroke();
	// × close icon
	const cx = rect.x + rect.w * 0.5;
	const cy = rect.y + rect.h * 0.46;
	const armLen = Math.min(rect.w, rect.h) * 0.28;
	const armH = Math.max(2, Math.min(rect.w, rect.h) * 0.11);
	buf.fill(...THEME.GREEN_MID, hovered ? 255 : 220);
	buf.push();
	buf.translate(cx, cy);
	buf.rotate(Math.PI / 4);
	buf.rect(-armLen, -armH / 2, armLen * 2, armH, 2);
	buf.rect(-armH / 2, -armLen, armH, armLen * 2, 2);
	buf.pop();
	// "[N]" hint
	const hintSz = Math.max(7, rect.h * 0.2);
	applyThemeCanvasFont(buf, hintSz, p);
	buf.textAlign(p.CENTER, p.CENTER);
	buf.fill(...THEME.GREEN_SUBTLE, hovered ? 210 : 140);
	buf.text("[N]", cx, rect.y + rect.h - hintSz * 0.9);
}
