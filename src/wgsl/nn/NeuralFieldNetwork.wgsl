// #part /wgsl/shaders/nn/model

override WORKGROUP_SIZE: u32;
override RESOLUTION: u32;
override LEVELS: u32;           // L
override HASH_TABLE_SIZE: u32;  // T
override FEATURE_DIM: u32;      // F
override LAYERS: u32;
override HIDDEN_DIM: u32;
override POS_FIRST_HASH_LEVEL: u32;
override DIR_FIRST_HASH_LEVEL: u32;

const PI: f32 = 3.14159265359;

struct Uniforms {
    background: vec3f,
    samples: u32,
};

// Uniforms
@group(0) @binding(0) var<storage, read> posGridSizes: array<u32>;  // N_l
@group(0) @binding(1) var<storage, read> dirGridSizes: array<u32>;  // N_l
@group(0) @binding(2) var<storage, read> posTableOffsets: array<u32>;
@group(0) @binding(3) var<storage, read> dirTableOffsets: array<u32>;
@group(0) @binding(4) var<uniform> uniforms: Uniforms;

// Position and direction encoding tables (F=4, so each entry is vec4f)
@group(1) @binding(0) var<storage, read> posTables: array<vec4f>;
@group(1) @binding(1) var<storage, read> dirTables: array<vec4f>;

// FC layers weights and biases
@group(1) @binding(2) var<storage, read> fcWeights: array<vec4f>;
@group(1) @binding(3) var<storage, read> fcBiases: array<vec4f>;

// Input and output
struct SamplePoint {
    pos: vec3f,
    dir: vec3f,
    scatter: f32,
};

struct Radiance {
    direct: vec3f,
    directSamples: u32,
    indirect: vec3f,
    indirectSamples: u32,
    frameDirect: vec3f,
    frameDirectSamples: u32,
    frameIndirect: vec3f,
    frameIndirectSamples: u32,
    outOfBounds: u32,
};

@group(2) @binding(0) var<storage, read> samplePoints: array<SamplePoint>;
@group(2) @binding(1) var<storage, read_write> uRadiance: array<Radiance>;

@group(2) @binding(2) var<storage, read_write> embeddingsVec4: array<vec4f>;

