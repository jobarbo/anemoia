/**
 * Shader Manager — load, apply, and reuse GLSL in p5.js (post-process fullscreen quad).
 */
export class ShaderManager {
	constructor() {
		this.shaders = {};
		this.defaultVertexPath = null;
		this.p5Instance = null;
		this.basePath = "";
		/** @type {WeakMap<object, Map<string, import("p5").Shader>>} p5.Graphics / sketch → per-pass shader clones */
		this._shaderClonesByTarget = new WeakMap();
	}

	/**
	 * @param {import("p5")} p5Instance
	 * @param {string} basePath - Absolute path to shader dir (e.g. "/library/shaders/")
	 */
	init(p5Instance, basePath = "/library/shaders/") {
		this.p5Instance = p5Instance;
		this.basePath = basePath.endsWith("/") ? basePath : `${basePath}/`;
		this._shaderClonesByTarget = new WeakMap();
		return this;
	}

	/**
	 * Shaders from loadShader() are bound to the main sketch renderer. Ping-pong passes use
	 * separate WEBGL createGraphics contexts — use p5.Shader.copyToContext() per target (cached).
	 * @param {string} name
	 * @param {import("p5")|import("p5").Graphics|null} target
	 */
	_getShaderForTarget(name, target) {
		const base = this.shaders[name];
		if (!base) return null;

		const dest = target ?? this.p5Instance;
		// Same WebGL renderer as compile site — use original program
		if (dest._renderer === base._renderer) {
			return base;
		}

		let byName = this._shaderClonesByTarget.get(dest);
		if (!byName) {
			byName = new Map();
			this._shaderClonesByTarget.set(dest, byName);
		}
		if (!byName.has(name)) {
			byName.set(name, base.copyToContext(dest));
		}
		return byName.get(name);
	}

	setDefaultVertex(path) {
		this.defaultVertexPath = this.basePath + path;
		return this;
	}

	/**
	 * p5.js 2.x: loadShader returns a Promise — use await (e.g. from async setup).
	 */
	async loadShader(name, fragPath, vertPath = null) {
		const vertexPath = vertPath ? this.basePath + vertPath : this.defaultVertexPath;
		const fragmentPath = this.basePath + fragPath;

		if (!vertexPath) {
			console.error("No vertex shader specified and no default set");
			return this;
		}

		const shader = await this.p5Instance.loadShader(vertexPath, fragmentPath);
		this.shaders[name] = shader;
		return this;
	}

	apply(name, uniforms = {}, target = null) {
		const shader = this._getShaderForTarget(name, target);
		if (!shader) {
			console.error(`Shader "${name}" not found`);
			return this;
		}

		const ctx = target || this.p5Instance;
		ctx.shader(shader);

		for (const [key, value] of Object.entries(uniforms)) {
			shader.setUniform(key, value);
		}

		return this;
	}

	drawFullscreenQuad(target = null) {
		const ctx = target || this.p5Instance;
		ctx.push();
		ctx.noStroke();
		ctx.beginShape();
		ctx.vertex(-1, 1, 0, 0, 0);
		ctx.vertex(1, 1, 0, 1, 0);
		ctx.vertex(1, -1, 0, 1, 1);
		ctx.vertex(-1, -1, 0, 0, 1);
		ctx.endShape(ctx.CLOSE);
		ctx.pop();
		return this;
	}

	createBuffer(width, height) {
		if (!this.p5Instance) {
			console.error("ShaderManager not initialized");
			return null;
		}
		return this.p5Instance.createGraphics(width, height, this.p5Instance.WEBGL);
	}
}
