// #part /wgsl/shaders/renderers/MCM/integrate

const EPS: f32 = 1e-5;
const SQRT3: f32 = 1.73205080757;

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) vertex_position: vec2f,
};

struct FragmentOut {
    @location(0) position: vec4f,
    @location(1) direction: vec4f,
    @location(2) transmittance: vec4f,
    @location(3) radiance: vec4f
}

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

struct CutPlane {
    uMinCutPlane: vec3f,
    uMaxCutPlane: vec3f,
    uViewCutDistance: f32
};

// popravi binding

@group(0) @binding(0) var uVolume0: texture_3d<f32>;
@group(0) @binding(1) var uVolumeSampler0: sampler;
@group(0) @binding(2) var uVolume1: texture_3d<f32>;
@group(0) @binding(3) var uVolumeSampler1: sampler;
@group(0) @binding(4) var uTransferFunction1: texture_2d<f32>;
@group(0) @binding(5) var uTransferFunctionSampler1: sampler;
@group(0) @binding(6) var uTransferFunction1D_1: texture_2d<f32>;
@group(0) @binding(7) var uTransferFunctionSampler1D_1: sampler;
@group(0) @binding(8) var uTransferFunction1D_2: texture_2d<f32>;
@group(0) @binding(9) var uTransferFunctionSampler1D_2: sampler;
@group(0) @binding(10) var uTransferFunction1D_3: texture_2d<f32>;
@group(0) @binding(11) var uTransferFunctionSampler1D_3: sampler;
@group(0) @binding(12) var uTransferFunction1D_4: texture_2d<f32>;
@group(0) @binding(13) var uTransferFunctionSampler1D_4: sampler;

@group(0) @binding(14) var uEnvironment: texture_2d<f32>;
@group(0) @binding(15) var uEnvironmentSampler: sampler;
@group(0) @binding(16) var uPosition: texture_2d<f32>;
@group(0) @binding(17) var uPositionSampler: sampler;
@group(0) @binding(18) var uDirection: texture_2d<f32>;
@group(0) @binding(19) var uDirectionSampler: sampler;
@group(0) @binding(20) var uTransmittance: texture_2d<f32>;
@group(0) @binding(21) var uTransmittanceSampler: sampler;
@group(0) @binding(22) var uRadiance: texture_2d<f32>;
@group(0) @binding(23) var uRadianceSampler: sampler;

@group(0) @binding(24) var<uniform> uniforms: Uniforms;

@group(1) @binding(0) var<uniform> uVisMode: u32;
@group(1) @binding(1) var<uniform> cutPlane: CutPlane;


const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOut  {
    let vertex: vec2f = vertices[vertexIndex];

    var vertexOut : VertexOut;
    vertexOut.position = vec4f(vertex, 0.0, 1.0);
    vertexOut.vertex_position = vertex;
    return vertexOut;
}


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
    var tbounds: vec2f = max(cutIntersectCube(fromPos, (*photon).direction, cutPlane.uMinCutPlane, cutPlane.uMaxCutPlane), vec2f(0.0));
    (*photon).position = fromPos + (tbounds.x + cutPlane.uViewCutDistance * SQRT3) * (*photon).direction;
    (*photon).transmittance = vec3f(1.0);
}

fn sampleEnvironmentMap(d: vec3f) -> vec4f {
    let texCoord: vec2f = vec2f(atan2(d.x, -d.z), asin(-d.y) * 2.0) * INVPI * 0.5 + 0.5; // TODO: Why shouldn't y be negated here?
    // return textureSample(uEnvironment, uEnvironmentSampler, texCoord);
    return textureSampleLevel(uEnvironment, uEnvironmentSampler, texCoord, 0.0);
}
 
fn sampleVolumeColor(position: vec3f) -> vec4f {
    let dimensions = vec3f(textureDimensions(uVolume1));
    var transferSample = vec4f(0, 0, 0, 0);
    if (uVisMode == 0u) {
        // clustering shader
        let orig = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0);
        let coords = vec3i(position * dimensions);
        let xy = textureLoad(uVolume1, coords, 0).rg;
        let color = textureSampleLevel(uTransferFunction1, uTransferFunctionSampler1, xy, 0.0);
        let sumOrig = clamp((orig.r + orig.g + orig.b + orig.a), 0.0, 1.0);
        transferSample = vec4f(color.rgb, sumOrig * color.a);
    }
    else if (uVisMode == 1u) {
         // basic 4 channel sampling
        let volumeSample1: vec2f = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).rg;
        let volumeSample2: vec2f = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).ba;
        let volumeSample: vec2f = vec2f(volumeSample1 * volumeSample2);
        transferSample = textureSampleLevel(uTransferFunction1, uTransferFunctionSampler1, volumeSample, 0.0);
    }
    else {
        // per channel color sampling
        let volumeSampleR = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).r;
        let transferSampleR: vec4f = textureSampleLevel(uTransferFunction1D_1, uTransferFunctionSampler1D_1, vec2f(volumeSampleR, 0.5), 0.0);
        let volumeSampleG = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).g;
        let transferSampleG: vec4f = textureSampleLevel(uTransferFunction1D_2, uTransferFunctionSampler1D_2, vec2f(volumeSampleG, 0.5), 0.0);
        let volumeSampleB = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).b;
        let transferSampleB: vec4f = textureSampleLevel(uTransferFunction1D_3, uTransferFunctionSampler1D_3, vec2f(volumeSampleB, 0.5), 0.0);
        let volumeSampleA = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).a;
        let transferSampleA: vec4f = textureSampleLevel(uTransferFunction1D_4, uTransferFunctionSampler1D_4, vec2f(volumeSampleA, 0.5), 0.0);

        let sumAlpha: f32 = transferSampleR.a + transferSampleG.a + transferSampleB.a + transferSampleA.a;
        let sumColor = vec3f(transferSampleR.rgb * transferSampleR.a + transferSampleG.rgb * transferSampleG.a + transferSampleB.rgb * transferSampleB.a + transferSampleA.rgb * transferSampleA.a) / sumAlpha;
        transferSample = vec4f(sumColor, sumAlpha/4.0);
    }
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