fn encodePosition(position: vec3f, baseVecOffset: u32) {
    for (var level = 0u; level < POS_FIRST_HASH_LEVEL; level++) {
        let gridSize = posGridSizes[level];
        let tableOffset = posTableOffsets[level];

        let cornerTLB = floor(position * f32(gridSize));
        let cornerTLF = cornerTLB + vec3f(0, 0, 1);
        let cornerTRB = cornerTLB + vec3f(0, 1, 0);
        let cornerTRF = cornerTLB + vec3f(0, 1, 1);
        let cornerBLB = cornerTLB + vec3f(1, 0, 0);
        let cornerBLF = cornerTLB + vec3f(1, 0, 1);
        let cornerBRB = cornerTLB + vec3f(1, 1, 0);
        let cornerBRF = cornerTLB + vec3f(1, 1, 1);

        let res = f32(gridSize + 1u);
        let indexTLB = u32(cornerTLB.x * res * res + cornerTLB.y * res + cornerTLB.z);
        let indexTLF = u32(cornerTLF.x * res * res + cornerTLF.y * res + cornerTLF.z);
        let indexTRB = u32(cornerTRB.x * res * res + cornerTRB.y * res + cornerTRB.z);
        let indexTRF = u32(cornerTRF.x * res * res + cornerTRF.y * res + cornerTRF.z);
        let indexBLB = u32(cornerBLB.x * res * res + cornerBLB.y * res + cornerBLB.z);
        let indexBLF = u32(cornerBLF.x * res * res + cornerBLF.y * res + cornerBLF.z);
        let indexBRB = u32(cornerBRB.x * res * res + cornerBRB.y * res + cornerBRB.z);
        let indexBRF = u32(cornerBRF.x * res * res + cornerBRF.y * res + cornerBRF.z);

        let w = position * f32(gridSize) - vec3f(cornerTLB);

        let weightTLB = (1 - w.x) * (1 - w.y) * (1 - w.z);  // (0,0,0)
        let weightTLF = (1 - w.x) * (1 - w.y) * w.z;        // (0,0,1)
        let weightTRB = (1 - w.x) * w.y * (1 - w.z);        // (0,1,0)
        let weightTRF = (1 - w.x) * w.y * w.z;              // (0,1,1)
        let weightBLB = w.x * (1 - w.y) * (1 - w.z);        // (1,0,0)
        let weightBLF = w.x * (1 - w.y) * w.z;              // (1,0,1)
        let weightBRB = w.x * w.y * (1 - w.z);              // (1,1,0)
        let weightBRF = w.x * w.y * w.z;                    // (1,1,1)

        let embTLB = posTables[tableOffset + indexTLB];
        let embTLF = posTables[tableOffset + indexTLF];
        let embTRB = posTables[tableOffset + indexTRB];
        let embTRF = posTables[tableOffset + indexTRF];
        let embBLB = posTables[tableOffset + indexBLB];
        let embBLF = posTables[tableOffset + indexBLF];
        let embBRB = posTables[tableOffset + indexBRB];
        let embBRF = posTables[tableOffset + indexBRF];
        let value = embTLB * weightTLB + embTLF * weightTLF + embTRB * weightTRB + embTRF * weightTRF + embBLB * weightBLB + embBLF * weightBLF + embBRB * weightBRB + embBRF * weightBRF;
        embeddingsVec4[baseVecOffset + level] = value;
    }

    for (var level = POS_FIRST_HASH_LEVEL; level < LEVELS; level++) {
        let gridSize = posGridSizes[level];
        let tableOffset = posTableOffsets[level];

        let cornerTLB = floor(position * f32(gridSize));
        let cornerTLF = cornerTLB + vec3f(0, 0, 1);
        let cornerTRB = cornerTLB + vec3f(0, 1, 0);
        let cornerTRF = cornerTLB + vec3f(0, 1, 1);
        let cornerBLB = cornerTLB + vec3f(1, 0, 0);
        let cornerBLF = cornerTLB + vec3f(1, 0, 1);
        let cornerBRB = cornerTLB + vec3f(1, 1, 0);
        let cornerBRF = cornerTLB + vec3f(1, 1, 1);

        let indexTLB = u32(cornerTLB.x + cornerTLB.y * 2654435761 + cornerTLB.z * 805459861) % HASH_TABLE_SIZE;
        let indexTLF = u32(cornerTLF.x + cornerTLF.y * 2654435761 + cornerTLF.z * 805459861) % HASH_TABLE_SIZE;
        let indexTRB = u32(cornerTRB.x + cornerTRB.y * 2654435761 + cornerTRB.z * 805459861) % HASH_TABLE_SIZE;
        let indexTRF = u32(cornerTRF.x + cornerTRF.y * 2654435761 + cornerTRF.z * 805459861) % HASH_TABLE_SIZE;
        let indexBLB = u32(cornerBLB.x + cornerBLB.y * 2654435761 + cornerBLB.z * 805459861) % HASH_TABLE_SIZE;
        let indexBLF = u32(cornerBLF.x + cornerBLF.y * 2654435761 + cornerBLF.z * 805459861) % HASH_TABLE_SIZE;
        let indexBRB = u32(cornerBRB.x + cornerBRB.y * 2654435761 + cornerBRB.z * 805459861) % HASH_TABLE_SIZE;
        let indexBRF = u32(cornerBRF.x + cornerBRF.y * 2654435761 + cornerBRF.z * 805459861) % HASH_TABLE_SIZE;

        let w = position * f32(gridSize) - vec3f(cornerTLB);

        let weightTLB = (1 - w.x) * (1 - w.y) * (1 - w.z);  // (0,0,0)
        let weightTLF = (1 - w.x) * (1 - w.y) * w.z;        // (0,0,1)
        let weightTRB = (1 - w.x) * w.y * (1 - w.z);        // (0,1,0)
        let weightTRF = (1 - w.x) * w.y * w.z;              // (0,1,1)
        let weightBLB = w.x * (1 - w.y) * (1 - w.z);        // (1,0,0)
        let weightBLF = w.x * (1 - w.y) * w.z;              // (1,0,1)
        let weightBRB = w.x * w.y * (1 - w.z);              // (1,1,0)
        let weightBRF = w.x * w.y * w.z;                    // (1,1,1)

        let embTLB = posTables[tableOffset + indexTLB];
        let embTLF = posTables[tableOffset + indexTLF];
        let embTRB = posTables[tableOffset + indexTRB];
        let embTRF = posTables[tableOffset + indexTRF];
        let embBLB = posTables[tableOffset + indexBLB];
        let embBLF = posTables[tableOffset + indexBLF];
        let embBRB = posTables[tableOffset + indexBRB];
        let embBRF = posTables[tableOffset + indexBRF];
        let value = embTLB * weightTLB + embTLF * weightTLF + embTRB * weightTRB + embTRF * weightTRF + embBLB * weightBLB + embBLF * weightBLF + embBRB * weightBRB + embBRF * weightBRF;
        embeddingsVec4[baseVecOffset + level] = value;
    }
}

