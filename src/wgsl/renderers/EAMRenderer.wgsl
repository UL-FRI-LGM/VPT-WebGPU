// #part /wgsl/shaders/renderers/EAM/generate

diagnostic(off, derivative_uniformity);

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) rayFrom: vec3f,
    @location(1) rayTo: vec3f
};

struct Uniforms {
    mvpInverseMatrix: mat4x4f,
    stepSize: f32,
    offset: f32,
    extinction: f32
};

@group(0) @binding(0) var uVolume0: texture_3d<f32>;
@group(0) @binding(1) var uVolumeSampler0: sampler;
@group(0) @binding(2) var uTransferFunction1: texture_2d<f32>;
@group(0) @binding(3) var uTransferFunctionSampler1: sampler;
@group(0) @binding(4) var uTransferFunction2: texture_2d<f32>;
@group(0) @binding(5) var uTransferFunctionSampler2: sampler;
@group(0) @binding(6) var uTransferFunction3: texture_2d<f32>;
@group(0) @binding(7) var uTransferFunctionSampler3: sampler;
@group(0) @binding(8) var uTransferFunction4: texture_2d<f32>;
@group(0) @binding(9) var uTransferFunctionSampler4: sampler;
@group(0) @binding(10) var<uniform> uniforms0: Uniforms;
// popravi variable da bojo predstavljali drugi volumen!!
@group(1) @binding(0) var uVolume1: texture_3d<f32>;
@group(1) @binding(1) var uVolumeSampler1: sampler;
@group(1) @binding(2) var uTransferFunction5: texture_2d<f32>;
@group(1) @binding(3) var uTransferFunctionSampler5: sampler;
@group(1) @binding(4) var uTransferFunction6: texture_2d<f32>;
@group(1) @binding(5) var uTransferFunctionSampler6: sampler;
@group(1) @binding(6) var uTransferFunction7: texture_2d<f32>;
@group(1) @binding(7) var uTransferFunctionSampler7: sampler;
@group(1) @binding(8) var uTransferFunction8: texture_2d<f32>;
@group(1) @binding(9) var uTransferFunctionSampler8: sampler;
@group(1) @binding(10) var<uniform> uniforms1: Uniforms;


// @group(0) @binding(0) var uVolume0: texture_3d<f32>;
// @group(0) @binding(1) var uVolumeSampler0: sampler;
// @group(0) @binding(2) var uVolume1: texture_3d<f32>;
// @group(0) @binding(3) var uVolumeSampler1: sampler;
// @group(0) @binding(4) var uTransferFunction1: texture_2d<f32>;
// @group(0) @binding(5) var uTransferFunctionSampler1: sampler;
// @group(0) @binding(6) var uTransferFunction2: texture_2d<f32>;
// @group(0) @binding(7) var uTransferFunctionSampler2: sampler;
// @group(0) @binding(8) var uTransferFunction3: texture_2d<f32>;
// @group(0) @binding(9) var uTransferFunctionSampler3: sampler;
// @group(0) @binding(10) var uTransferFunction4: texture_2d<f32>;
// @group(0) @binding(11) var uTransferFunctionSampler4: sampler;
// @group(0) @binding(12) var uTransferFunction5: texture_2d<f32>;
// @group(0) @binding(13) var uTransferFunctionSampler5: sampler;
// @group(0) @binding(14) var uTransferFunction6: texture_2d<f32>;
// @group(0) @binding(15) var uTransferFunctionSampler6: sampler;
// @group(0) @binding(16) var uTransferFunction7: texture_2d<f32>;
// @group(0) @binding(17) var uTransferFunctionSampler7: sampler;
// @group(0) @binding(18) var uTransferFunction8: texture_2d<f32>;
// @group(0) @binding(19) var uTransferFunctionSampler8: sampler;
// @group(0) @binding(20) var<uniform> uniforms0: Uniforms;


const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

#include <unproject>

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOut  {
    let vertex: vec2f = vertices[vertexIndex];

    var rayFrom: vec3f;
    var rayTo: vec3f;
    unproject(vertex, uniforms0.mvpInverseMatrix, &rayFrom, &rayTo);
    // unproject(vertex, uniforms1.mvpInverseMatrix, &rayFrom, &rayTo);

    var vertexOut : VertexOut;
    vertexOut.position = vec4f(vertex, 0.0, 1.0);
    vertexOut.rayFrom = rayFrom;
    vertexOut.rayTo = rayTo;
    return vertexOut;
}