@fragment
fn fragment_main(@location(0) fragment_position: vec2f) -> FragmentOut {
    var photon: Photon;
    let mappedPosition: vec2f = fragment_position * vec2f(0.5, -0.5) + 0.5;
    photon.position = textureSample(uPosition, uPositionSampler, mappedPosition).xyz;
    let directionAndBounces: vec4f = textureSample(uDirection, uDirectionSampler, mappedPosition);
    photon.direction = directionAndBounces.xyz;
    photon.bounces = u32(directionAndBounces.w + 0.5);
    photon.transmittance = textureSample(uTransmittance, uTransmittanceSampler, mappedPosition).rgb;
    let radianceAndSamples: vec4f = textureSample(uRadiance, uRadianceSampler, mappedPosition);
    photon.radiance = radianceAndSamples.rgb;
    photon.samples = u32(radianceAndSamples.w + 0.5);

    var state: u32 = hash3(vec3u(bitcast<u32>(mappedPosition.x), bitcast<u32>(mappedPosition.y), bitcast<u32>(uniforms.randSeed)));
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
            resetPhoton(&state, &photon, fragment_position);
        } else if (fortuneWheel < PAbsorption) {
            // Absorption
            let radiance: vec3f = vec3f(0.0);
            photon.samples++;
            photon.radiance += (radiance - photon.radiance) / f32(photon.samples);
            resetPhoton(&state, &photon, fragment_position);
        } else if (fortuneWheel < PAbsorption + PScattering) {
            // Scattering
            photon.transmittance *= volumeSample.rgb;
            photon.direction = sampleHenyeyGreenstein(&state, uniforms.anisotropy, photon.direction);
            photon.bounces++;
        } else {
            // Null collision
        }
    }

    var fragmentOut: FragmentOut;
    fragmentOut.position = vec4f(photon.position, 0.0);
    fragmentOut.direction = vec4f(photon.direction, f32(photon.bounces));
    fragmentOut.transmittance = vec4f(photon.transmittance, 0.0);
    fragmentOut.radiance = vec4f(photon.radiance, f32(photon.samples));
    return fragmentOut;
}


// #part /wgsl/shaders/renderers/MCM/render

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
}

@group(0) @binding(0) var uAccumulator: texture_2d<f32>;
@group(0) @binding(1) var uAccumulatorSampler: sampler;

const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOut  {
    let vertex: vec2f = vertices[vertexIndex];

    var vertexOut : VertexOut;
    vertexOut.position = vec4f(vertex, 0.0, 1.0);
    vertexOut.uv = vertex * vec2f(0.5, -0.5) + 0.5;
    return vertexOut;
}

@fragment
fn fragment_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    return textureSample(uAccumulator, uAccumulatorSampler, uv);
}


// #part /wgsl/shaders/renderers/MCM/reset

const SQRT3: f32 = 1.73205080757;

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) vertex_position: vec2f,
};

struct FragmentOut {
    @location(0) position: vec4f,
    @location(1) direction: vec4f,
    @location(2) transmittance: vec4f,
    @location(3) radiance: vec4f
}

struct Uniforms {
    mvpInverseMatrix: mat4x4f,
    inverseResolution: vec2f,
    randSeed: f32,
    blur: f32
};

struct CutPlane {
    uMinCutPlane: vec3f,
    uMaxCutPlane: vec3f,
    uViewCutDistance: f32
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> cutPlane: CutPlane;

const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOut  {
    let vertex: vec2f = vertices[vertexIndex];

    var vertexOut : VertexOut;
    vertexOut.position = vec4f(vertex, 0.0, 1.0);
    vertexOut.vertex_position = vertex;
    return vertexOut;
}


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

@fragment
fn fragment_main(@location(0) fragment_position: vec2f) -> FragmentOut {
    var photon: Photon;
    var fromPos: vec3f;
    var toPos: vec3f;

    var state: u32 = hash3(vec3u(bitcast<u32>(fragment_position.x), bitcast<u32>(fragment_position.y), bitcast<u32>(uniforms.randSeed)));
    unprojectRand(&state, fragment_position, uniforms.mvpInverseMatrix, uniforms.inverseResolution, uniforms.blur, &fromPos, &toPos);
    photon.direction = normalize(toPos - fromPos);
    let tbounds: vec2f = max(cutIntersectCube(fromPos, photon.direction, cutPlane.uMinCutPlane, cutPlane.uMaxCutPlane), vec2f(0.0));
    photon.position = fromPos + (tbounds.x + cutPlane.uViewCutDistance * SQRT3) * photon.direction;
    photon.transmittance = vec3f(1.0);
    photon.radiance = vec3f(1.0);
    photon.bounces = 0u;
    photon.samples = 0u;

    var fragmentOut: FragmentOut;
    fragmentOut.position = vec4f(photon.position, 0);
    fragmentOut.direction = vec4f(photon.direction, f32(photon.bounces));
    fragmentOut.transmittance = vec4f(photon.transmittance, 0);
    fragmentOut.radiance = vec4f(photon.radiance, f32(photon.samples));
    return fragmentOut;
}
