%%MCCRender:compute

#version 310 es
layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

#define M_INVPI 0.31830988618
#define M_2PI 6.28318530718
#define EPS 1e-5

struct Photon {
    vec3 position;
    vec3 direction;
    vec3 radiance;
    vec3 color;
    uint bounces;
    uint samples;
};

layout (std430, binding = 0) buffer bPhotons {
    Photon sPhotons[];
};

layout (rgba32f) writeonly highp uniform image2D oColor;

uniform mediump sampler3D uVolume;
uniform mediump sampler2D uTransferFunction;
uniform mediump sampler2D uEnvironment;

uniform mat4 uMvpInverseMatrix;
uniform vec2 uInverseResolution;
uniform float uRandSeed;
uniform float uBlur;

uniform float uAbsorptionCoefficient;
uniform float uScatteringCoefficient;
uniform float uScatteringBias;
uniform float uMajorant;
uniform uint uMaxBounces;
uniform uint uSteps;

@rand
@unprojectRand
@intersectCube

void resetPhoton(inout vec2 randState, out Photon photon) {
    vec3 from, to;
    vec2 screen = vec2(gl_GlobalInvocationID.xy) * uInverseResolution;
    unprojectRand(randState, screen, uMvpInverseMatrix, uInverseResolution, uBlur, from, to);
    photon.direction = normalize(to - from);
    photon.bounces = 0u;
    vec2 tbounds = max(intersectCube(from, photon.direction), 0.0);
    photon.position = from + tbounds.x * photon.direction;
    photon.radiance = vec3(1);
}

vec4 sampleEnvironmentMap(vec3 d) {
    vec2 texCoord = vec2(atan(d.x, -d.z), asin(-d.y) * 2.0) * M_INVPI * 0.5 + 0.5;
    return texture(uEnvironment, texCoord);
}

vec4 sampleVolumeColor(vec3 position) {
    vec2 volumeSample = texture(uVolume, position).rg;
    vec4 transferSample = texture(uTransferFunction, volumeSample);
    return transferSample;
}

vec3 randomDirection(vec2 U) {
    float phi = U.x * M_2PI;
    float z = U.y * 2.0 - 1.0;
    float k = sqrt(1.0 - z * z);
    return vec3(k * cos(phi), k * sin(phi), z);
}

float sampleHenyeyGreensteinAngleCosine(float g, float U) {
    float g2 = g * g;
    float c = (1.0 - g2) / (1.0 - g + 2.0 * g * U);
    return (1.0 + g2 - c * c) / (2.0 * g);
}

vec3 sampleHenyeyGreenstein(float g, vec2 U, vec3 direction) {
    // generate random direction and adjust it so that the angle is HG-sampled
    vec3 u = randomDirection(U);
    if (abs(g) < EPS) {
        return u;
    }
    float hgcos = sampleHenyeyGreensteinAngleCosine(g, fract(sin(U.x * 12345.6789) + 0.816723));
    float lambda = hgcos - dot(direction, u);
    return normalize(u + lambda * direction);
}

void main() {
    Photon photon = sPhotons[gl_LocalInvocationIndex];

    vec2 r = rand(vec2(gl_GlobalInvocationID.xy) * uRandSeed);
    for (uint i = 0u; i < uSteps; i++) {
        r = rand(r);
        float t = -log(r.x) / uMajorant;
        photon.position += t * photon.direction;

        vec4 volumeSample = sampleVolumeColor(photon.position);
        float muAbsorption = volumeSample.a * uAbsorptionCoefficient;
        float muScattering = volumeSample.a * uScatteringCoefficient;
        float muNull = uMajorant - muAbsorption - muScattering;
        float muMajorant = muAbsorption + muScattering + abs(muNull);
        float PNull = abs(muNull) / muMajorant;
        float PAbsorption = muAbsorption / muMajorant;
        float PScattering = muScattering / muMajorant;

        if (any(greaterThan(photon.position, vec3(1))) || any(lessThan(photon.position, vec3(0)))) {
            // out of bounds
            vec4 envSample = sampleEnvironmentMap(photon.direction);
            photon.samples++;
            photon.color += (photon.radiance * envSample.rgb - photon.color) / float(photon.samples);
            //r = rand(r);
            resetPhoton(r, photon);
        } else if (photon.bounces >= uMaxBounces) {
            // max bounces achieved -> only estimate transmittance
            photon.radiance *= 1.0 - (muAbsorption + muScattering) / muMajorant;
        } else if (r.y < PAbsorption) {
            // absorption
            photon.radiance *= 1.0 - (muAbsorption + muScattering) / muMajorant;
        } else if (r.y < PAbsorption + PScattering) {
            // scattering
            r = rand(r);
            photon.radiance *= volumeSample.rgb * muScattering / (muMajorant * PScattering);
            photon.direction = sampleHenyeyGreenstein(uScatteringBias, r, photon.direction);
            photon.bounces++;
        } else {
            // null collision
            photon.radiance *= muNull / (muMajorant * PNull);
        }
    }

    sPhotons[gl_LocalInvocationIndex] = photon;
    imageStore(oColor, ivec2(gl_GlobalInvocationID.xy), vec4(photon.color, 1));
}

%%MCCReset:compute

#version 310 es
layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

uniform mat4 uMvpInverseMatrix;
uniform vec2 uInverseResolution;
uniform float uRandSeed;
uniform float uBlur;

@rand
@unprojectRand
@intersectCube

struct Photon {
    vec3 position;
    vec3 direction;
    vec3 radiance;
    vec3 color; // image is either writeonly or readonly :(
    uint bounces;
    uint samples; // could be in color.a?
};

layout (std430, binding = 0) buffer bPhotons {
    Photon sPhotons[];
};

void main() {
    Photon photon;
    vec3 from, to;
    vec2 screen = vec2(gl_GlobalInvocationID.xy) * uInverseResolution;
    vec2 randState = rand(screen * uRandSeed);
    unprojectRand(randState, screen, uMvpInverseMatrix, uInverseResolution, uBlur, from, to);
    photon.direction = normalize(to - from);
    vec2 tbounds = max(intersectCube(from, photon.direction), 0.0);
    photon.position = from + tbounds.x * photon.direction;
    photon.radiance = vec3(1);
    photon.color = vec3(0);
    photon.bounces = 0u;
    photon.samples = 0u;
    sPhotons[gl_LocalInvocationIndex] = photon;
}
