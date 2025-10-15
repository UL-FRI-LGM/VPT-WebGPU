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

@group(0) @binding(0) var uVolume: texture_3d<f32>;
@group(0) @binding(1) var uVolumeSampler: sampler;
@group(0) @binding(2) var uTransferFunction: texture_2d<f32>;
@group(0) @binding(3) var uTransferFunctionSampler: sampler;
@group(0) @binding(4) var<uniform> uniforms: Uniforms;

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
    unproject(vertex, uniforms.mvpInverseMatrix, &rayFrom, &rayTo);

    var vertexOut : VertexOut;
    vertexOut.position = vec4f(vertex, 0.0, 1.0);
    vertexOut.rayFrom = rayFrom;
    vertexOut.rayTo = rayTo;
    return vertexOut;
}

#include <intersectCube>

fn sampleVolumeColor(position: vec3f) -> vec4f {

    let volumeSample1: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).rg;
    let volumeSample2: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).ba;

    // print(textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).rgba);

    let volumeSample: vec2f = vec2f(max(volumeSample1.x, volumeSample1.y), min(volumeSample2.x, volumeSample2.y));

    // let volumeSample: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).rg;
    let transferSample: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSample, 0.0);
    return transferSample;
}

@fragment
fn fragment_main(@location(0) rayFrom: vec3f, @location(1) rayTo: vec3f) -> @location(0) vec4f {
    let rayDirection: vec3f = rayTo - rayFrom;
    let tbounds: vec2f = max(intersectCube(rayFrom, rayDirection), vec2f(0.0));

    if (tbounds.x >= tbounds.y) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }
    
    let fromVal: vec3f = mix(rayFrom, rayTo, tbounds.x);
    let toVal: vec3f = mix(rayFrom, rayTo, tbounds.y);

    let rayStepLength: f32 = distance(fromVal, toVal) * uniforms.stepSize;

    var t: f32 = uniforms.stepSize * uniforms.offset;
    var accumulator = vec4f(0.0);

    while (t < 1.0 && accumulator.a < 0.99) {
        let position: vec3f = mix(fromVal, toVal, t);
        var colorSample = sampleVolumeColor(position);
        colorSample.a *= rayStepLength * uniforms.extinction;
        colorSample = vec4f(colorSample.rgb * colorSample.a, colorSample.a);
        accumulator += (1.0 - accumulator.a) * colorSample;
        t += uniforms.stepSize;
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
