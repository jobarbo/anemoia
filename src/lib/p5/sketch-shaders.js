/**
 * Sketch Shader Effects
 *
 * A modular, plug-and-play shader effects system for p5.js projects.
 * This file contains all shader-related code and configuration, keeping sketch.js clean.
 *
 * Features:
 * - Easy configuration of multiple shader effects
 * - Dynamic enable/disable of effects
 * - Animated shader parameters with time control
 * - Seamless integration with ShaderManager and ShaderPipeline
 * - Reusable across projects with minimal setup
 *
 * Usage (p5.js 2.x — no preload):
 * 1. async setup() { await shaderEffects.loadShaders(sketch); … }
 * 2. shaderEffects.setup(width, height, mainCanvas, webglP5Instance)
 * 3. In draw: shaderEffects.updateTime / apply as needed
 *
 * ES modules: import { ShaderEffects } from "../lib/p5/sketch-shaders.js"
 *
 * Per-sketch filters (only this file’s defaults are merged):
 *   new ShaderEffects({
 *     effects: { crtWarp: { enabled: true, warpAmount: 0.5, aspectCorrect: 1.0 }, grain: { enabled: true, amount: 0.04 } },
 *   });
 * Or call applyEffectsConfig({ pixelSort: { enabled: true } }) after changing presets at runtime.
 */
import {ShaderManager} from "./shaderManager.js";
import {ShaderPipeline} from "./shaderPipeline.js";

/**
 * @param {Record<string, object>} target
 * @param {Record<string, object>} patch
 */
function mergeEffectsConfig(target, patch) {
	if (!patch || typeof patch !== "object") return;
	for (const name of Object.keys(patch)) {
		const delta = patch[name];
		if (!delta || typeof delta !== "object") continue;
		if (!target[name]) {
			console.warn(`[ShaderEffects] Unknown effect "${name}" — use a built-in name or addEffect()`);
			continue;
		}
		const existing = target[name];
		for (const [k, v] of Object.entries(delta)) {
			if (k === "uniforms" && v && typeof v === "object" && !Array.isArray(v)) {
				existing.uniforms = {...existing.uniforms, ...v};
			} else if (v !== undefined) {
				existing[k] = v;
			}
		}
		if (name === "crtWarp" && Object.prototype.hasOwnProperty.call(delta, "borderMode") && delta.borderMode !== undefined) {
			const modes = {black: 0, clamp: 1, mirror: 2};
			const key = String(delta.borderMode).toLowerCase();
			if (key in modes) {
				existing.borderColor = modes[key];
			}
		}
	}
}

