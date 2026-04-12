precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;   // screen resolution in pixels
uniform float uSeed;        // base seed
uniform float uTileSize1;   // small tile size (>= 1)
uniform float uTileSize2;   // medium tile size (>= 1)
uniform float uTileSize3;   // large tile size (>= 1)
uniform float uSizeNoise;   // size noise scale (frequency)
uniform float uRotNoise;    // rotation noise scale (frequency)
uniform float uAmount;      // blend strength [0..1]

float random(vec2 st, float seed) {
    return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

float valueNoise(vec2 st, float seed) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i, seed);
    float b = random(i + vec2(1.0, 0.0), seed);
    float c = random(i + vec2(0.0, 1.0), seed);
    float d = random(i + vec2(1.0, 1.0), seed);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 st, float seed) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        v += amp * valueNoise(st, seed + float(i) * 19.73);
        st *= 2.0;
        amp *= 0.5;
    }
    return v;
}

vec2 rotateLocal(vec2 l, float idx) {
    // l in [0,1], idx in {0.0,1.0,2.0,3.0} corresponding to 0,90,180,270 degrees
    if (idx < 0.5) {
        return l; // 0°
    } else if (idx < 1.5) {
        return vec2(1.0 - l.y, l.x); // 90°
    } else if (idx < 2.5) {
        return vec2(1.0 - l.x, 1.0 - l.y); // 180°
    } else {
        return vec2(l.y, 1.0 - l.x); // 270°
    }
}

vec4 sampleRotated(vec2 fragCoord, float tileSize, float rotNoiseScale, float seed) {
    tileSize = max(1.0, tileSize);
    vec2 tileIndex = floor(fragCoord / tileSize);
    vec2 tileOrigin = tileIndex * tileSize;
    vec2 localPx = fragCoord - tileOrigin;      // [0..tileSize)
    vec2 local = localPx / tileSize;            // [0..1]

    // Rotation index chosen from a noise plane so nearby tiles follow coherent regions
    vec2 tileCenter = (tileOrigin + vec2(0.5 * tileSize)) / uResolution; // [0..1]
    float n = fbm(tileCenter * rotNoiseScale, seed + 101.0);
    float rotIdx = floor(n * 4.0); // 0..3

    vec2 localRot = rotateLocal(local, rotIdx);
    vec2 samplePx = tileOrigin + localRot * tileSize;
    vec2 sampleUV = samplePx / uResolution;
    return texture2D(uTexture, sampleUV);
}

void main() {
    vec2 fragCoord = vTexCoord * uResolution;

    // Choose tile size via a noise plane in [0..1]
    float sNoise = fbm(vTexCoord * uSizeNoise, uSeed + 7.0);
    float size1 = max(1.0, uTileSize1);
    float size2 = max(1.0, uTileSize2);
    float size3 = max(1.0, uTileSize3);

    vec4 col1 = sampleRotated(fragCoord, size1, uRotNoise, uSeed);
    vec4 col2 = sampleRotated(fragCoord, size2, uRotNoise, uSeed + 13.0);
    vec4 col3 = sampleRotated(fragCoord, size3, uRotNoise, uSeed + 29.0);

    vec4 rotated;
    if (sNoise < 0.3333) {
        rotated = col1;
    } else if (sNoise < 0.6666) {
        rotated = col2;
    } else {
        rotated = col3;
    }

    vec4 src = texture2D(uTexture, vTexCoord);
    float amt = clamp(uAmount, 0.0, 1.0);
    gl_FragColor = mix(src, rotated, amt);
}


