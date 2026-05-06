/**
 * LOGIN phase — semi-interactive terminal login sequence.
 *
 * - Username "Archivist" is auto-typed.
 * - Password must be entered by the user (correct: "ketchup").
 *   Each character is echoed as "*". Backspace removes the last char.
 *   Enter submits. Wrong password shows an error and clears the field.
 * - On success: animated "Authenticating..." → "ACCESS GRANTED" → isDone().
 *
 * Interface:
 *   createLoginPhase(sketch, artBuffer, fontApi) → { draw(now), isDone(), onKeyPressed(keyCode, key), reset() }
 */

import {THEME} from "../../lib/utils/retro-theme.js";

const BG = [...THEME.BG];

const STEPS = {
	USERNAME_TYPING: 0,
	PASSWORD_PROMPT: 1,
	AUTH_DOTS: 2,
	GRANTED: 3,
	DONE: 4,
};

const USERNAME_STR = "Archivist";
const PASSWORD = "ketchup";
const AUTH_BASE = "Authentication";
const GRANTED_STR = "ACCESS GRANTED — Welcome, Archivist.";

const CHAR_MS = 80;
const DOT_MS = 320;
const POST_GRANT_MS = 900; // pause after GRANTED before isDone()

/**
 * @param {import('p5')} sketch
 * @param {import('p5').Graphics} artBuffer
 * @param {{ getCanvasFont?: () => string | import('p5').Font }} [fontApi]
 */
