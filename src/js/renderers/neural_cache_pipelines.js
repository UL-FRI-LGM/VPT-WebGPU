function getWorkgroupCount(renderer) {
    return [
        Math.ceil(renderer._resolution / renderer._workgroup_size[0]),
        Math.ceil(renderer._resolution / renderer._workgroup_size[1]),
    ];
}

export function resetFrame(renderer) {
    const bindGroup = renderer._device.createBindGroup({
        label: "WebGPUNeuralCacheRenderer reset bind group",
        layout: renderer._resetPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: renderer._uniformBuffer } },
            { binding: 1, resource: { buffer: renderer._radianceBuffer } },
            { binding: 2, resource: renderer._renderBuffer.getAttachments()[0].texture.createView() },
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

    // -- Bind groups --

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
        ],
    });

    // -- Dispatch --

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(renderer._volumeSamplingPipeline);
    pass.setBindGroup(0, volumeSamplingBindGroup);
    pass.dispatchWorkgroups(...workgroupCount);

    pass.setPipeline(renderer._directIlluminationPipeline);
    pass.setBindGroup(0, directIlluminationBindGroup);
    pass.dispatchWorkgroups(...workgroupCount);

    pass.setPipeline(renderer._indirectIlluminationPipeline);
    pass.setBindGroup(0, indirectIlluminationBindGroup);
    pass.dispatchWorkgroups(...workgroupCount);

    if (renderer.filterEnabled) {
        pass.setPipeline(renderer._filterPipeline);
        pass.setBindGroup(0, filterBindGroup);
        pass.dispatchWorkgroups(...workgroupCount);
    }

    pass.setPipeline(renderer._composePipeline);
    pass.setBindGroup(0, composeBindGroup);
    pass.dispatchWorkgroups(...workgroupCount);

    pass.end();
    device.queue.submit([encoder.finish()]);
}
