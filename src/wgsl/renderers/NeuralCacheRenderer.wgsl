// #part /wgsl/shaders/renderers/NeuralCache/structs

override WORKGROUP_SIZE_X: u32;
override WORKGROUP_SIZE_Y: u32;

const EPS: f32 = 1e-5;
const PI: f32 = 3.14159265359;
const TWOPI: f32 = 6.28318530718;
const INVPI: f32 = 0.31830988618;

struct Uniforms {
    mvpInverseMatrix: mat4x4f,
    inverseResolution: vec2f,
    resolution: vec2f,
    blur: f32,
    extinction: f32,
    anisotropy: f32,
    randSeed: u32,
    samples: u32,
    steps: u32,
};

struct Photon {
    position: vec3f,
    bounces: u32,
    direction: vec3f,
    samples: u32,
    transmittance: vec3f,
    radiance: vec3f,
};

// #part /wgsl/shaders/renderers/NeuralCache/helpers

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> uPhotons: array<Photon>;
@group(0) @binding(2) var uRadiance: texture_storage_2d<rgba16float, write>;

fn hash(val: u32) -> u32 {
    var x: u32 = val * 747796405u + 2891336453u;
    x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
    return (x >> 22u) ^ x;
}

fn hash2(x: vec2u) -> u32 {
    return hash(19u * x.x + 47u * x.y + 101u);
}

fn hash3(x: vec3u) -> u32 {
    return hash(19u * x.x + 47u * x.y + 101u * x.z + 131u);
}

fn random_uniform(state: ptr<function, u32>) -> f32 {
    *state = hash(*state);
    return f32(*state) / f32(~0u);
}

fn random_square(state: ptr<function, u32>) -> vec2f {
    let x: f32 = random_uniform(state);
    let y: f32 = random_uniform(state);
    return vec2f(x, y);
}

fn random_disk(state: ptr<function, u32>) -> vec2f {
    let radius: f32 = sqrt(random_uniform(state));
    let angle: f32 = TWOPI * random_uniform(state);
    return radius * vec2f(cos(angle), sin(angle));
}

fn random_sphere(state: ptr<function, u32>) -> vec3f {
    let disk: vec2f = random_disk(state);
    let norm: f32 = dot(disk, disk);
    let radius: f32 = 2.0 * sqrt(1.0 - norm);
    let z: f32 = 1.0 - 2.0 * norm;
    return vec3f(radius * disk, z);
}

fn random_exponential(state: ptr<function, u32>, rate: f32) -> f32 {
    return -log(random_uniform(state)) / rate;
}

fn intersectCube(origin: vec3f, direction: vec3f) -> vec2f {
    let tmin: vec3f = (vec3f(0.0) - origin) / direction;
    let tmax: vec3f = (vec3f(1.0) - origin) / direction;
    let t1: vec3f = min(tmin, tmax);
    let t2: vec3f = max(tmin, tmax);
    let tnear: f32 = max(max(t1.x, t1.y), t1.z);
    let tfar: f32 = min(min(t2.x, t2.y), t2.z);
    return vec2f(tnear, tfar);
}

fn unprojectRand(
    state: ptr<function, u32>,
    screenPosition: vec2f,
    inverseMvp: mat4x4f,
    inverseResolution: vec2f,
    blur: f32,
    outFrom: ptr<function, vec3f>,
    outTo: ptr<function, vec3f>
) {
    let offset: vec2f = random_disk(state) * blur;
    let nearPosition: vec4f = vec4f(screenPosition + offset, -1.0, 1.0);
    let antialiasing: vec2f = (random_square(state) * 2.0 - 1.0) * inverseResolution;
    let farPosition: vec4f = vec4f(screenPosition + antialiasing, 1.0, 1.0);
    let fromDirty: vec4f = inverseMvp * nearPosition;
    let toDirty: vec4f = inverseMvp * farPosition;
    *outFrom = fromDirty.xyz / fromDirty.w;
    *outTo = toDirty.xyz / toDirty.w;
}