export function createLoginPhase(sketch, artBuffer, fontApi) {
	let step = STEPS.USERNAME_TYPING;
	let charIdx = 0; // for auto-typing username
	let lastChar = 0; // timer for auto-type
	let dotCount = 0; // for AUTH_DOTS
	let grantedAt = null;

	/** User's typed password input (plaintext, compared on Enter) */
	let passwordInput = "";

	/** Committed display lines (shown above the active prompt) */
	let lines = [];

	let blinkVisible = true;
	let lastBlink = 0;

	// auto-type state for GRANTED line
	let grantedCharIdx = 0;
	let lastGrantedChar = 0;

	function reset() {
		step = STEPS.USERNAME_TYPING;
		charIdx = 0;
		lastChar = 0;
		dotCount = 0;
		grantedAt = null;
		passwordInput = "";
		lines = [];
		blinkVisible = true;
		lastBlink = 0;
		grantedCharIdx = 0;
		lastGrantedChar = 0;
	}

	function isDone() {
		return grantedAt !== null && sketch.millis() - grantedAt > POST_GRANT_MS;
	}

	// ── Password key handler (called by orchestrator) ─────────────────────────

	/**
	 * Forward p5 keyPressed events here during the PASSWORD_PROMPT step.
	 * @param {number} keyCode - sketch.keyCode
	 * @param {string} key     - sketch.key
	 */
	function onKeyPressed(keyCode, key) {
		if (step !== STEPS.PASSWORD_PROMPT) return;

		const BACKSPACE = 8;
		const ENTER = 13;
		const RETURN = sketch.RETURN ?? 13;

		if (keyCode === BACKSPACE) {
			passwordInput = passwordInput.slice(0, -1);
		} else if (keyCode === ENTER || keyCode === RETURN) {
			_submitPassword();
		} else if (key && key.length === 1) {
			// printable char — max length guard
			if (passwordInput.length < 32) passwordInput += key;
		}
	}

	function _submitPassword() {
		const masked = "*".repeat(passwordInput.length);
		if (passwordInput === PASSWORD) {
			// Correct — commit and move to auth
			lines.push("password: " + masked);
			lines.push("");
			passwordInput = "";
			step = STEPS.AUTH_DOTS;
			dotCount = 0;
		} else {
			// Wrong — show masked attempt + error, clear, stay at prompt
			lines.push("password: " + masked);
			lines.push("  Incorrect login. Please try again.");
			lines.push("");
			passwordInput = "";
		}
	}

	// ── Auto-advance (username typing, auth dots, granted) ─────────────────────

	function tickAuto(now) {
		if (now - lastChar < CHAR_MS) return;
		lastChar = now;

		if (step === STEPS.USERNAME_TYPING) {
			charIdx++;
			if (charIdx >= USERNAME_STR.length) {
				lines.push("username: " + USERNAME_STR);
				step = STEPS.PASSWORD_PROMPT;
				charIdx = 0;
			}
		} else if (step === STEPS.AUTH_DOTS) {
			dotCount++;
			if (dotCount > 3) {
				lines.push(AUTH_BASE + "...");
				step = STEPS.GRANTED;
				grantedCharIdx = 0;
				lastGrantedChar = now;
			}
		}
	}

	function tickGranted(now) {
		if (step !== STEPS.GRANTED) return;
		if (now - lastGrantedChar < CHAR_MS) return;
		lastGrantedChar = now;
		grantedCharIdx++;
		if (grantedCharIdx >= GRANTED_STR.length) {
			lines.push(GRANTED_STR);
			step = STEPS.DONE;
			grantedAt = now;
		}
	}

	// ── Draw ──────────────────────────────────────────────────────────────────

	function draw(now) {
		tickAuto(now);
		tickGranted(now);

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
		const canvasFont = fontApi?.getCanvasFont?.() ?? "monospace";

		buf.background(...BG);
		buf.noStroke();
		fontApi?.applyCanvasFont?.(buf, fontSize) ?? buf.textFont(canvasFont);

		// ── Header ────────────────────────────────────────────────────────────
		const headerY = h * 0.09;
		buf.textAlign(sketch.LEFT, sketch.TOP);
		fontApi?.applyCanvasFont?.(buf, Math.round(w * 0.022)) ?? buf.textSize(Math.round(w * 0.022));
		buf.fill(...THEME.GREEN_PRIMARY);
		buf.text("Boot-Boy OS  3.0  —  ANEMOIA Interactive System", padLeft, headerY);

		// Separator line
		const sepY = headerY + fontSize * 2.4;
		buf.stroke(...THEME.GREEN_PRIMARY, 210);
		buf.strokeWeight(1);
		buf.line(padLeft, sepY, w - padLeft, sepY);
		buf.noStroke();

		// Status line
		fontApi?.applyCanvasFont?.(buf, fontSize) ?? buf.textSize(fontSize);
		buf.fill(...THEME.GREEN_SUBTLE, 230);
		buf.text("CONNECTED TO: ANEMOIA-SRV-01", padLeft, sepY + fontSize * 0.8);

		// ── Committed lines ───────────────────────────────────────────────────
		const termStartY = sepY + fontSize * 3.2;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line === "") continue;
			const y = termStartY + i * lineH;

			if (line === GRANTED_STR) {
				buf.fill(...THEME.GREEN_PRIMARY, 255);
			} else if (line.startsWith("  Login incorrect")) {
				buf.fill(220, 80, 80); // red-tinted error
			} else {
				buf.fill(...THEME.GREEN_MID);
			}
			buf.text(line, padLeft, y);
		}

		// ── Active / in-progress line ─────────────────────────────────────────
		const currentY = termStartY + lines.length * lineH;

		if (step === STEPS.USERNAME_TYPING) {
			const partial = "username: " + USERNAME_STR.slice(0, charIdx);
			buf.fill(...THEME.GREEN_MID);
			buf.text(partial, padLeft, currentY);
			if (blinkVisible) _drawCursor(buf, partial, padLeft, currentY, fontSize);
		} else if (step === STEPS.PASSWORD_PROMPT) {
			const masked = "password: " + "*".repeat(passwordInput.length);
			buf.fill(...THEME.GREEN_MID);
			buf.text(masked, padLeft, currentY);
			if (blinkVisible) _drawCursor(buf, masked, padLeft, currentY, fontSize);

			// Keyboard hint on first attempt (no lines yet after the login line)
			if (lines.length === 1) {
				buf.textAlign(sketch.LEFT, sketch.TOP);
				fontApi?.applyCanvasFont?.(buf, Math.max(10, Math.round(w * 0.012))) ?? buf.textSize(Math.max(10, Math.round(w * 0.012)));
				buf.fill(...THEME.GREEN_SUBTLE, 200);
				buf.text("Enter password and press ENTER", padLeft, currentY + lineH);
			}
		} else if (step === STEPS.AUTH_DOTS) {
			const partial = AUTH_BASE + ".".repeat(Math.min(dotCount, 3));
			buf.fill(...THEME.GREEN_MID);
			buf.text(partial, padLeft, currentY);
		} else if (step === STEPS.GRANTED) {
			const partial = GRANTED_STR.slice(0, grantedCharIdx);
			buf.fill(...THEME.GREEN_PRIMARY, 255);
			buf.text(partial, padLeft, currentY);
			if (blinkVisible) _drawCursor(buf, partial, padLeft, currentY, fontSize);
		}
	}

	function _drawCursor(buf, text, padLeft, y, fontSize) {
		const cx = padLeft + buf.textWidth(text);
		buf.fill(...THEME.GREEN_PRIMARY);
		buf.rect(cx + 1, y + fontSize * 0.1, fontSize * 0.55, fontSize * 0.85);
	}

	return {draw, isDone, onKeyPressed, reset};
}
