// #part /wgsl/shaders/renderers/ISO/generate/vertex

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) rayFrom: vec3<f32>,
    @location(1) rayTo: vec3<f32>,
    @location(2) pos: vec2<f32>
};

struct UBO {
    mvpInvMat: mat4x4<f32>,
    stepSize: f32,
    offset: f32,
    isovalue: f32
};
@group(0) @binding(0) var<uniform> ubo: UBO;


@stage(vertex)
fn main(@location(0) inPos: vec2<f32>) -> VSOut {
    var vsOut: VSOut;
    vsOut.position = vec4<f32>(inPos, 0.0, 1.0);
    vsOut.pos = inPos * 0.5 + 0.5;

    // TODO: Include unproject
    var nearPosition = vec4<f32>(inPos, -1.0, 1.0);
    var farPosition = vec4<f32>(inPos, 1.0, 1.0);
    var fromDirty: vec4<f32> = ubo.mvpInvMat * nearPosition;
    var toDirty: vec4<f32> = ubo.mvpInvMat * farPosition;
    vsOut.rayFrom = vec3<f32>(fromDirty.x, fromDirty.y, fromDirty.z) / fromDirty.w;
    vsOut.rayTo = vec3<f32>(toDirty.x, toDirty.y, toDirty.z) / toDirty.w;

    return vsOut;
}


// #part /wgsl/shaders/renderers/ISO/generate/fragment

struct UBO {
    mvpInvMat: mat4x4<f32>,
    stepSize: f32,
    offset: f32,
    isovalue: f32
};
@group(0) @binding(0) var<uniform> ubo: UBO;
@group(0) @binding(1) var uSampler: sampler;
@group(0) @binding(2) var uTexture: texture_3d<f32>;

// TODO: Link intersectCube
fn intersectCube(origin: vec3<f32>, direction: vec3<f32>) -> vec2<f32> {
	var tmin: vec3<f32> = (vec3<f32>(0.0) - origin) / direction;
	var tmax: vec3<f32> = (vec3<f32>(1.0) - origin) / direction;

	var t1: vec3<f32> = min(tmin, tmax);
	var t2: vec3<f32> = max(tmin, tmax);

	var tnear: f32 = max(max(t1.x, t1.y), t1.z);
	var tfar: f32 = min(min(t2.x, t2.y), t2.z);

	return vec2<f32>(tnear, tfar);
}

@stage(fragment)
fn main(@location(0) rayFrom: vec3<f32>, @location(1) rayTo: vec3<f32>, @location(2) vPosition: vec2<f32>) -> @location(0) vec4<f32> {
    var rayDirection: vec3<f32> = rayTo - rayFrom;
    var tbounds: vec2<f32> = max(intersectCube(rayFrom, rayDirection), vec2<f32>(0.0));

    if (tbounds.x >= tbounds.y) {
        return vec4<f32>(-1.0);
    }

    var fromVal: vec4<f32> = vec4<f32>(mix(rayFrom, rayTo, tbounds.x), tbounds.x);
    var toVal: vec4<f32> = vec4<f32>(mix(rayFrom, rayTo, tbounds.y), tbounds.y);

    var closest: f32 = -1.0; // textureSample(uClosest, uSampler, vPosition).w
    if (closest > 0.0) {
        tbounds.y = closest;
    }

    var t: f32 = 0.0;
    var offset: f32 = ubo.offset;
    var pos: vec3<f32>;
    var value: f32;
    var found: bool = false;

    for (;t < 1.0;) { // TODO: Use while loop
        pos = mix(fromVal.xyz, toVal.xyz, offset);
        value = textureSample(uTexture, uSampler, pos).r;
        if (value >= ubo.isovalue) {
            tbounds.y = mix(fromVal.w, toVal.w, offset);
            to = vec4<f32>(mix(rayFrom, rayTo, tbounds.y), tbounds.y);
            found = true;
        }
        t += ubo.stepSize;
        offset = fract(offset + ubo.stepSize + ubo.offset);
    }

    if (found) {
        //return to;
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    } else {
        return vec4<f32>(-1.0);
    }
}


// #part /wgsl/shaders/renderers/ISO/integrate/vertex

#version 300 es
precision mediump float;

layout (location = 0) in vec2 aPosition;

out vec2 vPosition;

void main() {
    vPosition = (aPosition + 1.0) * 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}

// #part /wgsl/shaders/renderers/ISO/integrate/fragment

#version 300 es
precision mediump float;

uniform mediump sampler2D uAccumulator;
uniform mediump sampler2D uFrame;

in vec2 vPosition;

out vec4 oClosest;

void main() {
    vec4 frame = texture(uFrame, vPosition);
    vec4 acc = texture(uAccumulator, vPosition);
    if (frame.w > 0.0 && acc.w > 0.0) {
        oClosest = frame.w < acc.w ? frame : acc;
    } else if (frame.w > 0.0) {
        oClosest = frame;
    } else {
        oClosest = acc;
    }
}

// #part /wgsl/shaders/renderers/ISO/render/vertex

#version 300 es
precision mediump float;

layout (location = 0) in vec2 aPosition;

out vec2 vPosition;

void main() {
    vPosition = (aPosition + 1.0) * 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}

// #part /wgsl/shaders/renderers/ISO/render/fragment

#version 300 es
precision mediump float;

uniform mediump sampler2D uClosest;
uniform mediump sampler3D uVolume;
uniform vec3 uLight;
uniform vec3 uDiffuse;

in vec2 vPosition;

out vec4 oColor;

vec3 gradient(vec3 pos, float h) {
    vec3 positive = vec3(
        texture(uVolume, pos + vec3( h, 0.0, 0.0)).r,
        texture(uVolume, pos + vec3(0.0,  h, 0.0)).r,
        texture(uVolume, pos + vec3(0.0, 0.0,  h)).r
    );
    vec3 negative = vec3(
        texture(uVolume, pos + vec3(-h, 0.0, 0.0)).r,
        texture(uVolume, pos + vec3(0.0, -h, 0.0)).r,
        texture(uVolume, pos + vec3(0.0, 0.0, -h)).r
    );
    return normalize(positive - negative);
}

void main() {
    vec4 closest = texture(uClosest, vPosition);

    if (closest.w > 0.0) {
        vec3 normal = normalize(gradient(closest.xyz, 0.005));
        vec3 light = normalize(uLight);
        float lambert = max(dot(normal, light), 0.0);
        oColor = vec4(uDiffuse * lambert, 1.0);
    } else {
        oColor = vec4(1.0);
    }
}

// #part /wgsl/shaders/renderers/ISO/reset/vertex

#version 300 es
precision mediump float;

layout (location = 0) in vec2 aPosition;

void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}

// #part /wgsl/shaders/renderers/ISO/reset/fragment

#version 300 es
precision mediump float;

out vec4 oClosest;

void main() {
    oClosest = vec4(-1);
}