fn sampleHenyeyGreensteinAngleCosine(state: ptr<function, u32>, g: f32) -> f32 {
    let g2: f32 = g * g;
    let c: f32 = (1.0 - g2) / (1.0 - g + 2.0 * g * random_uniform(state));
    return (1.0 + g2 - c * c) / (2.0 * g);
}

fn sampleHenyeyGreenstein(state: ptr<function, u32>, g: f32, direction: vec3f) -> vec3f {
    let u: vec3f = random_sphere(state);
    if (abs(g) < EPS) {
        return u;
    }
    let hgcos: f32 = sampleHenyeyGreensteinAngleCosine(state, g);
    let circle: vec3f = normalize(u - dot(u, direction) * direction);
    return sqrt(1.0 - hgcos * hgcos) * circle + hgcos * direction;
}

fn max3(v: vec3f) -> f32 {
    return max(max(v.x, v.y), v.z);
}

// Compute normalized device coordinates (NDC) from pixel position
// Maps pixel coordinates to range [-1, 1] with Y-axis flipped (OpenGL convention)
//
// Transformation steps:
// 1. Add 0.5 to sample pixel center
// 2. Multiply by inverseResolution to get [0, 1] range
// 3. Subtract 0.5 to center at origin
// 4. Multiply by (2, -2) to get [-1, 1] range with Y flipped
//
// Examples for resolution 512x512 (inverseResolution = 0.001953125):
//   - Pixel (0, 0)     (top-left):     → (-0.998,  0.998)
//   - Pixel (256, 256) (center):       → ( 0.002, -0.002)
//   - Pixel (511, 511) (bottom-right): → ( 0.998, -0.998)
//
fn computeScreenPosition(pixel: vec2u) -> vec2f {
    return ((vec2f(pixel) + 0.5) * uniforms.inverseResolution - 0.5) * vec2f(2.0, -2.0);
}

fn resetPhoton(
    state: ptr<function, u32>,
    photon: ptr<function, Photon>,
    screenPosition: vec2f,
) {
    let mvp = uniforms.mvpInverseMatrix;
    let invRes = uniforms.inverseResolution;
    let blur = uniforms.blur;

    var fromPos: vec3f;
    var toPos: vec3f;
    unprojectRand(state, screenPosition, mvp, invRes, blur, &fromPos, &toPos);

    (*photon).direction = normalize(toPos - fromPos);
    var tbounds: vec2f = max(intersectCube(fromPos, (*photon).direction), vec2f(0.0));
    (*photon).position = fromPos + tbounds.x * (*photon).direction;

    (*photon).bounces = 0u;
    (*photon).transmittance = vec3f(1.0);
}

fn createPhoton(state: ptr<function, u32>, screenPosition: vec2f) -> Photon {
    var photon: Photon;
    resetPhoton(state, &photon, screenPosition);
    photon.samples = 0u;
    photon.radiance = vec3f(1.0);
    return photon;
}

fn accumulatePhoton(stored: ptr<function, Photon>, fresh: ptr<function, Photon>) {
    if ((*fresh).samples == 0u) {
        return;
    }
    let totalSamples: f32 = f32((*stored).samples + (*fresh).samples);
    (*stored).radiance = (*stored).radiance * f32((*stored).samples) / totalSamples + (*fresh).radiance * f32((*fresh).samples) / totalSamples;
    (*stored).samples += (*fresh).samples;
}

// #part /wgsl/shaders/renderers/NeuralCache/reset

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn reset(@builtin(global_invocation_id) globalId: vec3u) {
    let res = vec2u(uniforms.resolution);

    if (globalId.x >= res.x || globalId.y >= res.y) {
        return;
    }

    let globalIndex: u32 = globalId.x + globalId.y * res.x;
    if (globalIndex >= arrayLength(&uPhotons)) {
        return;
    }

    let screenPosition: vec2f = computeScreenPosition(globalId.xy);
    var state: u32 = hash3(vec3u(globalId.x, globalId.y, uniforms.randSeed));
    let photon = createPhoton(&state, screenPosition);

    uPhotons[globalIndex] = photon;
    textureStore(uRadiance, globalId.xy, vec4f(photon.radiance, 1.0));
}

