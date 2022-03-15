// #part /wgsl/shaders/quad/vertex

struct VSOut {
    @builtin(position) Position: vec4<f32>;
    @location(0) fragUV: vec2<f32>;
};

@stage(vertex)
fn main(@location(0) inPos: vec2<f32>) -> VSOut {
    var vsOut: VSOut;
    vsOut.Position = vec4<f32>(inPos, 0.0, 1.0);
    vsOut.fragUV = (inPos + vec2<f32>(1.0, -1.0)) * vec2<f32>(0.5, -0.5);
    return vsOut;
}

// #part /wgsl/shaders/quad/fragment

@group(0) @binding(0) var uSampler: sampler;
@group(0) @binding(1) var uTexture: texture_2d<f32>;

@stage(fragment)
fn main(@location(0) fragUV: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(uTexture, uSampler, fragUV);
    //return vec4<f32>(fragUV.x, fragUV.y, 0.0, 1.0);
}
