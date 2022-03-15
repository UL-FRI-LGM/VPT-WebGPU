// #part /js/renderers/WebGPUEAMRenderer

// #link ../WebGPU
// #link AbstractRenderer

class WebGPUEAMRenderer extends WebGPUAbstractRenderer {

constructor(device, volume, environmentTexture, options) {
    super(device, volume, environmentTexture, options);

    Object.assign(this, {
        extinction : 100,
        slices     : 64,
        steps      : 64,
    }, options);

    //this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.EAM, MIXINS);
    
    this.pvmMat = new Matrix();

    this._generateVSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.generate.vertex });
    this._generateFSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.generate.fragment });


    let x = 0;
    let y = 0;
    let z = -1;
    let vertices = new Float32Array([
        x-0.5, y-0.5, z, 1.0, 0.0, 0.0,
        x+0.5, y-0.5, z, 0.0, 1.0, 0.0,
        x,     y+0.5, z, 0.0, 0.0, 1.0
    ])
    this._vertexBuffer = WebGPU.createBuffer(this._device, vertices, GPUBufferUsage.VERTEX)

    this._sceneBuffer = WebGPU.createBuffer(this._device, this.pvmMat.m, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);


    this._sceneBindGroupLayout = this._device.createBindGroupLayout({
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: "uniform" }
        }]
    });
    this._sceneBindGroup = this._device.createBindGroup({
        layout: this._sceneBindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: this._sceneBuffer }
        }]
    });
    this._scenePipeline = this._device.createRenderPipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [this._sceneBindGroupLayout]
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
                            format: "float32x3"
                        },
                        { // Color
                            shaderLocation: 1, // [[location(1)]]
                            offset: 4 * 3,
                            format: "float32x3"
                        }
                    ],
                    arrayStride: 4 * 6, // sizeof(float) * 6
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
        // Depth test
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus-stencil8"
        }
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
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.reset;
    // gl.useProgram(program);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
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

    
    this.pvmMat.multiply(this.viewMatrix, this.modelMatrix);
    this.pvmMat.multiply(this.projectionMatrix, this.pvmMat);

    this._device.queue.writeBuffer(this._sceneBuffer, 0, this.pvmMat.m);



    const commandEncoder = this._device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: this._frameBufferTex.createView(),
            loadOp: "clear",
            clearValue: [0, 0, 0, 1],
            storeOp: "store"
        }],
        depthStencilAttachment: {
            view: this._frameBufferDepthTex.createView(),
            depthLoadValue: 1,
            depthStoreOp: "store",
            stencilLoadValue: 0,
            stencilStoreOp: "store"
        }
    });
    renderPass.setPipeline(this._scenePipeline);
    renderPass.setVertexBuffer(0, this._vertexBuffer);
    renderPass.setBindGroup(0, this._sceneBindGroup);
    renderPass.draw(3, 1, 0, 0);
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
}

_renderFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.render;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    // gl.uniform1i(uniforms.uAccumulator, 0);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
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
        width:  this._bufferSize,
        height: this._bufferSize,
        format: "rgba8unorm"
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
        width          : this._bufferSize,
        height         : this._bufferSize,
    }];
}

}