export class ShaderEffects {
	/**
	 * @param {{ effects?: Record<string, object>; effectsConfig?: Record<string, object> }} [options] effectsConfig is an alias of effects
	 */
	constructor(options = {}) {
		// Shader animation control
		this.continueShadersAfterCompletion = true; // Set to false to stop shaders when sketch is done
		this.applyShadersDuringSketch = true; // Set to true to apply shaders while sketching
		this.shaderFrameRate = 60; // Frame rate for shader animation

		// Animation state
		this.shaderTime = 0;
		this.shaderSeed = 0;
		this.particleAnimationComplete = false;

		// Translation state tracking (to prevent position jumps when speed changes)
		this.translationPhase = {
			symmetry: {x: 0, y: 0},
			symmetry2: {x: 0, y: 0},
		};
		this.lastTranslationSpeed = {
			symmetry: null,
			symmetry2: null,
		};

		// Rotation state tracking (to prevent angle jumps when speed changes)
		this.rotationPhase = {
			symmetry: 0,
			symmetry2: 0,
		};
		this.lastRotationSpeed = {
			symmetry: null,
			symmetry2: null,
		};
		this.lastRotationOscillationSpeed = {
			symmetry: null,
			symmetry2: null,
		};
		this.currentRotationAngle = {
			symmetry: 0,
			symmetry2: 0,
		};

		// Canvas references
		this.mainCanvas = null;
		this.shaderCanvas = null;

		// Shader system references
		this.shaderManager = null;
		this.shaderPipeline = null;
		this.p5Instance = null;

		// Effects configuration - customize these for your sketch
		this.effectsConfig = {
			deform: {
				enabled: false,
				amount: 0.1,
				timeMultiplier: 0.0,
				octave: 4.0,
				uniforms: {
					uTime: "shaderTime * timeMultiplier",
					uSeed: "shaderSeed",
					uAmount: "amount",
					uOctave: "octave",
				},
			},

			collage: {
				enabled: false,
				amount: 1.0,
				tileSize: 255.0,
				tileSize2: 50.0,
				tileSize3: 100.0,
				sizeNoise: 23.0,
				rotNoise: 24.0,
				timeMultiplier: 0.0,
				uniforms: {
					uSeed: "shaderSeed + 2222.0",
					uTileSize1: "tileSize",
					uTileSize2: "tileSize2",
					uTileSize3: "tileSize3",
					uSizeNoise: "sizeNoise",
					uRotNoise: "rotNoise",
					uAmount: "amount",
					uResolution: "[width, height]",
				},
			},

			grain: {
				enabled: false,
				amount: 0.1,
				timeMultiplier: 0.0,
				uniforms: {
					uTime: "shaderTime * timeMultiplier",
					uSeed: "shaderSeed + 345.0",
					uAmount: "amount",
				},
			},

			symmetry: {
				enabled: false,
				symmetryMode: 0.0, // 0=horizontal, 1=vertical, 2=2-line, 3=4-line, 4=8-line, 5=16-line, 6=radial
				amount: 1.0, // Blend strength [0..1]
				debug: 0.0, // 0.0 = normal, 1.0 = debug mode (shows fold lines and center)
				center: [0.5, 0.5], // symmetry center in normalized coords
				translationSpeed: 0.005, // Speed of horizontal/vertical movement
				translationMode: 1.0, // 0=sine, 1=noise, 2=FBM, 3=vector field
				translationNoiseScale: 0.5, // Scale of noise variation (lower = smoother, higher = more frequent changes)
				translationPhaseX: 0.0, // Accumulated phase for X translation (prevents jumps)
				translationPhaseY: 0.0, // Accumulated phase for Y translation (prevents jumps)
				rotationSpeed: 0.81, // Speed of rotation
				rotationOscillationSpeed: 0.5, // Speed of oscillation (controls how fast it alternates between positive/negative)
				rotationStartingAngle: 0.0, // Starting angle for rotation (in radians, added to rotation)
				rotationMode: 1.0, // 0=cosine oscillation, 1=noise, 2=FBM
				rotationNoiseScale: 0.1, // Scale of rotation noise (lower = smoother, higher = more frequent changes)
				rotationPhase: 0.0, // Accumulated phase for rotation (prevents jumps)
				rotationAmplitude: 50.0, // Fixed amplitude - speed controls phase accumulation rate, not amplitude
				timeMultiplier: 0.2, // Time multiplier for animation
				uniforms: {
					uResolution: "[width, height]",
					uSeed: "shaderSeed + 1234.0",
					uSymmetryMode: "symmetryMode",
					uAmount: "amount",
					uDebug: "debug",
					uCenter: "center",
					uTime: "shaderTime * timeMultiplier",
					uTranslationSpeed: "translationSpeed",
					uTranslationMode: "translationMode",
					uTranslationNoiseScale: "translationNoiseScale",
					uTranslationPhaseX: "translationPhaseX",
					uTranslationPhaseY: "translationPhaseY",
					uRotationSpeed: "rotationSpeed",
					uRotationOscillationSpeed: "rotationOscillationSpeed",
					uRotationStartingAngle: "rotationStartingAngle",
					uRotationMode: "rotationMode",
					uRotationNoiseScale: "rotationNoiseScale",
					uRotationPhase: "rotationPhase",
					uRotationAmplitude: "rotationAmplitude",
				},
			},
			symmetry2: {
				enabled: false,
				symmetryMode: 2.0, // 0=horizontal, 1=vertical, 2=2-line, 3=4-line, 4=8-line, 5=16-line, 6=radial
				amount: 1.0, // Blend strength [0..1]
				debug: 0.0, // 0.0 = normal, 1.0 = debug mode (shows fold lines and center)
				center: [0.5, 0.5], // symmetry center in normalized coords
				translationSpeed: 1.5, // Speed of horizontal/vertical movement
				translationMode: 1.0, // 0=sine, 1=noise, 2=FBM, 3=vector field
				translationNoiseScale: 0.2, // Scale of noise variation (lower = smoother, higher = more frequent changes)
				translationPhaseX: 0.0, // Accumulated phase for X translation (prevents jumps)
				translationPhaseY: 0.0, // Accumulated phase for Y translation (prevents jumps)
				rotationSpeed: 0.0, // Speed of rotation
				rotationOscillationSpeed: 0.1, // Speed of oscillation (controls how fast it alternates between positive/negative)
				rotationStartingAngle: 0.0, // Starting angle for rotation (in radians, added to rotation)
				rotationMode: 1.0, // 0=cosine oscillation, 1=noise, 2=FBM
				rotationNoiseScale: 0.01, // Scale of rotation noise (lower = smoother, higher = more frequent changes)
				rotationPhase: 0.0, // Accumulated phase for rotation (prevents jumps)
				rotationAmplitude: 50.0, // Fixed amplitude - speed controls phase accumulation rate, not amplitude
				timeMultiplier: 0.01, // Time multiplier for animation
				uniforms: {
					uResolution: "[width, height]",
					uSeed: "shaderSeed + 1234.0",
					uCenter: "center",
					uSymmetryMode: "symmetryMode",
					uAmount: "amount",
					uDebug: "debug",
					uCenter: "center",
					uTime: "shaderTime * timeMultiplier",
					uTranslationSpeed: "translationSpeed",
					uTranslationMode: "translationMode",
					uTranslationNoiseScale: "translationNoiseScale",
					uTranslationPhaseX: "translationPhaseX",
					uTranslationPhaseY: "translationPhaseY",
					uRotationSpeed: "rotationSpeed",
					uRotationOscillationSpeed: "rotationOscillationSpeed",
					uRotationStartingAngle: "rotationStartingAngle",
					uRotationMode: "rotationMode",
					uRotationNoiseScale: "rotationNoiseScale",
					uRotationPhase: "rotationPhase",
					uRotationAmplitude: "rotationAmplitude",
				},
			},
			pixelSort: {
				enabled: false,
				angle: 0.0, // 0 = vertical, Math.PI/2 = horizontal
				threshold: 0.25,
				sortAmount: 0.28,
				sampleCount: 2.0, // Number of samples (8-64, higher = better quality but slower)
				invert: 0.0, // 0.0 = sort bright pixels, 1.0 = sort dark pixels
				sortMode: 2.0, // 1.0 = sine wave, 2.0 = noise, 3.0 = FBM, 4.0 = vector field
				timeMultiplier: 1.3,
				uniforms: {
					uTime: "shaderTime * timeMultiplier",
					uSeed: "shaderSeed + 999.0",
					uAngle: "angle",
					uThreshold: "threshold",
					uSortAmount: "sortAmount",
					uSampleCount: "sampleCount",
					uInvert: "invert",
					uSortMode: "sortMode",
					uResolution: "[width, height]",
				},
			},
			pixelGrid: {
				enabled: false,
				gridCols: 420.0, // Number of columns
				gridRows: 20.0, // Number of rows
				cellRatio: 100.0, // 1.0 = natural cell shape; >1.0 compresses pixel vertically
				mode: 0.0, // 0.0 = pixel mode, 1.0 = diffuse mode
				diffuse: 1.0, // Color bleeding in diffuse mode (0.0 = sharp, 1.0 = full blur)
				gapSize: 0.0, // Gap border fraction per side (0.0 = no gap)
				gapBrightness: 1.0, // 0.0 = black gaps, 1.0 = cell color in gap area
				uniforms: {
					uResolution: "[width, height]",
					uGridSize: "[gridCols, gridRows]",
					uCellRatio: "cellRatio",
					uMode: "mode",
					uDiffuse: "diffuse",
					uGapSize: "gapSize",
					uGapBrightness: "gapBrightness",
				},
			},
			chromatic: {
				enabled: false,
				amount: 0.0015,
				timeMultiplier: 0.0,
				uniforms: {
					uTime: "shaderTime * timeMultiplier",
					uSeed: "shaderSeed + 777.0",
					uAmount: "amount",
				},
			},

			zoom: {
				enabled: false,
				zoomAmount: 0.0, // Static zoom level (1.0 = no zoom, 2.0 = 2x in, 0.5 = 2x out)
				zoomSpeed: 0.8, // Animation speed
				zoomOutAmount: 2.25, // Min zoom when animating
				zoomInAmount: 4.5, // Max zoom when animating
				animateZoom: 1.0, // 0.0 = static, 1.0 = animate between out/in
				easingMode: 4.0, // 0=sine, 1=linear, 2=ease-in, 3=ease-out, 4=ease-in-out, 5=bounce
				center: [0.5, 0.5], // Zoom center point (normalized 0-1)
				timeMultiplier: 0.0,
				uniforms: {
					uTime: "shaderTime * timeMultiplier",
					uZoomSpeed: "zoomSpeed",
					uZoomAmount: "zoomAmount",
					uZoomOutAmount: "zoomOutAmount",
					uZoomInAmount: "zoomInAmount",
					uAnimateZoom: "animateZoom",
					uEasingMode: "easingMode",
					uCenter: "center",
				},
			},

			// crtWarp: borderColor 0 / 1 / 2 → black / clamp / mirror. Patch may use borderMode: "black"|"clamp"|"mirror" instead.
			crtWarp: {
				enabled: false,
				warpAmount: 0.74, // Barrel; corners stay on [0,1] — tune by eye vs older shaders
				aspectCorrect: 1.0, // 1 = radial warp uses pixel aspect (non-square); 0 = UV-square legacy
				cornerRadius: 0.0,
				cornerSmooth: 0.0,
				borderColor: 1.0,
				vignette: 0.5,
				uniforms: {
					uResolution: "[width, height]",
					uWarpAmount: "warpAmount",
					uAspectCorrect: "aspectCorrect",
					uCornerRadius: "cornerRadius",
					uCornerSmooth: "cornerSmooth",
					uBorderColor: "borderColor",
					uVignette: "vignette",
				},
			},
			crtDisplay: {
				enabled: false,
				brightness: 0.99, // Brightness boost (0.0 = none, higher = brighter)
				cellSize: 3.0, // Size of CRT cells/pixels (2-10 typical range)
				gapOpacity: 0.6, // Gap opacity between phosphor dots (0.0 = no gaps, 1.0 = full dark gaps)
				rgbOpacity: 0.6, // RGB color separation opacity (0.0 = no separation, 1.0 = full RGB isolation)
				dotRadius: 0.8, // Size of phosphor dots (0.0-0.5, smaller = larger gaps)
				dotFalloff: 0.6, // Softness of phosphor dot edges (0.0 = sharp, 1.0 = very soft)
				filterMode: 0.0, // Display mode: 0.0 = true pixel display (sample at cell center), 1.0 = filter overlay (sample at actual position)
				uniforms: {
					uResolution: "[width, height]",
					uBrightness: "brightness",
					uCellSize: "cellSize",
					uGapOpacity: "gapOpacity",
					uRgbOpacity: "rgbOpacity",
					uDotRadius: "dotRadius",
					uDotFalloff: "dotFalloff",
					uFilterMode: "filterMode",
				},
			},
			blur: {
				enabled: false,
				blurMode: 1.0, // 0=gaussian, 1=radial, 2=directional
				blurAmount: 6100.0, // Blur radius/intensity in pixels
				blurQuality: 60.0, // Sampling quality (1-8, higher = better but slower)
				blurDirection: 0, // Angle in radians for directional mode
				blurCenter: [0.5, 0.5], // Center for radial mode (normalized 0-1)
				blurStart: 0.6, // Radial mode: starting radius (0-1, blur kicks in beyond this distance)
				blurCrt: 1.0, // Radial mode: 0.0 = circular, 1.0 = super-ellipse (CRT shape)
				blurCrtPower: 27.0, // Super-ellipse exponent (2.0 = ellipse, 4.0+ = more rectangular/CRT-like)
				blurMin: 60.0, // Radial mode: minimum blur amount at blurStart (0 = sharp center, >0 = always some blur)
				uniforms: {
					uResolution: "[width, height]",
					uBlurMode: "blurMode",
					uBlurAmount: "blurAmount",
					uBlurQuality: "blurQuality",
					uBlurDirection: "blurDirection",
					uBlurCenter: "blurCenter",
					uBlurStart: "blurStart",
					uBlurCrt: "blurCrt",
					uBlurCrtPower: "blurCrtPower",
					uBlurMin: "blurMin",
				},
			},
		};

		mergeEffectsConfig(this.effectsConfig, options.effects ?? options.effectsConfig ?? {});

		// Cache for last enabled effects (to detect changes)
		this.lastEnabledEffects = null;

		// FPS overlay (enable with shaderEffects.toggleFPS(true) when debugging)
		this.showFPS = false;
		this.fpsHistory = [];
		this.fpsHistorySize = 60; // Average over 60 frames
		this.lastFrameTime = performance.now();
		this.currentFPS = 60;
	}

