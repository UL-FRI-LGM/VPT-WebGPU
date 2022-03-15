// #part /wgsl/shaders/renderers/EAM/generate/vertex

struct VSOut {
    @builtin(position) Position: vec4<f32>;
    @location(0) color: vec3<f32>;
};

struct UBO {
    mvpMat: mat4x4<f32>;
};
@binding(0) @group(0) var<uniform> uniforms: UBO;

@stage(vertex)
fn main(@location(0) inPos: vec3<f32>,
        @location(1) inColor: vec3<f32>) -> VSOut {
    var vsOut: VSOut;
    vsOut.Position = uniforms.mvpMat * vec4<f32>(inPos, 1.0);
    vsOut.color = inColor;
    return vsOut;
}

// #part /wgsl/shaders/renderers/EAM/generate/fragment

@stage(fragment)
fn main(@location(0) inColor: vec3<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(inColor, 1.0);
}

// #part /wgsl/shaders/renderers/EAM/integrate/vertex

#version 300 es

layout(location = 0) in vec2 aPosition;
out vec2 vPosition;

void main() {
    vPosition = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0, 1);
}

// #part /wgsl/shaders/renderers/EAM/integrate/fragment

#version 300 es
precision mediump float;

uniform mediump sampler2D uAccumulator;
uniform mediump sampler2D uFrame;

in vec2 vPosition;
out vec4 oColor;

void main() {
    oColor = texture(uFrame, vPosition);
}

// #part /wgsl/shaders/renderers/EAM/render/vertex

#version 300 es

layout(location = 0) in vec2 aPosition;
out vec2 vPosition;

void main() {
    vPosition = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0, 1);
}

// #part /wgsl/shaders/renderers/EAM/render/fragment

#version 300 es
precision mediump float;

uniform mediump sampler2D uAccumulator;

in vec2 vPosition;
out vec4 oColor;

void main() {
    oColor = texture(uAccumulator, vPosition);
}

// #part /wgsl/shaders/renderers/EAM/reset/vertex

#version 300 es

layout(location = 0) in vec2 aPosition;

void main() {
    gl_Position = vec4(aPosition, 0, 1);
}

// #part /wgsl/shaders/renderers/EAM/reset/fragment

#version 300 es
precision mediump float;

out vec4 oColor;

void main() {
    oColor = vec4(0, 0, 0, 1);
}
