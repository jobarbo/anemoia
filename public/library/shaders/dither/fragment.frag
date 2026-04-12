precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;

// uDitherMode: 0 = Bayer 4x4, 1 = Bayer 8x8, 2 = hash noise, 3 = line screen, 4 = clustered (Bayer 4 @ 2x scale)
uniform float uDitherMode;
uniform float uLevels;
uniform float uMix;
uniform float uStrength;
uniform float uScale;
uniform float uColorMode;
uniform float uSeed;

float hash21(vec2 p) {
	return fract(sin(dot(p + uSeed * 0.001, vec2(127.1, 311.7))) * 43758.5453);
}

// WebGL1 GLSL ES 1.00: no dynamic mat4 indexing — use vec4 rows + const component picks.
float pick4(vec4 row, int xi) {
	if (xi == 0) return row.x;
	if (xi == 1) return row.y;
	if (xi == 2) return row.z;
	return row.w;
}

float bayer4Row(int yi, vec4 r0, vec4 r1, vec4 r2, vec4 r3, int xi) {
	if (yi == 0) return pick4(r0, xi);
	if (yi == 1) return pick4(r1, xi);
	if (yi == 2) return pick4(r2, xi);
	return pick4(r3, xi);
}

float bayer4(int xi, int yi) {
	vec4 b0 = vec4(0., 8., 2., 10.) / 15.0;
	vec4 b1 = vec4(12., 4., 14., 6.) / 15.0;
	vec4 b2 = vec4(3., 11., 1., 9.) / 15.0;
	vec4 b3 = vec4(15., 7., 13., 5.) / 15.0;
	return bayer4Row(yi, b0, b1, b2, b3, xi);
}

float bayer8(int xi, int yi) {
	int lx = int(mod(float(xi), 4.0));
	int ly = int(mod(float(yi), 4.0));

	if (xi < 4) {
		if (yi < 4) {
			vec4 r0 = vec4(0., 32., 8., 40.) / 63.0;
			vec4 r1 = vec4(48., 16., 56., 24.) / 63.0;
			vec4 r2 = vec4(12., 44., 4., 36.) / 63.0;
			vec4 r3 = vec4(60., 28., 52., 20.) / 63.0;
			return bayer4Row(ly, r0, r1, r2, r3, lx);
		}
		vec4 r0 = vec4(3., 35., 11., 43.) / 63.0;
		vec4 r1 = vec4(51., 19., 59., 27.) / 63.0;
		vec4 r2 = vec4(15., 47., 7., 39.) / 63.0;
		vec4 r3 = vec4(63., 31., 55., 23.) / 63.0;
		return bayer4Row(ly, r0, r1, r2, r3, lx);
	}
	if (yi < 4) {
		vec4 r0 = vec4(2., 34., 10., 42.) / 63.0;
		vec4 r1 = vec4(50., 18., 58., 26.) / 63.0;
		vec4 r2 = vec4(14., 46., 6., 38.) / 63.0;
		vec4 r3 = vec4(62., 30., 54., 22.) / 63.0;
		return bayer4Row(ly, r0, r1, r2, r3, lx);
	}
	vec4 r0 = vec4(1., 33., 9., 41.) / 63.0;
	vec4 r1 = vec4(49., 17., 57., 25.) / 63.0;
	vec4 r2 = vec4(13., 45., 5., 37.) / 63.0;
	vec4 r3 = vec4(61., 29., 53., 21.) / 63.0;
	return bayer4Row(ly, r0, r1, r2, r3, lx);
}

float ditherPattern(vec2 g, int mode) {
	int xi;
	int yi;

	if (mode == 0) {
		xi = int(mod(floor(g.x), 4.0));
		yi = int(mod(floor(g.y), 4.0));
		return bayer4(xi, yi);
	}
	if (mode == 1) {
		xi = int(mod(floor(g.x), 8.0));
		yi = int(mod(floor(g.y), 8.0));
		return bayer8(xi, yi);
	}
	if (mode == 2) {
		return hash21(g + vec2(uSeed * 0.01, uSeed * 0.02));
	}
	if (mode == 3) {
		float a = (g.x + g.y * 0.73) * 0.5;
		return fract(a * 0.07 + uSeed * 0.001);
	}
	vec2 g4 = floor(g * 0.5);
	xi = int(mod(g4.x, 4.0));
	yi = int(mod(g4.y, 4.0));
	return bayer4(xi, yi);
}

void main() {
	vec4 tex = texture2D(uTexture, vTexCoord);
	vec3 col = tex.rgb;

	vec2 px = vTexCoord * uResolution;
	float sc = max(uScale, 1.0);
	vec2 g = floor(px / sc);

	int mode = int(floor(uDitherMode + 0.5));
	if (mode < 0) mode = 0;
	if (mode > 4) mode = 4;

	float pattern = ditherPattern(g, mode);
	float thr = pattern - 0.5;

	float Lv = max(uLevels, 2.0);
	float denom = max(Lv - 1.0, 1.0);
	float str = max(uStrength, 0.0001);
	float bias = thr * str / Lv;

	vec3 outc;

	if (uColorMode < 0.5) {
		float y = dot(col, vec3(0.299, 0.587, 0.114));
		float yq = y + bias;
		yq = floor(yq * denom + 0.5) / denom;
		float scale = yq / max(y, 0.001);
		outc = col * scale;
	} else {
		vec3 adj = col;
		adj.r += bias * (1.0 + fract(uSeed * 0.001));
		adj.g += bias * (1.0 + fract(uSeed * 0.002));
		adj.b += bias * (1.0 + fract(uSeed * 0.003));
		outc = floor(adj * denom + 0.5) / denom;
	}

	outc = clamp(outc, 0.0, 1.0);

	float m = clamp(uMix, 0.0, 1.0);
	gl_FragColor = vec4(mix(col, outc, m), tex.a);
}