	/**
	 * Load all GLSL programs (p5.js 2.x — call from async setup with await).
	 * @param {import("p5")} p5Instance
	 */
	async loadShaders(p5Instance) {
		this.p5Instance = p5Instance;
		this.shaderManager = new ShaderManager();
		this.shaderManager.init(p5Instance, "/library/shaders/");
		this.shaderManager.setDefaultVertex("chromatic-aberration/vertex.vert");

		await Promise.all([
			this.shaderManager.loadShader("copy", "copy/fragment.frag", "copy/vertex.vert"),
			this.shaderManager.loadShader("deform", "deform/fragment.frag", "deform/vertex.vert"),
			this.shaderManager.loadShader("chromatic", "chromatic-aberration/fragment.frag", "chromatic-aberration/vertex.vert"),
			this.shaderManager.loadShader("grain", "grain/fragment.frag", "grain/vertex.vert"),
			this.shaderManager.loadShader("collage", "collage-rotate/fragment.frag", "collage-rotate/vertex.vert"),
			this.shaderManager.loadShader("pixelSort", "pixel-sort/fragment.frag", "pixel-sort/vertex.vert"),
			this.shaderManager.loadShader("crtDisplay", "pixel-checker/fragment.frag", "pixel-checker/vertex.vert"),
			this.shaderManager.loadShader("symmetry", "symmetry/fragment.frag", "symmetry/vertex.vert"),
			this.shaderManager.loadShader("symmetry2", "symmetry/fragment.frag", "symmetry/vertex.vert"),
			this.shaderManager.loadShader("pixelGrid", "pixel-grid/fragment.frag", "pixel-grid/vertex.vert"),
			this.shaderManager.loadShader("blur", "blur/fragment.frag", "blur/vertex.vert"),
			this.shaderManager.loadShader("zoom", "zoom/fragment.frag", "zoom/vertex.vert"),
			this.shaderManager.loadShader("crtWarp", "crt-warp/fragment.frag", "crt-warp/vertex.vert"),
		]);

		return this;
	}

