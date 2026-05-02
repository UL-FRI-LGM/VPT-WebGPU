"use strict";

export class RadianceFieldNetwork {
    constructor({
        device,
        modelArgs,
        resolution,
        shader,
    }) {
        this.device = device;
        this.modelArgs = modelArgs;
        this.resolution = resolution;

        this._initializeUniforms();
        this._initializeModelBuffers();
        this._initializeForwardPassBuffers();
        this._createPrograms(shader);
    }

    _getWorkgroupCount() {
        return [
            Math.ceil(
                (this.resolution * this.resolution) /
                    this.constants["WORKGROUP_SIZE"],
            ),
        ];
    }

    _initializeUniforms() {
        const L = this.modelArgs["levels"];
        const T = 2 ** this.modelArgs["hash_table_size"];
        const F = this.modelArgs["feature_dim"];

        const posGridSizesArray = createGridSizes(
            this.modelArgs["pos_coarse_res"],
            this.modelArgs["pos_fine_res"],
            L,
        );
        const dirGridSizesArray = createGridSizes(
            this.modelArgs["dir_coarse_res"],
            this.modelArgs["dir_fine_res"],
            L,
        );

        this.constants = {
            WORKGROUP_SIZE: 8,
            RESOLUTION: this.resolution,
            LEVELS: L,
            HASH_TABLE_SIZE: T,
            FEATURE_DIM: F,
            LAYERS: this.modelArgs["layers"],
            HIDDEN_DIM: this.modelArgs["hidden_dim"],
            POS_FIRST_HASH_LEVEL: findFirstHashLevel(posGridSizesArray, T, 3),
            DIR_FIRST_HASH_LEVEL: findFirstHashLevel(dirGridSizesArray, T, 2),
        };

        this.posGridSizes = this.device.createBuffer({
            label: "radiance field network position grid sizes",
            size: L * 4,
            usage:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.UNIFORM |
                GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.posGridSizes, 0, posGridSizesArray);

        this.dirGridSizes = this.device.createBuffer({
            label: "radiance field network direction grid sizes",
            size: L * 4,
            usage:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.UNIFORM |
                GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.dirGridSizes, 0, dirGridSizesArray);

        const posTableOffsetsArray = createTableOffsets(
            posGridSizesArray,
            T,
            this.constants["POS_FIRST_HASH_LEVEL"],
            3,
        );
        const dirTableOffsetsArray = createTableOffsets(
            dirGridSizesArray,
            T,
            this.constants["DIR_FIRST_HASH_LEVEL"],
            2,
        );

        this.posTableOffsets = this.device.createBuffer({
            label: "radiance field network position table offsets",
            size: L * 4,
            usage:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.UNIFORM |
                GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
            this.posTableOffsets,
            0,
            posTableOffsetsArray,
        );

        this.dirTableOffsets = this.device.createBuffer({
            label: "radiance field network direction table offsets",
            size: L * 4,
            usage:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.UNIFORM |
                GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
            this.dirTableOffsets,
            0,
            dirTableOffsetsArray,
        );

        this.uniformsBuffer = this.device.createBuffer({
            label: "radiance field network uniforms",
            size: 16, // vec3f background + u32 mode
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    _initializeModelBuffers() {
        const sizes = calculateBufferSizes(this.modelArgs);

        this.positionTables = this.device.createBuffer({
            label: "position encoding tables",
            size: sizes. positionTablesSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.directionTables = this.device.createBuffer({
            label: "direction encoding tables",
            size: sizes.directionTablesSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.fcWeights = this.device.createBuffer({
            label: "fc weights",
            size: sizes.fcWeightsSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.fcBiases = this.device.createBuffer({
            label: "fc biases",
            size: sizes.fcBiasesSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    }

    loadWeights(positionTablesData, directionTablesData, fcWeightsData, fcBiasesData) {
        const sizes = calculateBufferSizes(this.modelArgs);
        if (sizes.positionTablesSize !== positionTablesData.byteLength) {
            console.error("incorrect position tables size");
            return;
        }
        if (sizes.directionTablesSize !== directionTablesData.byteLength) {
            console.error("incorrect direction tables size");
            return;
        }
        if (sizes.fcWeightsSize !== fcWeightsData.byteLength) {
            console.error("incorrect fc weights size");
            return;
        }
        if (sizes.fcBiasesSize !== fcBiasesData.byteLength) {
            console.error("incorrect fc bias size");
            return;
        }

        this.device.queue.writeBuffer(this.positionTables, 0, positionTablesData);
        this.device.queue.writeBuffer(this.directionTables, 0, directionTablesData);
        this.device.queue.writeBuffer(this.fcWeights, 0, fcWeightsData);
        this.device.queue.writeBuffer(this.fcBiases, 0, fcBiasesData);
    }

    _initializeForwardPassBuffers() {
        const L = this.modelArgs["levels"];
        const F = this.modelArgs["feature_dim"];

        this.outputTexture = this.device.createTexture({
            label: "radiance field network output texture",
            size: [this.resolution, this.resolution],
            format: "rgba32float",
            usage:
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING,
        });
        this.outputView = this.outputTexture.createView();
        this.embeddingsBuffer = this.device.createBuffer({
            label: "radiance field network embeddings buffer",
            // 2 ... position and direction, 4 ... f32 size
            size: this.resolution * this.resolution * L * F * 2 * 4,
            usage: GPUBufferUsage.STORAGE,
        });
    }

    _createPrograms(shader) {
        this._shaderModule = this.device.createShaderModule({
            label: "radiance field network shader module",
            code: shader,
        });

        this.pipeline = this.device.createComputePipeline({
            label: "radiance field network pipeline",
            layout: "auto",
            compute: {
                module: this._shaderModule,
                constants: this.constants,
            },
        });

        this._createBindGroups();
    }

    _createBindGroups() {
        this.uniformsBindGroup = this.device.createBindGroup({
            label: "radiance field network uniforms bind group",
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.posGridSizes } },
                { binding: 1, resource: { buffer: this.dirGridSizes } },
                { binding: 2, resource: { buffer: this.posTableOffsets } },
                { binding: 3, resource: { buffer: this.dirTableOffsets } },
                { binding: 4, resource: { buffer: this.uniformsBuffer } },
            ],
        });

        this.modelBindGroup = this.device.createBindGroup({
            label: "radiance field network model bind group",
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.positionTables },
                },
                {
                    binding: 1,
                    resource: { buffer: this.directionTables },
                },
                {
                    binding: 2,
                    resource: { buffer: this.fcWeights },
                },
                {
                    binding: 3,
                    resource: { buffer: this.fcBiases },
                },
            ],
        });
    }

    _createForwardPassBindGroup(samplePoints, radianceBuffer, imageView) {
        return this.device.createBindGroup({
            label: "radiance field network forward pass bind group",
            layout: this.pipeline.getBindGroupLayout(2),
            entries: [
                { binding: 0, resource: { buffer: samplePoints } },
                { binding: 1, resource: { buffer: radianceBuffer } },
                { binding: 2, resource: { buffer: this.embeddingsBuffer } },
                { binding: 3, resource: imageView },
            ],
        });
    }

    forward(samplePoints, radianceBuffer, imageView, doneCallback) {
        const forwardPassBindGroup =
            this._createForwardPassBindGroup(samplePoints, radianceBuffer, imageView);

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.uniformsBindGroup);
        pass.setBindGroup(1, this.modelBindGroup);
        pass.setBindGroup(2, forwardPassBindGroup);
        pass.dispatchWorkgroups(...this._getWorkgroupCount());
        pass.end();

        this.device.queue.submit([encoder.finish()]);
        this.device.queue.onSubmittedWorkDone().then(doneCallback);
    }

    dispatchForward(pass, samplePoints, radianceBuffer, imageView) {
        const forwardPassBindGroup = this._createForwardPassBindGroup(samplePoints, radianceBuffer, imageView);
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.uniformsBindGroup);
        pass.setBindGroup(1, this.modelBindGroup);
        pass.setBindGroup(2, forwardPassBindGroup);
        pass.dispatchWorkgroups(...this._getWorkgroupCount());
    }

    numberOfParameters() {
        let parameters = 0;
        parameters += this.positionTables.size / 4;
        parameters += this.directionTables.size / 4;
        parameters += this.fcWeights.size / 4;
        parameters += this.fcBiases.size / 4;
        return parameters;
    }

    updateUniforms(background, mode) {
        const data = new ArrayBuffer(16);
        const view = new DataView(data);
        view.setFloat32(0, background[0], true);
        view.setFloat32(4, background[1], true);
        view.setFloat32(8, background[2], true);
        view.setUint32(12, mode, true);
        this.device.queue.writeBuffer(this.uniformsBuffer, 0, data);
    }

    destroyBuffers() {
        this.positionTables.destroy();
        this.directionTables.destroy();
        this.fcWeights.destroy();
        this.fcBiases.destroy();
        this.posGridSizes.destroy();
        this.dirGridSizes.destroy();
        this.posTableOffsets.destroy();
        this.dirTableOffsets.destroy();
        this.uniformsBuffer.destroy();
        this.outputTexture.destroy();
        this.embeddingsBuffer.destroy();
    }

    setResolution(resolution) {
        if (resolution === this.resolution) {
            return;
        }

        this.resolution = resolution;
        this.constants.RESOLUTION = resolution;

        this.outputTexture.destroy();
        this.embeddingsBuffer.destroy();
        this._initializeForwardPassBuffers();

        this.pipeline = this.device.createComputePipeline({
            label: "radiance field network pipeline",
            layout: "auto",
            compute: {
                module: this._shaderModule,
                constants: this.constants,
            },
        });

        this._createBindGroups();
    }

    renderToCanvas(canvasRenderer) {
        const canvasTexture = canvasRenderer.context.getCurrentTexture();

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: canvasTexture.createView(),
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        pass.setPipeline(canvasRenderer.pipeline);
        pass.setBindGroup(0, canvasRenderer.createBindGroup(this.outputView));
        pass.draw(6);
        pass.end();

        this.device.queue.submit([encoder.finish()]);
    }
}

function createGridSizes(coarseRes, fineRes, levels) {
    const b = Math.exp(
        (Math.log(fineRes) - Math.log(coarseRes)) / (levels - 1),
    );
    const grids = new Uint32Array(levels);
    for (let i = 0; i < levels; i++) {
        grids[i] = Math.floor(coarseRes * b ** i);
    }
    return grids;
}

function findFirstHashLevel(gridSizes, hashTableSize, dimensions) {
    for (let i = 0; i < gridSizes.length; i++) {
        const gridSize = gridSizes[i];
        const tableSize = Math.pow(gridSize + 1, dimensions);
        if (tableSize > hashTableSize) {
            return i;
        }
    }
    return gridSizes.length;
}

function createTableOffsets(
    gridSizes,
    hashTableSize,
    firstHashLevel,
    dimensions,
) {
    const offsets = new Uint32Array(gridSizes.length);
    let offset = 0;
    for (let i = 0; i < gridSizes.length; i++) {
        offsets[i] = offset;
        if (i < firstHashLevel) {
            // One-to-one indexing: table size is (gridSize + 1)^dimensions
            offset += Math.pow(gridSizes[i] + 1, dimensions);
        } else {
            // Hash indexing: table size is hashTableSize
            offset += hashTableSize;
        }
    }
    return offsets;
}

function calculateBufferSizes(modelArgs) {
    const L = modelArgs["levels"];
    const F = modelArgs["feature_dim"];
    const T = 2 ** modelArgs["hash_table_size"];
    const layers = modelArgs["layers"];
    const hiddenDim = modelArgs["hidden_dim"];

    const posGridSizes = createGridSizes(
        modelArgs["pos_coarse_res"],
        modelArgs["pos_fine_res"],
        L,
    );
    const dirGridSizes = createGridSizes(
        modelArgs["dir_coarse_res"],
        modelArgs["dir_fine_res"],
        L,
    );
    const posFirstHash = findFirstHashLevel(posGridSizes, T, 3);
    const dirFirstHash = findFirstHashLevel(dirGridSizes, T, 2);

    // Calculate table sizes in bytes
    let positionTablesSize = 0;
    let directionTablesSize = 0;

    for (let i = 0; i < L; i++) {
        const posEntries = i < posFirstHash
            ? Math.pow(posGridSizes[i] + 1, 3)
            : T;
        positionTablesSize += posEntries * F * 4;

        const dirEntries = i < dirFirstHash
            ? Math.pow(dirGridSizes[i] + 1, 2)
            : T;
        directionTablesSize += dirEntries * F * 4;
    }

    // Calculate FC layer sizes
    const inputDim = L * F * 2;
    const paddedInput = Math.ceil(inputDim / 4) * 4;
    const paddedHidden = Math.ceil(hiddenDim / 4) * 4;

    let fcWeightsSize = 0;
    let fcBiasesSize = 0;

    for (let layer = 0; layer < layers; layer++) {
        let inFeatures, outFeatures;
        if (layer === 0) {
            inFeatures = paddedInput;
            outFeatures = hiddenDim;
        } else if (layer === layers - 1) {
            inFeatures = paddedHidden;
            outFeatures = 3;
        } else {
            inFeatures = paddedHidden;
            outFeatures = hiddenDim;
        }

        fcWeightsSize += outFeatures * inFeatures * 4;
        fcBiasesSize += Math.ceil(outFeatures / 4) * 4 * 4;
    }

    return { positionTablesSize, directionTablesSize, fcWeightsSize, fcBiasesSize };
}