#include <intersectCube>

fn sampleVolumeColor(position: vec3f) -> vec4f { // lhko probam pol sam usak kanal posebej zašopat u vec4f pa da vidm če bojo ločeni

    // original
    // let volumeSample: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).rg;

    // // min max
    // let volumeSample1: vec2f = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).rg;
    // let volumeSample2: vec2f = textureSampleLevel(uVolume1, uVolumeSampler1, position, 0.0).ba;
    // let volumeSample: vec2f = vec2f(max(volumeSample1.x, volumeSample2.x), min(volumeSample1.y, volumeSample2.y));
    // let transferSample: vec4f = textureSampleLevel(uTransferFunction1, uTransferFunctionSampler1, volumeSample, 0.0);
    // return transferSample;

    let dimensions = vec3f(textureDimensions(uVolume1));

    let orig = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0);
    let coords = vec3i(position * dimensions);
    let xy = textureLoad(uVolume1, coords, 0).rg;
    let color = textureSampleLevel(uTransferFunction1, uTransferFunctionSampler1, xy, 0.0);
    // let dims = textureDimensions(uVolume1);
    // let voxel = vec3(position * vec3f(dims));
    // let clusterID = textureSampleLevel(uVolume1, uVolumeSampler1, voxel, 0.0);

    // if (clusterID == 0) {
    //     discard;
    // }

    // let origAlpha = orig.a;

    // let clusterMask = cluster.rgb;

    // let clusterStrength = length(clusterMask);

    // if (clusterStrength < 0.01) {
    //     discard;
    // }

    return vec4f(orig*color);

    // let origColor = orig.rgb;
    // let origAlpha = orig.a;

    // let clusterMask = cluster.a;   // use alpha as mask

    // // Branchless highlight
    // let highlightColor = vec3f(1.0, 0.0, 0.0);

    // let finalColor = mix(origColor, highlightColor, clusterMask);

    // return vec4f(finalColor, origAlpha);

    // return textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).rgba;

    // console.log(textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).r)

    // let volumeSample1: f32 = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).r;
    // let volumeSample2: f32 = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).g;
    // let volumeSample3: f32 = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).b;
    // let volumeSample4: f32 = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).a;
    // let transferSample = vec4f(volumeSample1, volumeSample2, volumeSample3, volumeSample4);

    // let transferSample: vec4f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0);
    // let transferSample: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSample, 0.0);

    // var volumeSampleR = vec2f(textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).r, textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).r);
    // var transferSampleR: vec4f = textureSampleLevel(uTransferFunction1, uTransferFunctionSampler1, volumeSampleR, 0.0);
    // var volumeSampleG = vec2f(textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).g, textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).g);
    // var transferSampleG: vec4f = textureSampleLevel(uTransferFunction2, uTransferFunctionSampler2, volumeSampleG, 0.0);
    // var volumeSampleB = vec2f(textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).b, textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).b);
    // var transferSampleB: vec4f = textureSampleLevel(uTransferFunction3, uTransferFunctionSampler3, volumeSampleB, 0.0);
    // var volumeSampleA = vec2f(textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).a, textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).a);
    // var transferSampleA: vec4f = textureSampleLevel(uTransferFunction4, uTransferFunctionSampler4, volumeSampleA, 0.0);

    // volumeSampleR = vec2f(textureSampleLevel(uVolume1, uVolumeSampler1, position, 0.0).r, textureSampleLevel(uVolume1, uVolumeSampler1, position, 0.0).r);
    // transferSampleR = textureSampleLevel(uTransferFunction5, uTransferFunctionSampler5, volumeSampleR, 0.0);
    // volumeSampleG = vec2f(textureSampleLevel(uVolume1, uVolumeSampler1, position, 0.0).g, textureSampleLevel(uVolume1, uVolumeSampler1, position, 0.0).g);
    // transferSampleG = textureSampleLevel(uTransferFunction6, uTransferFunctionSampler6, volumeSampleG, 0.0);
    // volumeSampleB = vec2f(textureSampleLevel(uVolume1, uVolumeSampler1, position, 0.0).b, textureSampleLevel(uVolume1, uVolumeSampler1, position, 0.0).b);
    // transferSampleB = textureSampleLevel(uTransferFunction7, uTransferFunctionSampler7, volumeSampleB, 0.0);
    // volumeSampleA = vec2f(textureSampleLevel(uVolume1, uVolumeSampler1, position, 0.0).a, textureSampleLevel(uVolume1, uVolumeSampler1, position, 0.0).a);
    // transferSampleA = textureSampleLevel(uTransferFunction8, uTransferFunctionSampler8, volumeSampleA, 0.0);

    // let sumAlpha: f32 = transferSampleR.a + transferSampleG.a + transferSampleB.a + transferSampleA.a;
    // let sumColor = vec3f(transferSampleR.rgb * transferSampleR.a + transferSampleG.rgb * transferSampleG.a + transferSampleB.rgb * transferSampleB.a + transferSampleA.rgb * transferSampleA.a) / sumAlpha;

    // return vec4f(sumColor, sumAlpha/4.0);
    // return vec4f(
    //     transferSampleR.r,
    //     transferSampleG.g,
    //     transferSampleB.b,
    //     transferSampleA.a
    // );

    // return transferSample;
}