	/**
	 * Setup shader effects - call this in p5 setup()
	 * @param {number} width - Canvas width
	 * @param {number} height - Canvas height
	 * @param {p5.Graphics} mainCanvas - Main graphics buffer for artwork
	 * @param {p5.Graphics} shaderCanvas - WEBGL canvas for shader effects
	 */
	setup(width, height, mainCanvas, shaderCanvas) {
		this.mainCanvas = mainCanvas;
		this.shaderCanvas = shaderCanvas;

		// Initialize shader seed with fxhash if available
		if (typeof fxrand === "function") {
			this.shaderSeed = fxrand() * 10000;
		} else {
			this.shaderSeed = Math.random() * 10000;
		}

		// Initialize shader pipeline with enabled effects
		const enabledEffects = Object.keys(this.effectsConfig).filter((name) => this.effectsConfig[name].enabled);

		this.shaderPipeline = new ShaderPipeline(this.shaderManager, this.p5Instance).init(width, height, enabledEffects);

		return this;
	}

	/**
	 * Merge preset toggles/params from a sketch file (or runtime). Rebuilds pipeline if already set up.
	 * @param {Record<string, object>} patch - e.g. { crtWarp: { enabled: true, vignette: 0.6, borderMode: "mirror" } }
	 */
	applyEffectsConfig(patch) {
		mergeEffectsConfig(this.effectsConfig, patch);
		this.lastEnabledEffects = null;
		if (this.shaderPipeline && this.shaderManager && this.mainCanvas) {
			this.reinitializePipeline();
		}
		return this;
	}

