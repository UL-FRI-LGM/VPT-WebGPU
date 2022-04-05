// #part /wgsl/shaders/renderers/EAM/generate/vertex

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) rayFrom: vec3<f32>,
    @location(1) rayTo: vec3<f32>
};

struct UBO {
    mvpInvMat: mat4x4<f32>
};
@binding(0) @group(0) var<uniform> uniforms: UBO;


@stage(vertex)
fn main(@location(0) inPos: vec2<f32>) -> VSOut {
    var vsOut: VSOut;
    vsOut.position = vec4<f32>(inPos, 0.0, 1.0);

    // TODO: Include unproject
    var nearPosition = vec4<f32>(inPos, -1.0, 1.0);
    var farPosition = vec4<f32>(inPos, 1.0, 1.0);
    var fromDirty: vec4<f32> = uniforms.mvpInvMat * nearPosition;
    var toDirty: vec4<f32> = uniforms.mvpInvMat * farPosition;
    vsOut.rayFrom = vec3<f32>(fromDirty.x, fromDirty.y, fromDirty.z) / fromDirty.w;
    vsOut.rayTo = vec3<f32>(toDirty.x, toDirty.y, toDirty.z) / toDirty.w;

    return vsOut;
}

// #part /wgsl/shaders/renderers/EAM/generate/fragment

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
fn main(@location(0) rayFrom: vec3<f32>, @location(1) rayTo: vec3<f32>) -> @location(0) vec4<f32> {
    


    var rayDirection: vec3<f32> = rayTo - rayFrom;
    var tbounds: vec2<f32> = max(intersectCube(rayFrom, rayDirection), vec2<f32>(0.0));

    if (tbounds.x >= tbounds.y) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }



    return vec4<f32>(0.25, 0.5, 0.75, 1.0);



    // vec3 rayDirection = vRayTo - vRayFrom;
    // vec2 tbounds = max(intersectCube(vRayFrom, rayDirection), 0.0);
    // if (tbounds.x >= tbounds.y) {
    //     oColor = vec4(0, 0, 0, 1);
    // } else {
    //     vec3 from = mix(vRayFrom, vRayTo, tbounds.x);
    //     vec3 to = mix(vRayFrom, vRayTo, tbounds.y);
    //     float rayStepLength = distance(from, to) * uStepSize;

    //     float t = 0.0;
    //     vec4 accumulator = vec4(0);

    //     while (t < 1.0 && accumulator.a < 0.99) {
    //         vec3 position = mix(from, to, t);
    //         vec4 colorSample = sampleVolumeColor(position);
    //         colorSample.a *= rayStepLength * uExtinction;
    //         colorSample.rgb *= colorSample.a;
    //         accumulator += (1.0 - accumulator.a) * colorSample;
    //         t += uStepSize;
    //     }

    //     if (accumulator.a > 1.0) {
    //         accumulator.rgb /= accumulator.a;
    //     }

    //     oColor = vec4(accumulator.rgb, 1);
    // }


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
