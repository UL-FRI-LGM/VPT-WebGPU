"use strict";

function getWorkgroupCount(renderer) {
    return [
        Math.ceil(renderer._resolution / renderer._workgroup_size[0]),
        Math.ceil(renderer._resolution / renderer._workgroup_size[1]),
    ];
}

function timestampPassDescriptor(querySet, beginIndex, endIndex) {
    if (!querySet) return {};
    return {
        timestampWrites: {
            querySet,
            beginningOfPassWriteIndex: beginIndex,
            endOfPassWriteIndex: endIndex,
        },
    };
}

function resolveTimestamps(encoder, renderer) {
    const querySet = renderer._timestampQuerySet;
    if (!querySet || renderer._timestampStagingMapped) return;

    encoder.resolveQuerySet(
        querySet, 0, 12,
        renderer._timestampResolveBuffer, 0
    );
    encoder.copyBufferToBuffer(
        renderer._timestampResolveBuffer, 0,
        renderer._timestampStagingBuffer, 0,
        12 * 8
    );
}

function createCommonBindGroups(renderer) {
    const device = renderer._device;

    const volumeSamplingBindGroup = device.createBindGroup({
        label: "WebGPUNeuralCacheRenderer volume sampling bind group",
        layout: renderer._volumeSamplingPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: renderer._uniformBuffer } },
            { binding: 1, resource: { buffer: renderer._radianceBuffer } },
            { binding: 3, resource: renderer._volume.getTexture().createView() },
            { binding: 4, resource: renderer._volume.getTextureSampler() },
            { binding: 5, resource: renderer._transferFunction.createView() },
            { binding: 6, resource: renderer._transferFunctionSampler },
            { binding: 10, resource: { buffer: renderer._samplePointsBuffer } },
        ],
    });

    const directIlluminationBindGroup = device.createBindGroup({
        label: "WebGPUNeuralCacheRenderer direct illumination bind group",
        layout: renderer._directIlluminationPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: renderer._uniformBuffer } },
            { binding: 1, resource: { buffer: renderer._radianceBuffer } },
            { binding: 3, resource: renderer._volume.getTexture().createView() },
            { binding: 4, resource: renderer._volume.getTextureSampler() },
            { binding: 5, resource: renderer._transferFunction.createView() },
            { binding: 6, resource: renderer._transferFunctionSampler },
            { binding: 7, resource: renderer._environment.texture.createView() },
            { binding: 8, resource: renderer._environment.sampler },
            { binding: 10, resource: { buffer: renderer._samplePointsBuffer } },
        ],
    });

    const filterBindGroup = device.createBindGroup({
        label: "WebGPUNeuralCacheRenderer filter bind group",
        layout: renderer._filterPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: renderer._uniformBuffer } },
            { binding: 1, resource: { buffer: renderer._radianceBuffer } },
            { binding: 9, resource: { buffer: renderer._groundTruthBuffer } },
        ],
    });

    const composeBindGroup = device.createBindGroup({
        label: "WebGPUNeuralCacheRenderer compose bind group",
        layout: renderer._composePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: renderer._uniformBuffer } },
            { binding: 1, resource: { buffer: renderer._radianceBuffer } },
            { binding: 2, resource: renderer._renderBuffer.getAttachments()[0].texture.createView() },
            { binding: 11, resource: renderer._directTexture.createView() },
            { binding: 12, resource: renderer._indirectTexture.createView() },
        ],
    });

    const accumulateBindGroup = device.createBindGroup({
        label: "WebGPUNeuralCacheRenderer accumulate bind group",
        layout: renderer._accumulatePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: renderer._uniformBuffer } },
            { binding: 1, resource: { buffer: renderer._radianceBuffer } },
        ],
    });

    return { volumeSamplingBindGroup, directIlluminationBindGroup, filterBindGroup, composeBindGroup, accumulateBindGroup };
}

export function resetFrame(renderer) {
    const bindGroup = renderer._device.createBindGroup({
        label: "WebGPUNeuralCacheRenderer reset bind group",
        layout: renderer._resetPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: renderer._uniformBuffer } },
            { binding: 1, resource: { buffer: renderer._radianceBuffer } },
            { binding: 2, resource: renderer._renderBuffer.getAttachments()[0].texture.createView() },
            { binding: 11, resource: renderer._directTexture.createView() },
            { binding: 12, resource: renderer._indirectTexture.createView() },
        ],
    });

    const encoder = renderer._device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(renderer._resetPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(...getWorkgroupCount(renderer));
    pass.end();
    renderer._device.queue.submit([encoder.finish()]);
}