	/**
	 * Add a new shader effect programmatically
	 * @param {string} effectName - Name of the effect
	 * @param {object} config - Effect configuration
	 */
	addEffect(effectName, config) {
		this.effectsConfig[effectName] = {
			enabled: config.enabled || false,
			...config,
			uniforms: config.uniforms || {},
		};
		return this;
	}

	/**
	 * Enable or disable an effect
	 * @param {string} effectName - Name of the effect
	 * @param {boolean} enabled - Enable or disable
	 */
	setEffectEnabled(effectName, enabled) {
		if (this.effectsConfig[effectName]) {
			this.effectsConfig[effectName].enabled = enabled;
			this.reinitializePipeline();
		}
		return this;
	}

	/**
	 * Update an effect parameter
	 * @param {string} effectName - Name of the effect
	 * @param {string} paramName - Parameter name
	 * @param {*} value - New value
	 */
	updateEffectParam(effectName, paramName, value) {
		if (this.effectsConfig[effectName] && this.effectsConfig[effectName][paramName] !== undefined) {
			this.effectsConfig[effectName][paramName] = value;
		}
		return this;
	}

	/**
	 * Reinitialize shader pipeline when effects change
	 */
	reinitializePipeline() {
		if (this.shaderPipeline && this.shaderManager) {
			const enabledEffects = Object.keys(this.effectsConfig).filter((name) => this.effectsConfig[name].enabled);
			this.shaderPipeline.init(this.mainCanvas.width, this.mainCanvas.height, enabledEffects);
		}
		return this;
	}

	/**
	 * Set shader frame rate
	 * @param {number} fps - Frame rate (1-120)
	 */
	setFrameRate(fps) {
		this.shaderFrameRate = Math.max(1, Math.min(120, fps));
		console.log(`Shader frame rate set to ${this.shaderFrameRate}fps`);
		return this;
	}

	/**
	 * Update shader time - call this in your animation loop
	 * @param {number} delta - Time delta (default: 0.01)
	 */
	updateTime(delta = 0.01) {
		this.shaderTime += delta;
		this.updateTranslationPhases(delta);
		this.updateRotationPhases(delta);
		return this;
	}

