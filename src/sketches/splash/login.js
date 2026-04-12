/**
 * LOGIN phase — automated terminal login sequence.
 * Typewriter-animates username, password asterisks, authentication dots,
 * and a final "ACCESS GRANTED" message, then signals completion.
 *
 * Interface:
 *   createLoginPhase(sketch, artBuffer) → { draw(now), isDone(), reset() }
 */

import {THEME} from "../../lib/utils/retro-theme.js";

const BG = [...THEME.BG];

// ── Step definitions ──────────────────────────────────────────────────────────
// Each step has a label (static prefix), typed content, and inter-char delay.
const STEPS = {
	USERNAME:      0,
	PASSWORD:      1,
	AUTH_DOTS:     2,
	GRANTED:       3,
	DONE:          4,
};

const USERNAME_STR  = "guest";
const PASSWORD_MASK = "••••••••";
const AUTH_BASE     = "Authenticating";
const GRANTED_STR   = "ACCESS GRANTED — Welcome, guest.";

const CHAR_MS       = 80;
const PASSWORD_MS   = 110;
const DOT_MS        = 320;
const POST_GRANT_MS = 800; // pause after GRANTED before isDone()

/**
 * @param {import('p5')} sketch
 * @param {import('p5').Graphics} artBuffer
 */
export function createLoginPhase(sketch, artBuffer) {
	let step       = STEPS.USERNAME;
	let charIdx    = 0;
	let lastChar   = 0;
	let dotCount   = 0;
	let grantedAt  = null;

	// Accumulated display lines
	let lines      = [];
	let blinkVisible = true;
	let lastBlink  = 0;

	function reset() {
		step        = STEPS.USERNAME;
		charIdx     = 0;
		lastChar    = 0;
		dotCount    = 0;
		grantedAt   = null;
		lines       = [];
		blinkVisible = true;
		lastBlink   = 0;
	}

	function isDone() {
		return grantedAt !== null && sketch.millis() - grantedAt > POST_GRANT_MS;
	}

	function advance(now) {
		const delay = step === STEPS.PASSWORD ? PASSWORD_MS : step === STEPS.AUTH_DOTS ? DOT_MS : CHAR_MS;
		if (now - lastChar < delay) return;
		lastChar = now;

		if (step === STEPS.USERNAME) {
			charIdx++;
			if (charIdx >= USERNAME_STR.length) {
				lines.push("login: " + USERNAME_STR);
				step = STEPS.PASSWORD;
				charIdx = 0;
			}
		} else if (step === STEPS.PASSWORD) {
			charIdx++;
			if (charIdx >= PASSWORD_MASK.length) {
				lines.push("Password: " + PASSWORD_MASK);
				lines.push("");
				step = STEPS.AUTH_DOTS;
				charIdx = 0;
				dotCount = 0;
			}
		} else if (step === STEPS.AUTH_DOTS) {
			dotCount++;
			if (dotCount >= 3) {
				lines.push(AUTH_BASE + "...");
				step = STEPS.GRANTED;
				charIdx = 0;
			}
		} else if (step === STEPS.GRANTED) {
			charIdx++;
			if (charIdx >= GRANTED_STR.length) {
				lines.push(GRANTED_STR);
				step = STEPS.DONE;
				grantedAt = sketch.millis();
			}
		}
	}

	function draw(now) {
		advance(now);

		// Blink
		if (now - lastBlink > THEME.BLINK_MS) {
			blinkVisible = !blinkVisible;
			lastBlink = now;
		}

		const buf = artBuffer;
		const w = buf.width;
		const h = buf.height;
		const fontSize = Math.max(12, Math.round(w * 0.018));
		const lineH = fontSize * 1.6;
		const padLeft = w * 0.06;

		buf.background(...BG);
		buf.noStroke();
		buf.textFont("monospace");

		// ── Header ────────────────────────────────────────────────────────────
		const headerY = h * 0.09;
		buf.textAlign(sketch.LEFT, sketch.TOP);
		buf.textSize(Math.round(w * 0.022));
		buf.fill(...THEME.GREEN_PRIMARY);
		buf.text("Boot-Boy OS  3.0  —  ANEMOIA Interactive System", padLeft, headerY);

		// Separator line
		const sepY = headerY + fontSize * 2.4;
		buf.stroke(...THEME.GREEN_PRIMARY, 160);
		buf.strokeWeight(1);
		buf.line(padLeft, sepY, w - padLeft, sepY);
		buf.noStroke();

		// Status line
		buf.textSize(fontSize);
		buf.fill(...THEME.GREEN_SUBTLE, 180);
		buf.text("CONNECTED TO: ANEMOIA-SRV-01", padLeft, sepY + fontSize * 0.8);

		// ── Terminal lines ─────────────────────────────────────────────────────
		const termStartY = sepY + fontSize * 3.2;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const y = termStartY + i * lineH;
			if (line === "") continue;

			if (line === GRANTED_STR) {
				buf.fill(...THEME.GREEN_PRIMARY, 255);
			} else {
				buf.fill(...THEME.GREEN_MID);
			}
			buf.text(line, padLeft, y);
		}

		// ── Current in-progress line ───────────────────────────────────────────
		const currentY = termStartY + lines.length * lineH;

		if (step === STEPS.USERNAME) {
			const partial = "login: " + USERNAME_STR.slice(0, charIdx);
			buf.fill(...THEME.GREEN_MID);
			buf.text(partial, padLeft, currentY);
			// cursor
			if (blinkVisible) {
				const cx = padLeft + buf.textWidth(partial);
				buf.fill(...THEME.GREEN_PRIMARY);
				buf.rect(cx + 1, currentY + fontSize * 0.1, fontSize * 0.55, fontSize * 0.85);
			}
		} else if (step === STEPS.PASSWORD) {
			const partial = "Password: " + PASSWORD_MASK.slice(0, charIdx);
			buf.fill(...THEME.GREEN_MID);
			buf.text(partial, padLeft, currentY);
			if (blinkVisible) {
				const cx = padLeft + buf.textWidth(partial);
				buf.fill(...THEME.GREEN_PRIMARY);
				buf.rect(cx + 1, currentY + fontSize * 0.1, fontSize * 0.55, fontSize * 0.85);
			}
		} else if (step === STEPS.AUTH_DOTS) {
			const partial = AUTH_BASE + ".".repeat(dotCount);
			buf.fill(...THEME.GREEN_MID);
			buf.text(partial, padLeft, currentY);
		} else if (step === STEPS.GRANTED) {
			const partial = GRANTED_STR.slice(0, charIdx);
			buf.fill(...THEME.GREEN_PRIMARY, 255);
			buf.text(partial, padLeft, currentY);
			if (blinkVisible) {
				const cx = padLeft + buf.textWidth(partial);
				buf.fill(...THEME.GREEN_PRIMARY);
				buf.rect(cx + 1, currentY + fontSize * 0.1, fontSize * 0.55, fontSize * 0.85);
			}
		}
	}

	return {draw, isDone, reset};
}
