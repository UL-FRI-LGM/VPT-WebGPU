// #part /js/renderers/WebGPUEAMRenderer

// #link ../WebGPU
// #link WebGPUAbstractRenderer

class WebGPUEAMRenderer extends WebGPUAbstractRenderer {

constructor(device, volume, environmentTexture, options) {
    super(device, volume, environmentTexture, options);

    Object.assign(this, {
        extinction : 100,
        slices     : 64,
        steps      : 64,
    }, options);

    //this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.EAM, MIXINS);
    
    this._mvpInvMat = new Matrix();

    this._generateVSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.generate.vertex });
    this._generateFSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.generate.fragment });

    this._resetVSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.reset.vertex });
    this._resetFSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.reset.fragment });

    this._renderVSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.render.vertex });
    this._renderFSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.render.fragment });

    this._integrateVSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.integrate.vertex });
    this._integrateFSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.integrate.fragment });


    // let x = 0;
    // let y = 0;
    // let z = -1;
    // let vertices = new Float32Array([
    //     x-0.5, y-0.5, z, 1.0, 0.0, 0.0,
    //     x+0.5, y-0.5, z, 0.0, 1.0, 0.0,
    //     x,     y+0.5, z, 0.0, 0.0, 1.0
    // ])
    // this._vertexBuffer = WebGPU.createBuffer(this._device, vertices, GPUBufferUsage.VERTEX)

    //this._generateBuffer = WebGPU.createBuffer(this._device, this._mvpInvMat.m, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this._generateBuffer = this._device.createBuffer({
        size: 76,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: false
    });

    this._sampler = this._device.createSampler({
        minFilter: "linear",
        magFilter: "linear"
    });

    this._generateBindGroupLayout = this._device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "3d" }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "2d" }
            }
        ]
    });
    this._generatePipeline = this._device.createRenderPipeline({
        layout: this._device.createPipelineLayout({
            bindGroupLayouts: [this._generateBindGroupLayout]
        }),
        // Vertex shader
        vertex: {
            module: this._generateVSModule,
            entryPoint: "main",
            buffers: [
                { // vertexBuffer
                    attributes: [
                        { // Position
                            shaderLocation: 0, // [[location(0)]]
                            offset: 0,
                            format: "float32x2"
                        }
                    ],
                    arrayStride: 4 * 2, // sizeof(float) * 2
                    stepMode: "vertex"
                }
            ]
        },
        // Fragment shader
        fragment: {
            module: this._generateFSModule,
            entryPoint: "main",
            targets: [{
                format: "rgba8unorm"
            }],
        },
        // Rasterization
        primitive: {
            frontFace: "ccw",
            cullMode: "none",
            topology: "triangle-list"
        },
        // // Depth test
        // depthStencil: {
        //     depthWriteEnabled: true,
        //     depthCompare: "less",
        //     format: "depth24plus-stencil8"
        // }
    });




    this._integrateBindGroupLayout = this._device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "2d" }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "2d" }
            }
        ]
    });
    this._integratePipeline = this._device.createRenderPipeline({
        layout: this._device.createPipelineLayout({
            bindGroupLayouts: [this._integrateBindGroupLayout]
        }),
        // Vertex shader
        vertex: {
            module: this._integrateVSModule,
            entryPoint: "main",
            buffers: [
                { // vertexBuffer
                    attributes: [
                        { // Position
                            shaderLocation: 0, // [[location(0)]]
                            offset: 0,
                            format: "float32x2"
                        }
                    ],
                    arrayStride: 4 * 2, // sizeof(float) * 2
                    stepMode: "vertex"
                }
            ]
        },
        // Fragment shader
        fragment: {
            module: this._integrateFSModule,
            entryPoint: "main",
            targets: [{
                format: "rgba8unorm"
            }],
        },
        // Rasterization
        primitive: {
            frontFace: "ccw",
            cullMode: "none",
            topology: "triangle-list"
        },
    });





    this._renderBindGroupLayout = this._device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "2d" }
            }
        ]
    });
    this._renderPipeline = this._device.createRenderPipeline({
        layout: this._device.createPipelineLayout({
            bindGroupLayouts: [this._renderBindGroupLayout]
        }),
        // Vertex shader
        vertex: {
            module: this._renderVSModule,
            entryPoint: "main",
            buffers: [
                { // vertexBuffer
                    attributes: [
                        { // Position
                            shaderLocation: 0, // [[location(0)]]
                            offset: 0,
                            format: "float32x2"
                        }
                    ],
                    arrayStride: 4 * 2, // sizeof(float) * 2
                    stepMode: "vertex"
                }
            ]
        },
        // Fragment shader
        fragment: {
            module: this._renderFSModule,
            entryPoint: "main",
            targets: [{
                format: "rgba8unorm"
            }],
        },
        // Rasterization
        primitive: {
            frontFace: "ccw",
            cullMode: "none",
            topology: "triangle-list"
        },
    });




    this._resetPipeline = this._device.createRenderPipeline({
        layout: "auto",
        // Vertex shader
        vertex: {
            module: this._resetVSModule,
            entryPoint: "main",
            buffers: [
                { // vertexBuffer
                    attributes: [
                        { // Position
                            shaderLocation: 0, // [[location(0)]]
                            offset: 0,
                            format: "float32x2"
                        }
                    ],
                    arrayStride: 4 * 2, // sizeof(float) * 2
                    stepMode: "vertex"
                }
            ]
        },
        // Fragment shader
        fragment: {
            module: this._resetFSModule,
            entryPoint: "main",
            targets: [{
                format: "rgba8unorm"
            }],
        },
        // Rasterization
        primitive: {
            frontFace: "ccw",
            cullMode: "none",
            topology: "triangle-list"
        },
    });
}