// fn sampleVolumeColor(position: vec3f) -> mat4x4f { // lhko probam pol sam usak kanal posebej zašopat u vec4f pa da vidm če bojo ločeni

//     // original
//     // let volumeSample: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).rg;

//     // min max
//     // let volumeSample1: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).rg;
//     // let volumeSample2: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).ba;
//     // let volumeSample: vec2f = vec2f(max(volumeSample1.x, volumeSample1.y), min(volumeSample2.x, volumeSample2.y));
//     // let transferSample: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSample, 0.0);

//     // console.log(textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).r)

//     let volumeSampleR = vec2f(textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).r, textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).r);
//     let transferSampleR: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSampleR, 0.0);
//     let volumeSampleG = vec2f(textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).g, textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).g);
//     let transferSampleG: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSampleG, 0.0);
//     let volumeSampleB = vec2f(textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).b, textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).b);
//     let transferSampleB: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSampleB, 0.0);
//     let volumeSampleA = vec2f(textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).a, textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).a);
//     let transferSampleA: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSampleA, 0.0);

//     return mat4x4f(
//         transferSampleR,
//         transferSampleG,
//         transferSampleB,
//         transferSampleA
//     );
// }

@fragment
fn fragment_main(@location(0) rayFrom: vec3f, @location(1) rayTo: vec3f) -> @location(0) vec4f {
    let rayDirection: vec3f = rayTo - rayFrom;
    let tbounds: vec2f = max(intersectCube(rayFrom, rayDirection), vec2f(0.0));

    if (tbounds.x >= tbounds.y) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }
    
    let fromVal: vec3f = mix(rayFrom, rayTo, tbounds.x);
    let toVal: vec3f = mix(rayFrom, rayTo, tbounds.y);

    let rayStepLength: f32 = distance(fromVal, toVal) * uniforms0.stepSize;

    var t: f32 = uniforms0.stepSize * uniforms0.offset;
    var accumulator = vec4f(0.0);

    while (t < 1.0 && accumulator.a < 0.99) {
        let position: vec3f = mix(fromVal, toVal, t);
        var colorSample = sampleVolumeColor(position);
        colorSample.a *= rayStepLength * uniforms0.extinction;
        colorSample = vec4f(colorSample.rgb * colorSample.a, colorSample.a);
        accumulator += (1.0 - accumulator.a) * colorSample;
        t += uniforms0.stepSize;
    }

    if (accumulator.a > 1.0) {
        accumulator = vec4f(accumulator.rgb / accumulator.a, accumulator.a);
    }

    return vec4f(accumulator.rgb, 1.0);
}


// #part /wgsl/shaders/renderers/EAM/integrate

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
}

@group(0) @binding(0) var uAccumulator: texture_2d<f32>;
@group(0) @binding(1) var uAccumulatorSampler: sampler;
@group(0) @binding(2) var uFrame: texture_2d<f32>;
@group(0) @binding(3) var uFrameSampler: sampler;
@group(0) @binding(4) var<uniform> uMix: f32;

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
    let accumulator = textureSample(uAccumulator, uAccumulatorSampler, uv);
    let frame = textureSample(uFrame, uFrameSampler, uv);
    return mix(accumulator, frame, uMix);
}


// #part /wgsl/shaders/renderers/EAM/render

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


// #part /wgsl/shaders/renderers/EAM/reset

const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f  {
    return vec4f(vertices[vertexIndex], 0.0, 1.0);
}

@fragment
fn fragment_main() -> @location(0) vec4f {
    return vec4f(0.0, 0.0, 0.0, 1.0);
}
