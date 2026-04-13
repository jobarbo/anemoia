/**
 * BIOS phase — streams pre-boot diagnostic text line by line
 * with a per-character typewriter effect, like a late-90s POST screen.
 *
 * Interface:
 *   createBiosPhase(sketch, artBuffer) → { draw(now), isDone(), reset() }
 */

import {THEME} from "../../lib/utils/retro-theme.js";

const LINES = [
	"BOOT-BOY BIOS  Version 1.04",
	"Copyright (C) 1998-2026  BootSoft Inc.  All rights reserved.",
	"",
	"CPU : Z80-Compatible  @  4.00 MHz .............. OK",
	"MEMORY TEST : 640K  Base Memory ................ OK",
	"MEMORY TEST : 32768K  Extended Memory .......... OK",
	"IDE CHANNEL 0 : Primary Master",
	"  QUANTUM FIREBALL  2.1GB  LBA HDS=4092 C=16 S=63",
	"INITIALIZING PCI BUS ........................... OK",
	"",
	"LOADING  BOOT-BOY OS  3.0 ...",
];

/** Milliseconds between revealing each character */
const CHAR_MS = 12;
/** Pause after each line finishes before starting the next */
const LINE_PAUSE_MS = 580;
/** Extra pause after all lines are revealed before isDone() returns true */
const DONE_PAUSE_MS = 700;

const BG = [0, 8, 8];
const FG = [...THEME.GREEN_MID];
const DIM = [...THEME.GREEN_SUBTLE];

/**
 * @param {import('p5')} sketch
 * @param {import('p5').Graphics} artBuffer
 */
export function createBiosPhase(sketch, artBuffer) {
	let lineIdx = 0;
	let charIdx = 0;
	let lastCharTime = 0;
	let linePauseUntil = 0; // timestamp until which we pause between lines
	let allDoneTime = null;
	let blinkVisible = true;
	let lastBlink = 0;

	function reset() {
		lineIdx = 0;
		charIdx = 0;
		lastCharTime = 0;
		linePauseUntil = 0;
		allDoneTime = null;
		blinkVisible = true;
		lastBlink = 0;
	}

	function isDone() {
		return allDoneTime !== null && sketch.millis() - allDoneTime > DONE_PAUSE_MS;
	}

	function draw(now) {
		// Advance typewriter
		if (allDoneTime === null) {
			if (now > linePauseUntil && now - lastCharTime > CHAR_MS) {
				lastCharTime = now;
				const currentLine = LINES[lineIdx] ?? "";
				if (charIdx < currentLine.length) {
					charIdx++;
				} else {
					// Line finished — pause before advancing to next
					linePauseUntil = now + LINE_PAUSE_MS;
					lineIdx++;
					charIdx = 0;
					if (lineIdx >= LINES.length) {
						allDoneTime = now;
					}
				}
			}
		}

		// Blink cursor
		if (now - lastBlink > THEME.BLINK_MS) {
			blinkVisible = !blinkVisible;
			lastBlink = now;
		}

		const buf = artBuffer;
		const w = buf.width;
		const h = buf.height;
		const fontSize = Math.max(12, Math.round(w * 0.018));
		const lineHeight = fontSize * 1.55;
		const padLeft = w * 0.06;
		const padTop = h * 0.1;

		buf.background(...BG);
		buf.noStroke();
		buf.textFont("monospace");
		buf.textSize(fontSize);
		buf.textAlign(sketch.LEFT, sketch.TOP);

		// First line gets a brighter header style
		for (let li = 0; li <= Math.min(lineIdx, LINES.length - 1); li++) {
			const isHeader = li === 0;
			const raw = LINES[li] ?? "";
			const revealed = li < lineIdx ? raw : raw.slice(0, charIdx);
			const y = padTop + li * lineHeight;

			if (isHeader) {
				buf.fill(...THEME.GREEN_PRIMARY);
			} else if (raw === "") {
				// blank lines — nothing to draw
				continue;
			} else {
				buf.fill(...FG);
			}

			buf.text(revealed, padLeft, y);

			// Cursor on current line
			if (li === lineIdx && allDoneTime === null && blinkVisible) {
				const cx = padLeft + buf.textWidth(revealed);
				buf.fill(...THEME.GREEN_PRIMARY);
				buf.rect(cx + 2, y + fontSize * 0.1, fontSize * 0.55, fontSize * 0.85);
			}
		}

		// After all lines, show cursor on the last line position
		if (allDoneTime !== null && blinkVisible) {
			const lastIdx = LINES.length - 1;
			const y = padTop + lastIdx * lineHeight;
			const cx = padLeft + buf.textWidth(LINES[lastIdx]);
			buf.fill(...THEME.GREEN_PRIMARY);
			buf.rect(cx + 2, y + fontSize * 0.1, fontSize * 0.55, fontSize * 0.85);
		}
	}

	return {draw, isDone, reset};
}