fn encodeDirection(direction: vec2f, baseVecOffset: u32) {
    for (var level = 0u; level < DIR_FIRST_HASH_LEVEL; level++) {
        let gridSize = dirGridSizes[level];
        let tableOffset = dirTableOffsets[level];

        let cornerTL = floor(direction * f32(gridSize));
        let cornerTR = cornerTL + vec2f(0, 1);
        let cornerBL = cornerTL + vec2f(1, 0);
        let cornerBR = cornerTL + vec2f(1, 1);

        let res = f32(gridSize + 1u);
        let indexTL = u32(cornerTL.x * res + cornerTL.y);
        let indexTR = u32(cornerTR.x * res + cornerTR.y);
        let indexBL = u32(cornerBL.x * res + cornerBL.y);
        let indexBR = u32(cornerBR.x * res + cornerBR.y);

        let w = direction * f32(gridSize) - vec2f(cornerTL);

        let weightTL = (1 - w.x) * (1 - w.y);  // (0,0)
        let weightTR = (1 - w.x) * w.y;        // (0,1)
        let weightBL = w.x * (1 - w.y);        // (1,0)
        let weightBR = w.x * w.y;              // (1,1)

        let embTL = dirTables[tableOffset + indexTL];
        let embTR = dirTables[tableOffset + indexTR];
        let embBL = dirTables[tableOffset + indexBL];
        let embBR = dirTables[tableOffset + indexBR];
        let value = embTL * weightTL + embTR * weightTR + embBL * weightBL + embBR * weightBR;
        embeddingsVec4[baseVecOffset + LEVELS + level] = value;
    }

    for (var level = DIR_FIRST_HASH_LEVEL; level < LEVELS; level++) {
        let gridSize = dirGridSizes[level];
        let tableOffset = dirTableOffsets[level];

        let cornerTL = floor(direction * f32(gridSize));
        let cornerTR = cornerTL + vec2f(0, 1);
        let cornerBL = cornerTL + vec2f(1, 0);
        let cornerBR = cornerTL + vec2f(1, 1);

        let indexTL = u32(cornerTL.x + cornerTL.y * 2654435761) % HASH_TABLE_SIZE;
        let indexTR = u32(cornerTR.x + cornerTR.y * 2654435761) % HASH_TABLE_SIZE;
        let indexBL = u32(cornerBL.x + cornerBL.y * 2654435761) % HASH_TABLE_SIZE;
        let indexBR = u32(cornerBR.x + cornerBR.y * 2654435761) % HASH_TABLE_SIZE;

        let w = direction * f32(gridSize) - vec2f(cornerTL);

        let weightTL = (1 - w.x) * (1 - w.y);  // (0,0)
        let weightTR = (1 - w.x) * w.y;        // (0,1)
        let weightBL = w.x * (1 - w.y);        // (1,0)
        let weightBR = w.x * w.y;              // (1,1)

        let embTL = dirTables[tableOffset + indexTL];
        let embTR = dirTables[tableOffset + indexTR];
        let embBL = dirTables[tableOffset + indexBL];
        let embBR = dirTables[tableOffset + indexBR];
        let value = embTL * weightTL + embTR * weightTR + embBL * weightBL + embBR * weightBR;
        embeddingsVec4[baseVecOffset + LEVELS + level] = value;
    }
}

