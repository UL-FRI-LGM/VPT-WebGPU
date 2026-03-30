// #part /wgsl/shaders/renderers/EAM/generate

diagnostic(off, derivative_uniformity);

const SQRT3: f32 = 1.73205080757;

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

struct CutPlane {
    uMinCutPlane: vec3f,
    uMaxCutPlane: vec3f,
    uViewCutDistance: f32
};

// @group(0) @binding(0) var uVolume0: texture_3d<f32>;
// @group(0) @binding(1) var uVolumeSampler0: sampler;
// @group(1) @binding(0) var uVolume1: texture_3d<f32>;
// @group(1) @binding(1) var uVolumeSampler1: sampler;
// @group(0) @binding(2) var uTransferFunction1: texture_2d<f32>;
// @group(0) @binding(3) var uTransferFunctionSampler1: sampler;

// @group(0) @binding(10) var<uniform> uniforms0: Uniforms;
// @group(1) @binding(10) var<uniform> uniforms1: Uniforms;
// @group(2) @binding(0) var<uniform> visMode: u32;
// // popravi variable da bojo predstavljali drugi volumen!!
// @group(1) @binding(2) var uTransferFunction5: texture_2d<f32>;
// @group(1) @binding(3) var uTransferFunctionSampler5: sampler;
// @group(1) @binding(4) var uTransferFunction6: texture_2d<f32>;
// @group(1) @binding(5) var uTransferFunctionSampler6: sampler;
// @group(1) @binding(6) var uTransferFunction7: texture_2d<f32>;
// @group(1) @binding(7) var uTransferFunctionSampler7: sampler;
// @group(1) @binding(8) var uTransferFunction8: texture_2d<f32>;
// @group(1) @binding(9) var uTransferFunctionSampler8: sampler;



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
@group(0) @binding(14) var<uniform> uniforms0: Uniforms;
@group(0) @binding(15) var<uniform> uniforms1: Uniforms;
@group(1) @binding(0) var<uniform> visMode: u32;
@group(1) @binding(1) var<uniform> cutPlane: CutPlane;
// @group(1) @binding(1) var<uniform> minCutPlane: vec3f;
// @group(1) @binding(2) var<uniform> maxCutPlane: vec3f;
// @group(1) @binding(3) var<uniform> viewCutDistance: f32;


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

fn sampleVolumeColor(position: vec3f) -> vec4f {
    let dimensions = vec3f(textureDimensions(uVolume1));
    var transferSample = vec4f(0, 0, 0, 0);
    if (visMode == 0u) {
        // clustering shader
        let orig = textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0);
        let coords = vec3i(position * dimensions);
        let xy = textureLoad(uVolume1, coords, 0).rg;
        let color = textureSampleLevel(uTransferFunction1, uTransferFunctionSampler1, xy, 0.0);
        let sumOrig = clamp((orig.r + orig.g + orig.b + orig.a), 0.0, 1.0);
        transferSample = vec4f(color.rgb, sumOrig * color.a);
        // if (all(transferSample == vec4f(0.0, 0.0, 0.0, 0.0))) {
        //     transferSample = vec4f(1,0,0,1);
        // }

        // let volumeSamples = array<f32, 4>(
        //     textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).r,
        //     textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).g,
        //     textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).b,
        //     textureSampleLevel(uVolume0, uVolumeSampler0, position, 0.0).a
        // );

        // let tfSamples = array<vec4f, 4>(
        //     textureSampleLevel(uTransferFunction1D_1, uTransferFunctionSampler1D_1, vec2f(volumeSamples[0], 0.5), 0.0),
        //     textureSampleLevel(uTransferFunction1D_2, uTransferFunctionSampler1D_2, vec2f(volumeSamples[1], 0.5), 0.0),
        //     textureSampleLevel(uTransferFunction1D_3, uTransferFunctionSampler1D_3, vec2f(volumeSamples[2], 0.5), 0.0),
        //     textureSampleLevel(uTransferFunction1D_4, uTransferFunctionSampler1D_4, vec2f(volumeSamples[3], 0.5), 0.0)
        // );

        // var sumAlpha: f32 = 0.0;
        // var sumColor: vec3f = vec3f(0.0);
        // var activeCount: f32 = 0.0;

        // for (var i: i32 = 0; i < 4; i++) {
        //     if (volumeSamples[i] > 0.0) {
        //         sumColor += tfSamples[i].rgb * tfSamples[i].a;
        //         sumAlpha += tfSamples[i].a;
        //         activeCount += 1.0;
        //     }
        // }

        // if (activeCount <= 0.0) {
        //     transferSample = vec4f(0.0, 0.0, 0.0, 0.0);
        // } else {
        //     let finalAlpha = sumAlpha / activeCount;
        //     let finalColor = select(vec3f(0.0), sumColor / sumAlpha, sumAlpha > 0.0);
        //     transferSample = vec4f(finalColor, finalAlpha);
        // }
        // transferSample = vec4f(1.0, 0.0, 0.0, 1.0);
    }
    else if (visMode == 1u) {
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
    let tbounds: vec2f = max(cutIntersectCube(rayFrom, rayDirection, cutPlane.uMinCutPlane, cutPlane.uMaxCutPlane), vec2f(0.0));

    if (tbounds.x >= tbounds.y) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }
    
    let fromVal: vec3f = mix(rayFrom, rayTo, (tbounds.x + cutPlane.uViewCutDistance * SQRT3));
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
