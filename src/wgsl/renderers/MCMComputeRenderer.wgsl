// #part /wgsl/shaders/renderers/MCMCompute/render

override WORKGROUP_SIZE_X: u32;
override WORKGROUP_SIZE_Y: u32;

const EPS: f32 = 1e-5;

struct Uniforms {
    mvpInverseMatrix: mat4x4f,
    inverseResolution: vec2f,
    randSeed: f32,
    blur: f32,
    extinction: f32,
    anisotropy: f32,
    maxBounces: u32,
    steps: u32
};

@group(0) @binding(0) var uVolume: texture_3d<f32>;
@group(0) @binding(1) var uVolumeSampler: sampler;
@group(0) @binding(2) var uTransferFunction: texture_2d<f32>;
@group(0) @binding(3) var uTransferFunctionSampler: sampler;
@group(0) @binding(4) var uEnvironment: texture_2d<f32>;
@group(0) @binding(5) var uEnvironmentSampler: sampler;

@group(0) @binding(6) var<uniform> uniforms: Uniforms;
@group(0) @binding(7) var<storage, read_write> uPhotons: array<Photon>;
@group(0) @binding(8) var uRadiance: texture_storage_2d<rgba16float, write>;


#include <Photon>
#include <intersectCube>

#include <constants>
#include <random/hash/pcg>
#include <random/hash/squashlinear>
#include <random/distribution/uniformdivision>
#include <random/distribution/square>
#include <random/distribution/disk>
#include <random/distribution/sphere>
#include <random/distribution/exponential>

#include <unprojectRand>

fn resetPhoton(state: ptr<function, u32>, photon: ptr<function, Photon>, screenPosition: vec2f) {
    var fromPos: vec3f;
    var toPos: vec3f;
    unprojectRand(state, screenPosition, uniforms.mvpInverseMatrix, uniforms.inverseResolution, uniforms.blur, &fromPos, &toPos);
    (*photon).direction = normalize(toPos - fromPos);
    (*photon).bounces = 0u;
    var tbounds: vec2f = max(intersectCube(fromPos, (*photon).direction), vec2f(0.0));
    (*photon).position = fromPos + tbounds.x * (*photon).direction;
    (*photon).transmittance = vec3f(1.0);
}

fn sampleEnvironmentMap(d: vec3f) -> vec4f {
    let texCoord: vec2f = vec2f(atan2(d.x, -d.z), asin(-d.y) * 2.0) * INVPI * 0.5 + 0.5; // TODO: Why shouldn't y be negated here?
    return textureSampleLevel(uEnvironment, uEnvironmentSampler, texCoord, 0.0);
}

fn sampleVolumeColor(position: vec3f) -> vec4f {
    let volumeSample: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).rg;
    let transferSample: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSample, 0.0);
    return transferSample;
}

fn sampleHenyeyGreensteinAngleCosine(state: ptr<function, u32>, g: f32) -> f32 {
    let g2: f32 = g * g;
    let c: f32 = (1.0 - g2) / (1.0 - g + 2.0 * g * random_uniform(state));
    return (1.0 + g2 - c * c) / (2.0 * g);
}