fn multiLayerPerceptron(baseVecOffset: u32) -> vec3f {
    var intermediateEven: array<vec4f, 4>;
    var intermediateOdd: array<vec4f, 4>;

    let inputSize = LEVELS * FEATURE_DIM * 2 / 4;
    let hiddenSize = HIDDEN_DIM / 4;
    let vecSize = 4u;

    var weightOffset = 0u;
    var biasOffset = 0u;

    for (var i = 0u; i < hiddenSize; i++) {
        var a = vec4f(0);
        for (var k = 0u; k < vecSize; k++) {
            for (var j = 0u; j < inputSize; j++) {
                let w = fcWeights[(i * vecSize + k) * inputSize + j];
                a[k] = a[k] + dot(embeddingsVec4[baseVecOffset + j], w,);
            }
        }
        intermediateEven[i] = max(a + fcBiases[i], vec4f(0));
    }
    weightOffset = weightOffset + inputSize * HIDDEN_DIM;
    biasOffset = biasOffset + hiddenSize;

    var in = intermediateEven;
    var out = intermediateOdd;
    var tmp = in;

    for (var layer = 0u; layer < LAYERS - 2; layer++) {
        for (var i = 0u; i < hiddenSize; i++) {
            var a = vec4f(0);
            for (var k = 0u; k < vecSize; k++) {
                for (var j = 0u; j < hiddenSize; j++) {
                    let w = fcWeights[weightOffset + (i * vecSize + k) * hiddenSize + j];
                    a[k] = a[k] + dot(in[j], w);
                }
            }
            out[i] = max(a + fcBiases[biasOffset + i], vec4f(0));
        }
        weightOffset = weightOffset + hiddenSize * HIDDEN_DIM;
        biasOffset = biasOffset + hiddenSize;

        tmp = in;
        in = out;
        out = tmp;
    }

    var color: vec3f;
    for (var i = 0u; i < 3; i++) {
        var a = 0.0;
        for (var j = 0u; j < hiddenSize; j++) {
            let w = fcWeights[weightOffset + i * hiddenSize + j];
            a = a + dot(in[j], w);
        }
        let value = min(max(a + fcBiases[biasOffset + i / 4][i], 0), 1);
        color[i] = value;
    }

    return color;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn forward(
    @builtin(global_invocation_id) globalId: vec3u,
    @builtin(local_invocation_index) localIndex: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>
) {
    var pixelIndex = globalId.x;
    let pixels = RESOLUTION * RESOLUTION;
    if pixelIndex >= pixels {
        return;
    }

    var totalRadiance = vec3f(0);
    var validSamples = 0u;

    for (var s = 0u; s < uniforms.samples; s++) {
        let sp = samplePoints[pixelIndex * uniforms.samples + s];

        if all(sp.pos == vec3f(2, 2, 2)) {
            totalRadiance += uniforms.background;
            validSamples++;
        } else if any(sp.pos != vec3f(0)) {
            let embeddingVecSize = LEVELS * FEATURE_DIM * 2 / 4;
            let baseVecOffset = pixelIndex * embeddingVecSize;

            let dir = sp.dir;
            let azimuth = sign(dir.y) * acos(dir.x
                / sqrt(pow(dir.x, 2) + pow(dir.y, 2)));
            let elevation = acos(dir.z);
            let dirSpherical = vec2f(
                (azimuth + PI) / (2.01 * PI),
                elevation / PI,
            );

            encodePosition(sp.pos, baseVecOffset);
            encodeDirection(dirSpherical, baseVecOffset);
            let indirect = multiLayerPerceptron(baseVecOffset);

            totalRadiance += sp.scatter * indirect;
            validSamples++;
        }
    }

    if validSamples > 0 {
        var stored = uRadiance[pixelIndex];
        stored.frameIndirect = totalRadiance / f32(validSamples);
        stored.frameIndirectSamples = validSamples;
        uRadiance[pixelIndex] = stored;
    }
}
