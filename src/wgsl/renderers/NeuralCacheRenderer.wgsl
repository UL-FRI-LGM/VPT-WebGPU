// #part /wgsl/shaders/renderers/NeuralCache/common

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
    bounces: u32,
    steps: u32,
    mode: u32,
    background: vec3f,
    filterSigma: f32,
    filterKSigma: f32,
    filterThreshold: f32,
};

struct Radiance {
    direct: vec3f,
    directSamples: u32,
    indirect: vec3f,
    indirectSamples: u32,
    outOfBounds: u32,
};

fn getDisplayColor(radiance: Radiance) -> vec3f {
    switch uniforms.mode {
        case 0, default: {
            let total = radiance.directSamples + radiance.indirectSamples;
            let samples = f32(total);
            return f32(radiance.directSamples) / samples * radiance.direct
                + f32(radiance.indirectSamples) / samples * radiance.indirect;
        }
        case 1: {
            return radiance.direct;
        }
        case 2: {
            return radiance.indirect;
        }
    }
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> uRadiance: array<Radiance>;
@group(0) @binding(2) var uImage: texture_storage_2d<rgba16float, write>;

@group(0) @binding(9) var<storage, read_write> uGroundTruth: array<f32>;

// #part /wgsl/shaders/renderers/NeuralCache/reset

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn reset(@builtin(global_invocation_id) globalId: vec3u) {
    let res = vec2u(uniforms.resolution);

    if (globalId.x >= res.x || globalId.y >= res.y) {
        return;
    }

    let globalIndex: u32 = globalId.x + globalId.y * res.x;
    if (globalIndex >= arrayLength(&uRadiance)) {
        return;
    }

    let radiance = Radiance(uniforms.background, 0, vec3f(0), 0, 0);
    uRadiance[globalIndex] = radiance;
    textureStore(uImage, globalId.xy, vec4f(uniforms.background, 1.0));
}

// #part /wgsl/shaders/renderers/NeuralCache/render

struct Ray {
    position: vec3f,
    bounces: u32,
    direction: vec3f,
    transmittance: vec3f,
    firstBouncePos: vec3f,
    firstBounceDir: vec3f,
};

struct IndirectRadiance {
    position: vec3f,
    azimuth: f32,
    elevation: f32,
    value: vec3f,
};

struct SamplePoint {
    pos: vec3f,
    dir: vec2f,
};

@group(0) @binding(3) var uVolume: texture_3d<f32>;
@group(0) @binding(4) var uVolumeSampler: sampler;
@group(0) @binding(5) var uTransferFunction: texture_2d<f32>;
@group(0) @binding(6) var uTransferFunctionSampler: sampler;
@group(0) @binding(7) var uEnvironment: texture_2d<f32>;
@group(0) @binding(8) var uEnvironmentSampler: sampler;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn render(@builtin(global_invocation_id) globalId: vec3u) {
    let res = vec2u(uniforms.resolution);

    if (globalId.x >= res.x || globalId.y >= res.y) {
        return;
    }

    let globalIndex: u32 = globalId.x + globalId.y * res.x;
    if (globalIndex >= arrayLength(&uRadiance)) {
        return;
    }

    let screenPosition: vec2f = computeScreenPosition(globalId.xy);
    var state: u32 = hash3(vec3u(globalId.x, globalId.y, uniforms.randSeed));
    var acc = Radiance(uniforms.background, 0, vec3f(0), 0, 1);

    var saved = false;
    var indirectRadiance = IndirectRadiance(vec3f(0), 0, 0, vec3f(0));
    var outOfBoundsRays = 0u;

    for (var sample: u32 = 0; sample < uniforms.samples; sample++) {
        // Path trace with fresh ray and add radiance to accumulator
        var ray = createRay(screenPosition, &state);

        for (var step: u32 = 0; step < uniforms.steps; step++) {
            let dist: f32 = randomExponential(&state, uniforms.extinction);
            ray.position += dist * ray.direction;

            let volumeSample: vec4f = sampleVolumeColor(ray.position);

            let PNull = 1.0 - volumeSample.a;
            let PScattering = select(
                // false, true, condition
                0, volumeSample.a * max3(volumeSample.rgb),
                ray.bounces < uniforms.bounces
            );
            let PAbsorption = 1.0 - PNull - PScattering;

            let fortuneWheel: f32 = randomUniform(&state);
            if (any(ray.position > vec3f(1.0)) || any(ray.position < vec3f(0.0))) {
                // Out of bounds
                let envSample: vec4f = sampleEnvironmentMap(ray.direction);
                let radiance: vec3f = ray.transmittance * envSample.rgb;

                if (ray.bounces == 0) {
                    let radiance = uniforms.background;
                    acc.directSamples++;
                    acc.direct += (radiance - acc.direct) / f32(acc.directSamples);
                    acc.indirectSamples++;
                    acc.indirect += (radiance - acc.indirect) / f32(acc.indirectSamples);
                    outOfBoundsRays++;
                } else if (ray.bounces == 1) {
                    acc.directSamples++;
                    acc.direct += (radiance - acc.direct) / f32(acc.directSamples);
                } else {
                    acc.indirectSamples++;
                    acc.indirect += (radiance - acc.indirect) / f32(acc.indirectSamples);

                    if (!saved && outOfBoundsRays == 0) {
                        saved = true;
                        indirectRadiance = getIndirectRadiance(ray, radiance);
                        acc.outOfBounds = 0;
                    }
                }

                break;
            } else if (fortuneWheel < PAbsorption) {
                // Absorption
                let radiance: vec3f = vec3f(0.0);

                if (ray.bounces == 1) {
                    acc.directSamples++;
                    acc.direct += (radiance - acc.direct) / f32(acc.directSamples);
                } else if (ray.bounces > 1) {
                    acc.indirectSamples++;
                    acc.indirect += (radiance - acc.indirect) / f32(acc.indirectSamples);

                    if (!saved && outOfBoundsRays == 0) {
                        saved = true;
                        indirectRadiance = getIndirectRadiance(ray, radiance);
                        acc.outOfBounds = 0;
                    }
                }

                break;
            } else if (fortuneWheel < PAbsorption + PScattering) {
                // Scattering
                ray.transmittance *= volumeSample.rgb;
                ray.direction = sampleHenyeyGreenstein(&state, uniforms.anisotropy, ray.direction);
                ray.bounces++;

                if (ray.bounces == 1) {
                    ray.firstBouncePos = ray.position;
                    ray.firstBounceDir = ray.direction;
                }
            }
        }
    }

    // Add this frame radiance to the overall accumulator
    var stored = uRadiance[globalIndex];
    if (acc.directSamples > 0) {
        stored.directSamples += acc.directSamples;
        stored.direct += (acc.direct - stored.direct)
            * f32(acc.directSamples)
            / f32(stored.directSamples);
    }
    if (acc.indirectSamples > 0) {
        stored.indirectSamples += acc.indirectSamples;
        stored.indirect += (acc.indirect - stored.indirect)
            * f32(acc.indirectSamples)
            / f32(stored.indirectSamples);
    }
    // Mark OOB state as it was when storing indirect radiance because we
    // want the same behavior in the bilateral filter
    stored.outOfBounds = acc.outOfBounds;
    uRadiance[globalIndex] = stored;

    let baseIndex = globalIndex * 8;
    uGroundTruth[baseIndex + 0] = indirectRadiance.position.x;
    uGroundTruth[baseIndex + 1] = indirectRadiance.position.y;
    uGroundTruth[baseIndex + 2] = indirectRadiance.position.z;
    uGroundTruth[baseIndex + 3] = indirectRadiance.azimuth;
    uGroundTruth[baseIndex + 4] = indirectRadiance.elevation;
    uGroundTruth[baseIndex + 5] = indirectRadiance.value.x;
    uGroundTruth[baseIndex + 6] = indirectRadiance.value.y;
    uGroundTruth[baseIndex + 7] = indirectRadiance.value.z;

    let c = getDisplayColor(stored);
    textureStore(uImage, globalId.xy, vec4f(c, 1.0));
}

fn getIndirectRadiance(ray: Ray, radiance: vec3f) -> IndirectRadiance {
    let azimuth = sign(ray.firstBounceDir.y) * acos(ray.firstBounceDir.x
        / sqrt(pow(ray.firstBounceDir.x, 2) + pow(ray.firstBounceDir.y, 2)));
    let elevation = acos(ray.firstBounceDir.z);

    return IndirectRadiance(
        ray.firstBouncePos,
        azimuth,
        elevation,
        radiance,
    );
}

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

fn randomUniform(state: ptr<function, u32>) -> f32 {
    *state = hash(*state);
    return f32(*state) / f32(~0u);
}

fn randomSquare(state: ptr<function, u32>) -> vec2f {
    let x: f32 = randomUniform(state);
    let y: f32 = randomUniform(state);
    return vec2f(x, y);
}

fn randomDisk(state: ptr<function, u32>) -> vec2f {
    let radius: f32 = sqrt(randomUniform(state));
    let angle: f32 = TWOPI * randomUniform(state);
    return radius * vec2f(cos(angle), sin(angle));
}

fn randomSphere(state: ptr<function, u32>) -> vec3f {
    let disk: vec2f = randomDisk(state);
    let norm: f32 = dot(disk, disk);
    let radius: f32 = 2.0 * sqrt(1.0 - norm);
    let z: f32 = 1.0 - 2.0 * norm;
    return vec3f(radius * disk, z);
}

fn randomExponential(state: ptr<function, u32>, rate: f32) -> f32 {
    return -log(randomUniform(state)) / rate;
}

fn sampleHenyeyGreensteinAngleCosine(state: ptr<function, u32>, g: f32) -> f32 {
    let g2: f32 = g * g;
    let c: f32 = (1.0 - g2) / (1.0 - g + 2.0 * g * randomUniform(state));
    return (1.0 + g2 - c * c) / (2.0 * g);
}

fn sampleHenyeyGreenstein(state: ptr<function, u32>, g: f32, direction: vec3f) -> vec3f {
    let u: vec3f = randomSphere(state);
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
    let offset: vec2f = randomDisk(state) * blur;
    let nearPosition: vec4f = vec4f(screenPosition + offset, -1.0, 1.0);
    let antialiasing: vec2f = (randomSquare(state) * 2.0 - 1.0) * inverseResolution;
    let farPosition: vec4f = vec4f(screenPosition + antialiasing, 1.0, 1.0);
    let fromDirty: vec4f = inverseMvp * nearPosition;
    let toDirty: vec4f = inverseMvp * farPosition;
    *outFrom = fromDirty.xyz / fromDirty.w;
    *outTo = toDirty.xyz / toDirty.w;
}

// Compute normalized device coordinates (NDC) from pixel position
// Maps pixel coordinates to range [-1, 1] with Y-axis flipped (OpenGL convention)
//
// Transformation steps:
// 1. Add 0.5 to sample pixel center
// 2. Multiply by inverseResolution to get [0, 1] range
// 3. Subtract 0.5 to center at origin
// 4. Multiply by (2, -2) to get [-1, 1] range with Y flipped
fn computeScreenPosition(pixel: vec2u) -> vec2f {
    return ((vec2f(pixel) + 0.5) * uniforms.inverseResolution - 0.5) * vec2f(2.0, -2.0);
}

fn sampleEnvironmentMap(d: vec3f) -> vec4f {
    let texCoord: vec2f = vec2f(atan2(d.x, -d.z), asin(-d.y) * 2.0) * INVPI * 0.5 + 0.5;
    return textureSampleLevel(uEnvironment, uEnvironmentSampler, texCoord, 0.0);
}

fn sampleVolumeColor(position: vec3f) -> vec4f {
    let volumeSample: vec2f = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).rg;
    let transferSample: vec4f = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, volumeSample, 0.0);
    return transferSample;
}