	/**
	 * Update translation phases to prevent position jumps when speed changes
	 * @param {number} delta - Time delta
	 */
	updateTranslationPhases(delta) {
		// Update phase for symmetry effects
		const effects = ["symmetry", "symmetry2"];
		for (const effectName of effects) {
			const effect = this.effectsConfig[effectName];
			if (!effect || !effect.enabled) continue;

			const currentSpeed = effect.translationSpeed || 0;
			const lastSpeed = this.lastTranslationSpeed[effectName];
			const transMode = Math.floor(effect.translationMode || 0);

			// Initialize phase if not set
			if (effect.translationPhaseX === undefined) effect.translationPhaseX = 0;
			if (effect.translationPhaseY === undefined) effect.translationPhaseY = 0;

			// If speed changed, maintain current position by adjusting phase
			if (lastSpeed !== null && lastSpeed !== currentSpeed && currentSpeed !== 0) {
				const currentTime = this.shaderTime * (effect.timeMultiplier || 0.1);

				if (transMode === 0) {
					// Sine mode: maintain phase continuity
					const oldPhaseX = currentTime * lastSpeed;
					const oldPhaseY = currentTime * lastSpeed * 0.7;
					// Set phase to maintain the same position
					effect.translationPhaseX = oldPhaseX;
					effect.translationPhaseY = oldPhaseY;
				}
				// For noise/FBM/vector field modes, phase is already accumulated, so we keep it
			}

			// Update phase based on current speed
			const timeMultiplier = effect.timeMultiplier || 0.1;
			const effectiveDelta = delta * timeMultiplier;

			if (transMode === 0) {
				// Sine mode: accumulate phase
				effect.translationPhaseX += effectiveDelta * currentSpeed;
				effect.translationPhaseY += effectiveDelta * currentSpeed * 0.7;
			} else {
				// Noise/FBM/vector field: accumulate based on speed
				effect.translationPhaseX += effectiveDelta * currentSpeed;
				effect.translationPhaseY += effectiveDelta * currentSpeed;
			}

			this.lastTranslationSpeed[effectName] = currentSpeed;
		}
	}

	/**
	 * Update rotation phases to prevent angle jumps when speed changes
	 * @param {number} delta - Time delta
	 */
	updateRotationPhases(delta) {
		// Update phase for symmetry effects
		const effects = ["symmetry", "symmetry2"];
		for (const effectName of effects) {
			const effect = this.effectsConfig[effectName];
			if (!effect || !effect.enabled) continue;

			const currentSpeed = effect.rotationSpeed || 0;
			const currentOscillationSpeed = effect.rotationOscillationSpeed || 0;
			const lastSpeed = this.lastRotationSpeed[effectName];
			const lastOscillationSpeed = this.lastRotationOscillationSpeed[effectName];
			const rotMode = Math.floor(effect.rotationMode || 0);

			// Initialize phase if not set
			if (effect.rotationPhase === undefined) effect.rotationPhase = 0;

			// If speed changed, maintain current angle by adjusting phase
			if (lastSpeed !== null && lastSpeed !== currentSpeed && currentSpeed !== 0) {
				const currentTime = this.shaderTime * (effect.timeMultiplier || 0.1);
				const rotationNoiseScale = effect.rotationNoiseScale || 0.3;

				if (rotMode === 0) {
					// Cosine oscillation mode: maintain angle continuity
					// Calculate what the current angle was with old speed
					const oldOscillation = -Math.cos(currentTime * (lastOscillationSpeed || 0));
					const oldAngle = oldOscillation * lastSpeed;
					// Set phase to maintain the same angle (phase represents the angle directly for cosine mode)
					effect.rotationPhase = oldAngle;
				} else if (rotMode === 1 || rotMode === 2) {
					// Noise/FBM modes: maintain amplitude continuity
					// When speed changes, keep amplitude constant to prevent angle jump
					// Speed only affects phase accumulation rate, not amplitude
					// Initialize amplitude if not set (use current speed as starting point)
					if (effect.rotationAmplitude === undefined) {
						effect.rotationAmplitude = lastSpeed || currentSpeed;
					}
					// Keep amplitude constant - don't change it when speed changes
				}
			}

			// Update phase based on current speed
			const timeMultiplier = effect.timeMultiplier || 0.1;
			const effectiveDelta = delta * timeMultiplier;
			const currentTime = this.shaderTime * timeMultiplier;
			const rotationNoiseScale = effect.rotationNoiseScale || 0.3;

			if (rotMode === 0) {
				// Cosine oscillation mode: phase represents the angle directly
				// Calculate the derivative (rate of change) and integrate it
				const oscillation = -Math.cos(currentTime * currentOscillationSpeed);
				const angleDerivative = oscillation * currentSpeed;
				effect.rotationPhase += effectiveDelta * angleDerivative;
			} else {
				// Noise/FBM: accumulate phase based on speed
				// Phase accumulation rate controls how fast we move through noise space
				// rotationNoiseScale in the shader controls sampling frequency (lower = smoother)
				effect.rotationPhase += effectiveDelta * currentSpeed;

				// Initialize amplitude if not set, but don't change it when speed changes
				// This maintains angle continuity - speed only affects rotation speed, not amplitude
				if (effect.rotationAmplitude === undefined) {
					effect.rotationAmplitude = currentSpeed;
				}
				// Don't update amplitude - keep it constant to prevent angle jumps
			}

			this.lastRotationSpeed[effectName] = currentSpeed;
			this.lastRotationOscillationSpeed[effectName] = currentOscillationSpeed;
		}
	}