destroy() {
    // const gl = this._gl;
    // Object.keys(this._programs).forEach(programName => {
    //     gl.deleteProgram(this._programs[programName].program);
    // });

    super.destroy();
}

_resetFrame() {
    const commandEncoder = this._device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: this._accumulationBuffer.getWriteAttachments().color[0].createView(),
            loadOp: "clear",
            clearValue: [0, 0, 0, 1],
            storeOp: "store"
        }]
    });
    renderPass.setPipeline(this._resetPipeline);
    renderPass.setVertexBuffer(0, this._clipQuad);
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();

    this._device.queue.submit([commandEncoder.finish()]);
}

_generateFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.generate;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    // gl.uniform1i(uniforms.uVolume, 0);
    // gl.uniform1i(uniforms.uTransferFunction, 1);
    // gl.uniform1f(uniforms.uStepSize, 1 / this.slices);
    // gl.uniform1f(uniforms.uExtinction, this.extinction);
    // gl.uniform1f(uniforms.uOffset, Math.random());
    // const mvpit = this.calculateMVPInverseTranspose();
    // gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    
    // this.pvmMat.multiply(this.viewMatrix, this.modelMatrix);
    // this.pvmMat.multiply(this.projectionMatrix, this.pvmMat);

    // this._device.queue.writeBuffer(this._generateBuffer, 0, this.pvmMat.m);

    if (!this._volume.getTextureView()) { // TODO
        return;
    }

    this._mvpInvMat = this.calculateMVPInverseTranspose();
    this._device.queue.writeBuffer(this._generateBuffer, 0, this._mvpInvMat.m);
    this._device.queue.writeBuffer(this._generateBuffer, 64, new Float32Array([
        1.0 / this.slices,
        Math.random(),
        this.extinction
    ]));



    this._generateBindGroup = this._device.createBindGroup({
        layout: this._generateBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: { buffer: this._generateBuffer }
            },
            {
                binding: 1,
                resource: this._sampler
            },
            {
                binding: 2,
                resource: this._volume.getTextureView()
            },
            {
                binding: 3,
                resource: this._transferFunctionTexture.createView()
            }
        ]
    });



    const commandEncoder = this._device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: this._frameBuffer.getAttachments().color[0].createView(),
            loadOp: "clear",
            clearValue: [0, 0, 0, 1],
            storeOp: "store"
        }],
        // depthStencilAttachment: {
        //     view: this._frameBufferDepthTex.createView(),
        //     depthClearValue: 1,
        //     depthLoadOp: "clear",
        //     depthStoreOp: "store",
        //     stencilClearValue: 0,
        //     stencilLoadOp: "clear",
        //     stencilStoreOp: "store"
        // }
    });
    renderPass.setPipeline(this._generatePipeline);
    renderPass.setVertexBuffer(0, this._clipQuad);
    renderPass.setBindGroup(0, this._generateBindGroup);
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();

    this._device.queue.submit([commandEncoder.finish()]);
}

_integrateFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.integrate;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    // gl.uniform1i(uniforms.uAccumulator, 0);
    // gl.uniform1i(uniforms.uFrame, 1);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);


    this._integrateBindGroup = this._device.createBindGroup({
        layout: this._integrateBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: this._sampler
            },
            {
                binding: 1,
                resource: this._accumulationBuffer.getReadAttachments().color[0].createView()
            },
            {
                binding: 2,
                resource: this._frameBuffer.getAttachments().color[0].createView()
            }
        ]
    });


    const commandEncoder = this._device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: this._accumulationBuffer.getWriteAttachments().color[0].createView(),
            loadOp: "clear",
            clearValue: [0, 0, 0, 1],
            storeOp: "store"
        }]
    });
    renderPass.setPipeline(this._integratePipeline);
    renderPass.setVertexBuffer(0, this._clipQuad);
    renderPass.setBindGroup(0, this._integrateBindGroup);
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();

    this._device.queue.submit([commandEncoder.finish()]);
}

_renderFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.render;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    // gl.uniform1i(uniforms.uAccumulator, 0);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    this._renderBindGroup = this._device.createBindGroup({
        layout: this._renderBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: this._sampler
            },
            {
                binding: 1,
                resource: this._accumulationBuffer.getReadAttachments().color[0].createView()
            }
        ]
    });


    const commandEncoder = this._device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: this._renderBuffer.getAttachments().color[0].createView(),
            loadOp: "clear",
            clearValue: [0, 0, 0, 1],
            storeOp: "store"
        }]
    });
    renderPass.setPipeline(this._renderPipeline);
    renderPass.setVertexBuffer(0, this._clipQuad);
    renderPass.setBindGroup(0, this._renderBindGroup);
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();

    this._device.queue.submit([commandEncoder.finish()]);
}

_getFrameBufferSpec() {
    // const gl = this._gl;
    // return [{
    //     width          : this._bufferSize,
    //     height         : this._bufferSize,
    //     min            : gl.NEAREST,
    //     mag            : gl.NEAREST,
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA,
    //     type           : gl.UNSIGNED_BYTE
    // }];

    return [{ // TODO: Should this return an array?
        width:  this._bufferSize, // TODO: Remove
        height: this._bufferSize, // TODO: Remove
        size: [this._bufferSize, this._bufferSize, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC // TODO: Remove DST
    }];
}

_getAccumulationBufferSpec() {
    // const gl = this._gl;
    // return [{
    //     width          : this._bufferSize,
    //     height         : this._bufferSize,
    //     min            : gl.NEAREST,
    //     mag            : gl.NEAREST,
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA,
    //     type           : gl.UNSIGNED_BYTE
    // }];

    return [{
        width          : this._bufferSize, // TODO: Remove
        height         : this._bufferSize, // TODO: Remove
        size: [this._bufferSize, this._bufferSize, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC
    }];
}

}