// Create and initialize a new stochastic ray for the given screen pixel
fn createRay(screenPosition: vec2f, state: ptr<function, u32>) -> Ray {
    let mvp = uniforms.mvpInverseMatrix;
    let invRes = uniforms.inverseResolution;
    let blur = uniforms.blur;
    var fromPos: vec3f;
    var toPos: vec3f;
    unprojectRand(state, screenPosition, mvp, invRes, blur, &fromPos, &toPos);

    var ray: Ray;
    ray.direction = normalize(toPos - fromPos);
    var tbounds: vec2f = max(intersectCube(fromPos, ray.direction), vec2f(0.0));
    ray.position = fromPos + tbounds.x * ray.direction;
    ray.bounces = 0u;
    ray.transmittance = vec3f(1.0);

    return ray;
}

// #part /wgsl/shaders/renderers/NeuralCache/neuralRender

@group(0) @binding(10) var<storage, read_write> uSamplePoints: array<SamplePoint>;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn neuralRender(@builtin(global_invocation_id) globalId: vec3u) {
    let res = vec2u(uniforms.resolution);

    if (globalId.x >= res.x || globalId.y >= res.y) {
        return;
    }

    let globalIndex: u32 = globalId.x + globalId.y * res.x;
    if (globalIndex >= arrayLength(&uRadiance)) {
        return;
    }

    let screenPosition: vec2f = computeScreenPosition(globalId.xy);
    var state: u32 = hash3(vec3u(globalId.x, globalId.y, uniforms.randSeed));
    var acc = Radiance(uniforms.background, 0, uniforms.background, 0, 1);

    var indirectSample = IndirectRadiance(vec3f(0), 0, 0, vec3f(0));

    for (var sample: u32 = 0; sample < uniforms.samples; sample++) {
        var ray = createRay(screenPosition, &state);

        for (var step: u32 = 0; step < uniforms.steps; step++) {
            let dist: f32 = randomExponential(&state, uniforms.extinction);
            ray.position += dist * ray.direction;

            let volumeSample: vec4f = sampleVolumeColor(ray.position);

            let PNull = 1.0 - volumeSample.a;
            let PScattering = select(
                0, volumeSample.a * max3(volumeSample.rgb),
                ray.bounces < 1u
            );
            let PAbsorption = 1.0 - PNull - PScattering;

            let fortuneWheel: f32 = randomUniform(&state);
            if (any(ray.position > vec3f(1.0)) || any(ray.position < vec3f(0.0))) {
                let envSample: vec4f = sampleEnvironmentMap(ray.direction);
                let radiance: vec3f = ray.transmittance * envSample.rgb;

                if (ray.bounces == 0) {
                    acc.directSamples++;
                    acc.direct += (radiance - acc.direct) / f32(acc.directSamples);
                } else if (ray.bounces == 1) {
                    acc.directSamples++;
                    acc.direct += (radiance - acc.direct) / f32(acc.directSamples);
                }

                break;
            } else if (fortuneWheel < PAbsorption) {
                let radiance: vec3f = vec3f(0.0);

                if (ray.bounces == 1) {
                    acc.directSamples++;
                    acc.direct += (radiance - acc.direct) / f32(acc.directSamples);
                }

                break;
            } else if (fortuneWheel < PAbsorption + PScattering) {
                ray.transmittance *= volumeSample.rgb;
                ray.direction = sampleHenyeyGreenstein(&state, uniforms.anisotropy, ray.direction);
                ray.bounces++;

                if (ray.bounces == 1) {
                    ray.firstBouncePos = ray.position;
                    ray.firstBounceDir = ray.direction;

                    if (sample == 0) {
                        indirectSample = getIndirectRadiance(ray, vec3f(0.0));
                    }
                }
            }
        }
    }

    var stored = uRadiance[globalIndex];
    if (acc.directSamples > 0) {
        stored.directSamples += acc.directSamples;
        stored.direct += (acc.direct - stored.direct)
            * f32(acc.directSamples)
            / f32(stored.directSamples);
    }
    stored.outOfBounds = acc.outOfBounds;
    // uRadiance[globalIndex] = stored;

    uSamplePoints[globalIndex] = SamplePoint(
        indirectSample.position,
        vec2f(
            (indirectSample.azimuth + PI) / (2.01 * PI),
            indirectSample.elevation / PI
        )
    );
}