	/**
	 * Evaluate uniform value from string expression
	 * @param {string|*} value - Value or expression
	 * @param {object} effect - Effect configuration
	 * @returns {*} Evaluated value
	 */
	evaluateUniformValue(value, effect) {
		if (typeof value === "string") {
			// Handle special cases
			if (value === "[width, height]") {
				return [this.mainCanvas.width, this.mainCanvas.height];
			}

			if (value === "[gridCols, gridRows]") {
				return [effect.gridCols, effect.gridRows];
			}

			// Handle expressions like 'shaderSeed + 777.0'
			if (value.includes("+") || value.includes("-") || value.includes("*") || value.includes("/")) {
				try {
					// Create a safe evaluation context with available variables
					const evalContext = {
						shaderTime: this.shaderTime,
						shaderSeed: this.shaderSeed,
						width: this.mainCanvas.width,
						height: this.mainCanvas.height,
						...effect, // Include effect properties
					};

					// Replace variable names with their values
					let evalString = value;
					for (const [varName, varValue] of Object.entries(evalContext)) {
						if (typeof varValue === "number") {
							evalString = evalString.replace(new RegExp(`\\b${varName}\\b`, "g"), varValue);
						}
					}

					return eval(evalString);
				} catch (error) {
					console.warn(`Failed to evaluate uniform value "${value}":`, error);
					return 0;
				}
			}

			// Handle property references from the effect config
			if (value in effect) {
				return effect[value];
			}

			// Handle global variable references
			if (value === "shaderTime") return this.shaderTime;
			if (value === "shaderSeed") return this.shaderSeed;
			if (value === "width") return this.mainCanvas.width;
			if (value === "height") return this.mainCanvas.height;

			// Try to evaluate as a simple variable reference
			try {
				return eval(value);
			} catch (error) {
				console.warn(`Failed to evaluate uniform value "${value}":`, error);
				return 0;
			}
		}

		return value;
	}

	/**
	 * Apply shader effects to the main canvas
	 * Call this in your render loop
	 */
	apply() {
		if (!this.shaderManager || !this.mainCanvas) {
			console.warn("ShaderEffects not properly initialized");
			return this;
		}

		// Clear the shader canvas (use p5Instance for global clear)
		if (this.p5Instance && this.p5Instance.clear) {
			this.p5Instance.clear();
		}

		// Build effect passes dynamically (only rebuild if effects changed)
		const currentEnabledEffects = Object.keys(this.effectsConfig).filter((name) => this.effectsConfig[name].enabled);

		if (JSON.stringify(this.lastEnabledEffects) !== JSON.stringify(currentEnabledEffects)) {
			this.shaderPipeline.clearPasses();

			// Iterate through effectsConfig to build passes
			for (const effectName in this.effectsConfig) {
				const effect = this.effectsConfig[effectName];
				if (effect.enabled) {
					this.shaderPipeline.addPass(effectName, () => {
						const uniforms = {};
						for (const uniformName in effect.uniforms) {
							const value = effect.uniforms[uniformName];
							uniforms[uniformName] = this.evaluateUniformValue(value, effect);
						}
						return uniforms;
					});
				}
			}

			this.lastEnabledEffects = [...currentEnabledEffects];
		}

		this.shaderPipeline.run(this.mainCanvas, this.p5Instance);

		return this;
	}

	/**
	 * Apply copy shader (just display the main canvas without effects)
	 */
	applyCopy() {
		if (!this.shaderManager || !this.mainCanvas) {
			return this;
		}

		if (this.p5Instance && this.p5Instance.clear) {
			this.p5Instance.clear();
		}

		this.shaderManager.apply("copy", {uTexture: this.mainCanvas}, this.p5Instance).drawFullscreenQuad(this.p5Instance);

		return this;
	}

	/**
	 * Load additional shader dynamically
	 * @param {string} name - Shader name
	 * @param {string} fragPath - Fragment shader path
	 * @param {string} vertPath - Vertex shader path (optional)
	 */
	async loadShader(name, fragPath, vertPath = null) {
		if (this.shaderManager) {
			await this.shaderManager.loadShader(name, fragPath, vertPath);
			console.log(`Loaded shader: ${name}`);
		}
		return this;
	}

	/**
	 * Get list of loaded shader names
	 * @returns {string[]} Array of shader names
	 */
	getLoadedShaders() {
		if (this.shaderManager && this.shaderManager.shaders) {
			return Object.keys(this.shaderManager.shaders);
		}
		return [];
	}

	/**
	 * Mark particle animation as complete
	 */
	setParticleAnimationComplete(complete = true) {
		this.particleAnimationComplete = complete;
		return this;
	}

	/**
	 * Check if shaders should continue after completion
	 * @returns {boolean}
	 */
	shouldContinueAfterCompletion() {
		return this.continueShadersAfterCompletion;
	}

