precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
uniform float uIntensity;
uniform float uLineDensity;
uniform float uSpeed;
uniform float uThreshold;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

void main() {
	vec2 uv = vTexCoord;

	float lineIndex = floor(uv.y * uLineDensity);
	float timeStep = floor(uTime * uSpeed);
	float gate = step(uThreshold, hash12(vec2(lineIndex, timeStep)));

	float signedOffset = hash12(vec2(lineIndex + 17.0, timeStep + 7.0)) * 2.0 - 1.0;
	float pxOffset = signedOffset * uIntensity * gate;
	float uvOffset = pxOffset / max(uResolution.x, 1.0);

	uv.x = fract(uv.x + uvOffset);
	vec4 color = texture2D(uTexture, uv);
	gl_FragColor = color;
}