// #part /wgsl/shaders/renderers/NeuralCache/filter

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn bilateralFilter(@builtin(global_invocation_id) globalId: vec3u) {
    let res = vec2u(uniforms.resolution);

    if (globalId.x >= res.x || globalId.y >= res.y) {
        return;
    }

    let globalIndex = globalId.x + globalId.y * res.x;
    let center = uRadiance[globalIndex];
    if center.outOfBounds == 1 {
        return;
    }
    let centerColor = getDisplayColor(center);

    let sigma = uniforms.filterSigma;
    let kSigma = uniforms.filterKSigma;
    let threshold = uniforms.filterThreshold;
    let radius = i32(kSigma * sigma);
    let sigma2 = 2.0 * sigma * sigma;
    let threshold2 = 2.0 * threshold * threshold;

    var sumColor = vec3f(0.0);
    var sumIndirect = vec3f(0.0);
    var sumWeight = 0.0;

    for (var dy: i32 = -radius; dy <= radius; dy++) {
        for (var dx: i32 = -radius; dx <= radius; dx++) {
            let nx = clamp(i32(globalId.x) + dx, 0, i32(res.x) - 1);
            let ny = clamp(i32(globalId.y) + dy, 0, i32(res.y) - 1);
            let nIndex = u32(nx) + u32(ny) * res.x;

            let neighbor = uRadiance[nIndex];
            if neighbor.outOfBounds == 1 || neighbor.directSamples == 0 || neighbor.indirectSamples == 0 {
                continue;
            }
            let neighborColor = getDisplayColor(neighbor);

            let spatialDist = f32(dx * dx + dy * dy);
            let spatialWeight = exp(-spatialDist / sigma2);

            let colorDiff = neighborColor - centerColor;
            let rangeWeight = exp(-dot(colorDiff, colorDiff) / threshold2);

            let weight = spatialWeight * rangeWeight;
            sumColor += weight * neighborColor;
            sumIndirect += weight * neighbor.indirect;
            sumWeight += weight;
        }
    }

    if (sumWeight > 0.0) {
        textureStore(uImage, globalId.xy, vec4f(sumColor / sumWeight, 1.0));

        let baseIndex = globalIndex * 8u;
        let filteredIndirect = sumIndirect / sumWeight;
        uGroundTruth[baseIndex + 5u] = filteredIndirect.x;
        uGroundTruth[baseIndex + 6u] = filteredIndirect.y;
        uGroundTruth[baseIndex + 7u] = filteredIndirect.z;
    }
}
