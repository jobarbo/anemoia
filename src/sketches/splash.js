/**
 * Splash screen orchestrator.
 *
 * State machine:
 *   BIOS  — POST-style diagnostic text streams in
 *   LOGO  — "Boot-Boy OS 3.0" splash box; any key advances
 *   LOGIN — automated terminal login sequence
 *   EXIT  — white flash → dispatch 'splash:complete'
 *
 * Each phase lives in its own module under ./splash/.
 * This file owns the p5 lifecycle (setup / draw / keyPressed / windowResized)
 * and the artBuffer → visible canvas pipeline.
 */

import {createBiosPhase}  from "./splash/bios.js";
import {createLogoPhase}  from "./splash/logo.js";
import {createLoginPhase} from "./splash/login.js";

const PHASE = {BIOS: 0, LOGO: 1, LOGIN: 2, EXIT: 3};

export default function (container) {
	/** P2D offscreen buffer — all phase drawing happens here. */
	let artBuffer;

	let phase = PHASE.BIOS;
	let exitFlashFrames = 0;

	/** Phase instances — created in setup once artBuffer is ready. */
	let bios  = null;
	let logo  = null;
	let login = null;

	return (sketch) => {
		// ── Setup ──────────────────────────────────────────────────────────────

		sketch.setup = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);

			artBuffer = sketch.createGraphics(w, h);
			artBuffer.noStroke();

			bios  = createBiosPhase(sketch, artBuffer);
			logo  = createLogoPhase(sketch, artBuffer);
			login = createLoginPhase(sketch, artBuffer);
		};

		// ── Draw ───────────────────────────────────────────────────────────────

		sketch.draw = () => {
			const now = sketch.millis();

			// Advance state machine
			if (phase === PHASE.BIOS  && bios.isDone())  phase = PHASE.LOGO;
			if (phase === PHASE.LOGO  && logo.isDone())  phase = PHASE.LOGIN;
			if (phase === PHASE.LOGIN && login.isDone()) phase = PHASE.EXIT;

			// Delegate drawing to active phase
			switch (phase) {
				case PHASE.BIOS:  bios.draw(now);  break;
				case PHASE.LOGO:  logo.draw(now);  break;
				case PHASE.LOGIN: login.draw(now); break;
				case PHASE.EXIT:  drawExit();       break;
			}

			// Blit artBuffer onto visible canvas
			sketch.clear();
			sketch.image(artBuffer, 0, 0);
		};

		// ── Exit flash ─────────────────────────────────────────────────────────

		function drawExit() {
			exitFlashFrames++;
			const alpha = sketch.map(exitFlashFrames, 0, sketch.frameRate() * 0.4, 255, 0);
			artBuffer.background(255, 255, 255, Math.max(0, alpha));

			if (exitFlashFrames > sketch.frameRate() * 0.18) {
				sketch.noLoop();
				document.dispatchEvent(new CustomEvent("splash:complete"));
			}
		}

		// ── Input ──────────────────────────────────────────────────────────────

		sketch.keyPressed = () => {
			if (phase === PHASE.LOGO) logo.onKeyPressed();
			return false; // prevent default browser scroll
		};

		// ── Resize ─────────────────────────────────────────────────────────────

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
		};
	};
}