fn sampleHenyeyGreenstein(state: ptr<function, u32>, g: f32, direction: vec3f) -> vec3f {
    // Generate random direction and adjust it so that the angle is HG-sampled
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

fn mean3(v: vec3f) -> f32 {
    return dot(v, vec3f(1.0 / 3.0));
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn compute_main(
    @builtin(global_invocation_id) globalId : vec3u,
    @builtin(num_workgroups) numWorkgroups: vec3u
) {
    let globalSize: vec3u = vec3u(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1u) * numWorkgroups;
    let globalIndex: u32 = globalId.x + globalId.y * globalSize.x;
    if (globalIndex > arrayLength(&uPhotons)) {
        return;
    }

    let screenPosition: vec2f = ((vec2f(globalId.xy) + 0.5) * uniforms.inverseResolution - 0.5) * vec2f(2.0, -2.0); // TODO: Double check this

    var photon: Photon = uPhotons[globalIndex];

    var state: u32 = hash3(vec3u(globalId.x, globalId.y, bitcast<u32>(uniforms.randSeed)));
    for (var i: u32 = 0u; i < uniforms.steps; i++) {
        let dist: f32 = random_exponential(&state, uniforms.extinction);
        photon.position += dist * photon.direction;

        let volumeSample: vec4f = sampleVolumeColor(photon.position);

        let PNull: f32 = 1.0 - volumeSample.a;
        var PScattering: f32;
        if (photon.bounces >= uniforms.maxBounces) {
            PScattering = 0.0;
        } else {
            PScattering = volumeSample.a * max3(volumeSample.rgb);
        }
        let PAbsorption: f32 = 1.0 - PNull - PScattering;

        let fortuneWheel: f32 = random_uniform(&state);
        if (any(photon.position > vec3f(1.0)) || any(photon.position < vec3f(0.0))) {
            // Out of bounds
            let envSample: vec4f = sampleEnvironmentMap(photon.direction);
            let radiance: vec3f = photon.transmittance * envSample.rgb;
            photon.samples++;
            photon.radiance += (radiance - photon.radiance) / f32(photon.samples);
            resetPhoton(&state, &photon, screenPosition);
        } else if (fortuneWheel < PAbsorption) {
            // Absorption
            let radiance: vec3f = vec3f(0.0);
            photon.samples++;
            photon.radiance += (radiance - photon.radiance) / f32(photon.samples);
            resetPhoton(&state, &photon, screenPosition);
        } else if (fortuneWheel < PAbsorption + PScattering) {
            // Scattering
            photon.transmittance *= volumeSample.rgb;
            photon.direction = sampleHenyeyGreenstein(&state, uniforms.anisotropy, photon.direction);
            photon.bounces++;
        } else {
            // Null collision
        }
    }

    uPhotons[globalIndex] = photon;
    textureStore(uRadiance, globalId.xy, vec4f(photon.radiance, 1.0));
}


// #part /wgsl/shaders/renderers/MCMCompute/reset

override WORKGROUP_SIZE_X: u32;
override WORKGROUP_SIZE_Y: u32;

struct Uniforms {
    mvpInverseMatrix: mat4x4f,
    inverseResolution: vec2f,
    randSeed: f32,
    blur: f32
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> uPhotons: array<Photon>; // TODO: Check if it's possible to use read only


#include <Photon>
#include <intersectCube>

#include <constants>
#include <random/hash/pcg>
#include <random/hash/squashlinear>
#include <random/distribution/uniformdivision>
#include <random/distribution/square>
#include <random/distribution/disk>
#include <random/distribution/sphere>
#include <random/distribution/exponential>

#include <unprojectRand>

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn compute_main(
    @builtin(global_invocation_id) globalId : vec3u,
    @builtin(num_workgroups) numWorkgroups: vec3u
) {
    let globalSize: vec3u = vec3u(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1u) * numWorkgroups;
    let globalIndex: u32 = globalId.x + globalId.y * globalSize.x;
    if (globalIndex > arrayLength(&uPhotons)) {
        return;
    }
    
    let screenPosition: vec2f = ((vec2f(globalId.xy) + 0.5) * uniforms.inverseResolution - 0.5) * vec2f(2.0, -2.0); // TODO: Double check this
    
    var photon: Photon;
    var fromPos: vec3f;
    var toPos: vec3f;

    var state: u32 = hash3(vec3u(globalId.x, globalId.y, bitcast<u32>(uniforms.randSeed)));
    unprojectRand(&state, screenPosition, uniforms.mvpInverseMatrix, uniforms.inverseResolution, uniforms.blur, &fromPos, &toPos);
    photon.direction = normalize(toPos - fromPos);
    let tbounds: vec2f = max(intersectCube(fromPos, photon.direction), vec2f(0.0));
    photon.position = fromPos + tbounds.x * photon.direction;
    photon.transmittance = vec3f(1.0);
    photon.radiance = vec3f(1.0);
    photon.bounces = 0u;
    photon.samples = 0u;

    uPhotons[globalIndex] = photon;
}