	/**
	 * Set whether shaders should continue after sketch completion
	 * @param {boolean} value - Continue or not
	 */
	setContinueAfterCompletion(value) {
		this.continueShadersAfterCompletion = value;
		return this;
	}

	/**
	 * Set whether to apply shaders during sketch rendering
	 * @param {boolean} value - Apply or not
	 */
	setApplyDuringSketch(value) {
		this.applyShadersDuringSketch = value;
		return this;
	}

	/**
	 * Check if shaders should be applied during sketch
	 * @returns {boolean}
	 */
	shouldApplyDuringSketch() {
		return this.applyShadersDuringSketch;
	}

	/**
	 * Get current shader frame rate
	 * @returns {number}
	 */
	getFrameRate() {
		return this.shaderFrameRate;
	}

	/**
	 * Update FPS counter
	 */
	updateFPS() {
		// Skip FPS tracking if disabled
		if (!this.showFPS) return;

		const now = performance.now();
		const delta = now - this.lastFrameTime;
		this.lastFrameTime = now;

		// Calculate instantaneous FPS
		const instantFPS = 1000 / delta;

		// Add to history
		this.fpsHistory.push(instantFPS);
		if (this.fpsHistory.length > this.fpsHistorySize) {
			this.fpsHistory.shift();
		}

		// Calculate average FPS
		const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
		this.currentFPS = Math.round(sum / this.fpsHistory.length);
	}

	/**
	 * Draw FPS counter on screen (using DOM overlay for better visibility)
	 */
	drawFPS() {
		try {
			// Create or update FPS overlay element
			let fpsElement = document.getElementById("shader-fps-overlay");
			if (!fpsElement) {
				fpsElement = document.createElement("div");
				fpsElement.id = "shader-fps-overlay";
				document.body.appendChild(fpsElement);
			}

			// Hide if FPS is disabled
			if (!this.showFPS) {
				fpsElement.style.display = "none";
				return;
			}

			fpsElement.style.display = "block";

			// Get canvas position
			const canvas = document.querySelector("canvas");
			if (!canvas) return;

			const canvasRect = canvas.getBoundingClientRect();

			// Update position to match canvas
			fpsElement.style.position = "fixed";
			fpsElement.style.left = canvasRect.left + 10 + "px";
			fpsElement.style.top = canvasRect.top + 10 + "px";
			fpsElement.style.zIndex = "10000";

			// Color based on performance
			let textColor;
			if (this.currentFPS >= 55) {
				textColor = "#64ff64"; // Green
			} else if (this.currentFPS >= 30) {
				textColor = "#ffc864"; // Orange
			} else {
				textColor = "#ff6464"; // Red
			}

			// Update content
			fpsElement.innerHTML = `
				<div style="
					background: rgba(0, 0, 0, 0.7);
					padding: 8px 12px;
					border-radius: 4px;
					font-family: 'Courier New', monospace;
					font-size: 16px;
					color: ${textColor};
					font-weight: bold;
				">
					FPS: ${this.currentFPS}
				</div>
			`;
		} catch (error) {
			// Silently fail if DOM operations crash (common on Safari mobile)
			console.warn("FPS counter failed:", error);
		}
	}

	/**
	 * Toggle FPS display
	 * @param {boolean} show - Show or hide FPS
	 */
	toggleFPS(show = null) {
		if (show === null) {
			this.showFPS = !this.showFPS;
		} else {
			this.showFPS = show;
		}
		return this;
	}

	/**
	 * Render frame - handles shader logic for each animation frame
	 * @param {boolean} isSketchComplete - Whether the sketch animation is complete
	 * @param {Function} continueCallback - Callback to continue animation loop
	 * @returns {boolean} Whether to continue the animation loop
	 */
	renderFrame(isSketchComplete, continueCallback) {
		// Update FPS counter
		this.updateFPS();

		if (isSketchComplete) {
			// Always apply shaders at least once when sketch is complete
			if (!this.shouldApplyDuringSketch()) {
				this.apply();
			}

			if (this.shouldContinueAfterCompletion()) {
				// Keep shaders running even after particles are complete
				this.updateTime(0.01);
				this.apply();

				// Draw FPS counter
				this.drawFPS();

				// Continue using requestAnimationFrame
				return true;
			} else {
				// Stop everything when sketch is complete
				console.log("Sketch complete - shaders stopped");
				return false;
			}
		}

		// Update shader time during sketching
		this.updateTime(0.01);

		// Only apply shaders during sketching if enabled
		if (this.shouldApplyDuringSketch()) {
			this.apply();
		} else {
			// If not applying shaders during sketching, use copy shader to display base sketch
			this.applyCopy();
		}

		// Draw FPS counter
		this.drawFPS();

		return true; // Continue animation
	}
}