// #part /wgsl/shaders/renderers/NeuralCache/render

@group(0) @binding(3) var uVolume: texture_3d<f32>;
@group(0) @binding(4) var uVolumeSampler: sampler;
@group(0) @binding(5) var uTransferFunction: texture_2d<f32>;
@group(0) @binding(6) var uTransferFunctionSampler: sampler;
@group(0) @binding(7) var uEnvironment: texture_2d<f32>;
@group(0) @binding(8) var uEnvironmentSampler: sampler;

fn sampleEnvironmentMap(d: vec3f) -> vec4f {
    let texCoord: vec2f = vec2f(atan2(d.x, -d.z), asin(-d.y) * 2.0) * INVPI * 0.5 + 0.5;
    return textureSampleLevel(uEnvironment, uEnvironmentSampler, texCoord, 0.0);
}

fn sampleVolumeColor(position: vec3f) -> vec4f {
    let volumeSample: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).rg;
    let transferSample: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSample, 0.0);
    return transferSample;
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn render(@builtin(global_invocation_id) globalId: vec3u) {
    let res = vec2u(uniforms.resolution);

    if (globalId.x >= res.x || globalId.y >= res.y) {
        return;
    }

    let globalIndex: u32 = globalId.x + globalId.y * res.x;
    if (globalIndex >= arrayLength(&uPhotons)) {
        return;
    }

    let screenPosition: vec2f = computeScreenPosition(globalId.xy);

    var state: u32 = hash3(vec3u(globalId.x, globalId.y, uniforms.randSeed));

    // Read stored photon from buffer
    var storedPhoton: Photon = uPhotons[globalIndex];

    // Create fresh photon for this frame
    var freshPhoton: Photon = createPhoton(&state, screenPosition);

    // Path trace with fresh photon
    for (var j: u32 = 0u; j < uniforms.samples; j++) {
        resetPhoton(&state, &freshPhoton, screenPosition);
        for (var i: u32 = 0u; i < uniforms.steps; i++) {
            let dist: f32 = random_exponential(&state, uniforms.extinction);
            freshPhoton.position += dist * freshPhoton.direction;

            let volumeSample: vec4f = sampleVolumeColor(freshPhoton.position);

            let PNull: f32 = 1.0 - volumeSample.a;
            var PScattering = volumeSample.a * max3(volumeSample.rgb);
            let PAbsorption: f32 = 1.0 - PNull - PScattering;

            let fortuneWheel: f32 = random_uniform(&state);
            if (any(freshPhoton.position > vec3f(1.0)) || any(freshPhoton.position < vec3f(0.0))) {
                // Out of bounds
                let envSample: vec4f = sampleEnvironmentMap(freshPhoton.direction);
                let radiance: vec3f = freshPhoton.transmittance * envSample.rgb;
                freshPhoton.samples++;
                freshPhoton.radiance += (radiance - freshPhoton.radiance) / f32(freshPhoton.samples);
                break;
            } else if (fortuneWheel < PAbsorption) {
                // Absorption
                let radiance: vec3f = vec3f(0.0);
                freshPhoton.samples++;
                freshPhoton.radiance += (radiance - freshPhoton.radiance) / f32(freshPhoton.samples);
                break;
            } else if (fortuneWheel < PAbsorption + PScattering) {
                // Scattering
                freshPhoton.transmittance *= volumeSample.rgb;
                freshPhoton.direction = sampleHenyeyGreenstein(&state, uniforms.anisotropy, freshPhoton.direction);
                freshPhoton.bounces++;
            }
        }
    }

    // Combine fresh with stored (to make accumulation possible)
    accumulatePhoton(&storedPhoton, &freshPhoton);

    // Store back to buffer (for possible accumulation if enabled)
    uPhotons[globalIndex] = storedPhoton;
    textureStore(uRadiance, globalId.xy, vec4f(storedPhoton.radiance, 1.0));
}
