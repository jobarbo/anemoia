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

import {loadSlicedSfx, playSlicedSfx} from "../../lib/audio/sliced-audio-sfx.js";
import {playSfx} from "../../lib/audio/sfx.js";
import {THEME, readingUiFontSize} from "../../lib/utils/retro-theme.js";

const BG = [...THEME.BG];

/** Plusieurs one-shots dans un seul fichier ; découpe auto (`loadSlicedSfx` dans `sliced-audio-sfx.js`). */
const LOGIN_SLICED_SFX_URL = "/assets/scenes/splash/click-array.mp3";
/**
 * Si la détection fusionne ou coupe trop : ajuster `minOnsetGapMs` / `noveltyThreshold`
 * (voir `detectOnsetSamples` dans `sliced-audio-sfx.js`).
 */
const LOGIN_SLICED_SFX_ANALYSIS = {
	minOnsetGapMs: 40,
	noveltyThreshold: 0.16,
	minEnergyRatio: 0.04,
	discardSegmentsShorterThanMs: 15,
	gapBeforeNextMs: 0,
	maxDurationSec: 1.5,
};

/** Secours si le pack découpé est indisponible. */
const LOGIN_KEYCLICK_SFX_LIST = ["/assets/scenes/splash/click3.mp3"];

const LOGIN_KEYCLICK_VOLUME = 0.65;

const STEPS = {
	USERNAME_TYPING: 0,
	PASSWORD_PROMPT: 1,
	AUTH_DOTS: 2,
	GRANTED: 3,
	DONE: 4,
};

const USERNAME_STR = "Archiviste";
const PASSWORD = "ketchup";
const AUTH_BASE = "Authentification";
const GRANTED_STR = "ACCÈS ACCORDÉ — Bienvenue, Archiviste.";

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

	/** @type {{ buffer: AudioBuffer, segments: { startSec: number, durationSec: number }[] } | null} */
	let slicedSfxPack = null;
	let slicedSfxLoadStarted = false;

	function ensureSlicedSfxLoaded() {
		if (slicedSfxLoadStarted) return;
		slicedSfxLoadStarted = true;
		void loadSlicedSfx(LOGIN_SLICED_SFX_URL, LOGIN_SLICED_SFX_ANALYSIS).then((data) => {
			if (data.buffer && data.segments.length > 0) slicedSfxPack = data;
		});
	}

	/**
	 * Variante aléatoire parmi les segments du pack. Index fixe : `playSlicedSfx(pack.buffer, pack.segments[i], vol)`.
	 */
	function playRandomKeyclick() {
		if (slicedSfxPack?.buffer && slicedSfxPack.segments.length > 0) {
			const idx = Math.floor(sketch.random(slicedSfxPack.segments.length));
			playSlicedSfx(slicedSfxPack.buffer, slicedSfxPack.segments[idx], LOGIN_KEYCLICK_VOLUME);
			return;
		}
		if (LOGIN_KEYCLICK_SFX_LIST.length > 0) {
			playSfx(sketch.random(LOGIN_KEYCLICK_SFX_LIST), {volume: LOGIN_KEYCLICK_VOLUME});
		}
	}

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
			if (passwordInput.length > 0) {
				playRandomKeyclick();
				passwordInput = passwordInput.slice(0, -1);
			}
		} else if (keyCode === ENTER || keyCode === RETURN) {
			_submitPassword();
		} else if (key && key.length === 1) {
			// printable char — max length guard
			if (passwordInput.length < 32) {
				playRandomKeyclick();
				passwordInput += key;
			}
		}
	}

	function _submitPassword() {
		const masked = "*".repeat(passwordInput.length);
		if (passwordInput === PASSWORD) {
			// Correct — commit and move to auth
			lines.push("mot de passe: " + masked);
			lines.push("");
			passwordInput = "";
			step = STEPS.AUTH_DOTS;
			dotCount = 0;
		} else {
			// Wrong — show masked attempt + error, clear, stay at prompt
			lines.push("mot de passe: " + masked);
			lines.push("  Identifiant incorrect. Veuillez réessayer.");
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
				lines.push("identifiant: " + USERNAME_STR);
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
		ensureSlicedSfxLoaded();
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
		const fontSize = readingUiFontSize(Math.max(12, Math.round(w * 0.018)));
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
		buf.text("Boot-Boy OS  3.0  —  Système Interactif ANEMOIA", padLeft, headerY);

		// Separator line
		const sepY = headerY + fontSize * 2.4;
		buf.stroke(...THEME.GREEN_PRIMARY, 210);
		buf.strokeWeight(1);
		buf.line(padLeft, sepY, w - padLeft, sepY);
		buf.noStroke();

		// Status line
		fontApi?.applyCanvasFont?.(buf, fontSize) ?? buf.textSize(fontSize);
		buf.fill(...THEME.GREEN_SUBTLE, 230);
		buf.text("CONNECTÉ À: ANEMOIA-SRV-01", padLeft, sepY + fontSize * 0.8);

		// ── Committed lines ───────────────────────────────────────────────────
		const termStartY = sepY + fontSize * 3.2;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line === "") continue;
			const y = termStartY + i * lineH;

			if (line === GRANTED_STR) {
				buf.fill(...THEME.GREEN_PRIMARY, 255);
			} else if (line.startsWith("  Identifiant incorrect")) {
				buf.fill(220, 80, 80); // red-tinted error
			} else {
				buf.fill(...THEME.GREEN_MID);
			}
			buf.text(line, padLeft, y);
		}

		// ── Active / in-progress line ─────────────────────────────────────────
		const currentY = termStartY + lines.length * lineH;

		if (step === STEPS.USERNAME_TYPING) {
			const partial = "identifiant: " + USERNAME_STR.slice(0, charIdx);
			buf.fill(...THEME.GREEN_MID);
			buf.text(partial, padLeft, currentY);
			if (blinkVisible) _drawCursor(buf, partial, padLeft, currentY, fontSize);
		} else if (step === STEPS.PASSWORD_PROMPT) {
			const masked = "mot de passe: " + "*".repeat(passwordInput.length);
			buf.fill(...THEME.GREEN_MID);
			buf.text(masked, padLeft, currentY);
			if (blinkVisible) _drawCursor(buf, masked, padLeft, currentY, fontSize);

			// Keyboard hint on first attempt (no lines yet after the login line)
			if (lines.length === 1) {
				buf.textAlign(sketch.LEFT, sketch.TOP);
				const hintPx = readingUiFontSize(Math.max(10, Math.round(w * 0.012)));
				fontApi?.applyCanvasFont?.(buf, hintPx) ?? buf.textSize(hintPx);
				buf.fill(...THEME.GREEN_SUBTLE, 200);
				buf.text("Entrez le mot de passe et appuyez sur ENTRÉE", padLeft, currentY + lineH);
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