export function renderFrame(renderer) {
    const device = renderer._device;
    const workgroupCount = getWorkgroupCount(renderer);
    const querySet = renderer._timestampQuerySet;

    const {
        volumeSamplingBindGroup,
        directIlluminationBindGroup,
        filterBindGroup,
        composeBindGroup,
        accumulateBindGroup,
    } = createCommonBindGroups(renderer);

    const indirectIlluminationBindGroup = device.createBindGroup({
        label: "WebGPUNeuralCacheRenderer indirect illumination bind group",
        layout: renderer._indirectIlluminationPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: renderer._uniformBuffer } },
            { binding: 1, resource: { buffer: renderer._radianceBuffer } },
            { binding: 3, resource: renderer._volume.getTexture().createView() },
            { binding: 4, resource: renderer._volume.getTextureSampler() },
            { binding: 5, resource: renderer._transferFunction.createView() },
            { binding: 6, resource: renderer._transferFunctionSampler },
            { binding: 7, resource: renderer._environment.texture.createView() },
            { binding: 8, resource: renderer._environment.sampler },
            { binding: 9, resource: { buffer: renderer._groundTruthBuffer } },
            { binding: 10, resource: { buffer: renderer._samplePointsBuffer } },
        ],
    });

    renderer._filterDispatchedThisFrame = renderer.filterEnabled;

    const encoder = device.createCommandEncoder();

    const pass1 = encoder.beginComputePass(timestampPassDescriptor(querySet, 0, 1));
    pass1.setPipeline(renderer._volumeSamplingPipeline);
    pass1.setBindGroup(0, volumeSamplingBindGroup);
    pass1.dispatchWorkgroups(...workgroupCount);
    pass1.end();

    const pass2 = encoder.beginComputePass(timestampPassDescriptor(querySet, 2, 3));
    pass2.setPipeline(renderer._directIlluminationPipeline);
    pass2.setBindGroup(0, directIlluminationBindGroup);
    pass2.dispatchWorkgroups(...workgroupCount);
    pass2.end();

    const pass3 = encoder.beginComputePass(timestampPassDescriptor(querySet, 4, 5));
    pass3.setPipeline(renderer._indirectIlluminationPipeline);
    pass3.setBindGroup(0, indirectIlluminationBindGroup);
    pass3.dispatchWorkgroups(...workgroupCount);
    pass3.end();

    if (renderer.filterEnabled) {
        const pass4 = encoder.beginComputePass(timestampPassDescriptor(querySet, 6, 7));
        pass4.setPipeline(renderer._filterPipeline);
        pass4.setBindGroup(0, filterBindGroup);
        pass4.dispatchWorkgroups(...workgroupCount);
        pass4.end();
    }

    const pass5 = encoder.beginComputePass(timestampPassDescriptor(querySet, 8, 9));
    pass5.setPipeline(renderer._accumulatePipeline);
    pass5.setBindGroup(0, accumulateBindGroup);
    pass5.dispatchWorkgroups(...workgroupCount);
    pass5.end();

    const pass6 = encoder.beginComputePass(timestampPassDescriptor(querySet, 10, 11));
    pass6.setPipeline(renderer._composePipeline);
    pass6.setBindGroup(0, composeBindGroup);
    pass6.dispatchWorkgroups(...workgroupCount);
    pass6.end();

    resolveTimestamps(encoder, renderer);
    device.queue.submit([encoder.finish()]);
}

export function neuralRender(renderer) {
    const device = renderer._device;
    const workgroupCount = getWorkgroupCount(renderer);
    const querySet = renderer._timestampQuerySet;

    const {
        volumeSamplingBindGroup,
        directIlluminationBindGroup,
        filterBindGroup,
        composeBindGroup,
        accumulateBindGroup,
    } = createCommonBindGroups(renderer);

    renderer._filterDispatchedThisFrame = renderer.filterEnabled;

    const encoder = device.createCommandEncoder();

    const pass1 = encoder.beginComputePass(timestampPassDescriptor(querySet, 0, 1));
    pass1.setPipeline(renderer._volumeSamplingPipeline);
    pass1.setBindGroup(0, volumeSamplingBindGroup);
    pass1.dispatchWorkgroups(...workgroupCount);
    pass1.end();

    const pass2 = encoder.beginComputePass(timestampPassDescriptor(querySet, 2, 3));
    pass2.setPipeline(renderer._directIlluminationPipeline);
    pass2.setBindGroup(0, directIlluminationBindGroup);
    pass2.dispatchWorkgroups(...workgroupCount);
    pass2.end();

    if (renderer.filterEnabled) {
        const pass3 = encoder.beginComputePass(timestampPassDescriptor(querySet, 6, 7));
        pass3.setPipeline(renderer._filterPipeline);
        pass3.setBindGroup(0, filterBindGroup);
        pass3.dispatchWorkgroups(...workgroupCount);
        pass3.end();
    }

    const pass4 = encoder.beginComputePass(timestampPassDescriptor(querySet, 4, 5));
    renderer._model.dispatchForward(
        pass4,
        renderer._samplePointsBuffer,
        renderer._radianceBuffer,
    );
    pass4.end();

    const pass5 = encoder.beginComputePass(timestampPassDescriptor(querySet, 8, 9));
    pass5.setPipeline(renderer._accumulatePipeline);
    pass5.setBindGroup(0, accumulateBindGroup);
    pass5.dispatchWorkgroups(...workgroupCount);
    pass5.end();

    const pass6 = encoder.beginComputePass(timestampPassDescriptor(querySet, 10, 11));
    pass6.setPipeline(renderer._composePipeline);
    pass6.setBindGroup(0, composeBindGroup);
    pass6.dispatchWorkgroups(...workgroupCount);
    pass6.end();

    resolveTimestamps(encoder, renderer);
    device.queue.submit([encoder.finish()]);
}
