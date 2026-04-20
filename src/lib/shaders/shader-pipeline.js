function isSafariMobile() {
	const ua = window.navigator.userAgent;
	const iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
	const webkit = !!ua.match(/WebKit/i);
	const iOSSafari = iOS && webkit && !ua.match(/CriOS/i);
	return iOSSafari;
}

/**
 * Chain multiple fullscreen shader passes (ping-pong when 2+ passes).
 */
export class ShaderPipeline {
	constructor(shaderManager, p5Instance) {
		this.shaderManager = shaderManager;
		this.p5 = p5Instance;
		this.passes = [];
		this.buffers = [];
		this.initialized = false;
		this.width = 0;
		this.height = 0;
	}

	init(width, height, enabledEffects = []) {
		this.width = width;
		this.height = height;

		if (enabledEffects.length > 1) {
			const bufferDivisor = isSafariMobile() ? 1 : 1;
			const targetW = Math.max(1, Math.round(width / bufferDivisor));
			const targetH = Math.max(1, Math.round(height / bufferDivisor));
			this._ensurePingPongBuffers(2, targetW, targetH);
		}

		for (const buf of this.buffers) {
			if (buf) buf.noStroke();
		}
		this.initialized = true;
		return this;
	}

	_ensurePingPongBuffers(requiredCount, width, height) {
		while (this.buffers.length < requiredCount) {
			const next = this.shaderManager.createBuffer(width, height);
			this.buffers.push(next);
		}
		for (let i = 0; i < this.buffers.length; i++) {
			const buf = this.buffers[i];
			if (!buf) continue;
			try {
				if (buf.width !== width || buf.height !== height) {
					buf.resizeCanvas(width, height);
				}
				buf.noStroke();
			} catch {
				// If a buffer is lost/corrupted, recreate it in place.
				try {
					if (typeof buf.remove === "function") buf.remove();
				} catch {
					// ignore
				}
				this.buffers[i] = this.shaderManager.createBuffer(width, height);
				this.buffers[i]?.noStroke?.();
			}
		}
	}

	_disposeBuffers() {
		for (const buf of this.buffers) {
			if (!buf) continue;
			try {
				if (typeof buf.remove === "function") {
					buf.remove();
				}
			} catch {
				// Ignore disposal errors; we'll recreate fresh buffers below.
			}
		}
		this.buffers = [];
	}

	addPass(passName, uniformsProvider = () => ({})) {
		this.passes.push({name: passName, uniformsProvider});
		return this;
	}

	clearPasses() {
		this.passes = [];
		return this;
	}

	run(inputTexture, outputTarget) {
		if (!this.initialized) {
			console.error("ShaderPipeline not initialized. Call init(width, height).");
			return;
		}
		const out = outputTarget ?? this.p5;

		if (this.passes.length === 0) {
			this.shaderManager
				.apply("copy", {uTexture: inputTexture}, out)
				.drawFullscreenQuad(out);
			return;
		}

		if (this.passes.length === 1) {
			const {name, uniformsProvider} = this.passes[0];
			const uniforms = Object.assign({}, uniformsProvider(), {uTexture: inputTexture});
			this.shaderManager.apply(name, uniforms, out).drawFullscreenQuad(out);
			return;
		}

		let readTex = inputTexture;
		let ping = 0;

		for (let i = 0; i < this.passes.length; i++) {
			const {name, uniformsProvider} = this.passes[i];

			if (i === this.passes.length - 1) {
				const uniforms = Object.assign({}, uniformsProvider(), {uTexture: readTex});
				this.shaderManager.apply(name, uniforms, out).drawFullscreenQuad(out);
			} else {
				const writeBuf = this.buffers[ping];
				writeBuf.clear();
				const uniforms = Object.assign({}, uniformsProvider(), {uTexture: readTex});
				this.shaderManager.apply(name, uniforms, writeBuf).drawFullscreenQuad(writeBuf);
				readTex = writeBuf;
				ping = 1 - ping;
			}
		}
	}

	destroy() {
		this.clearPasses();
		this._disposeBuffers();
		this.initialized = false;
	}
}
