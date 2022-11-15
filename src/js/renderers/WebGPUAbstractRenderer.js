// #part /js/renderers/WebGPUAbstractRenderer

// #link ../math
// #link ../WebGPU
// #link ../WebGPUSingleBuffer
// #link ../WebGPUDoubleBuffer

class WebGPUAbstractRenderer {

constructor(device, volume, environmentTexture, options) {
    Object.assign(this, {
        _bufferSize : 512
    }, options);

    this._device = device;
    this._volume = volume;
    this._environmentTexture = environmentTexture;

    this._rebuildBuffers();

    // this._transferFunction = WebGL.createTexture(gl, {
    //     width  : 2,
    //     height : 1,
    //     data   : new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),
    //     wrapS  : gl.CLAMP_TO_EDGE,
    //     wrapT  : gl.CLAMP_TO_EDGE,
    //     min    : gl.LINEAR,
    //     mag    : gl.LINEAR
    // });


    const texDesc = {
        size: { width: 2, height: 1 },
        format: "rgba8unorm", // TODO
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC // TODO: Remove DST
               // GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    };
    this._transferFunctionTexture = this._device.createTexture(texDesc);

    // TODO: Cleanup
    let tempTexData = new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 255]);
    let imageData = new ImageData(tempTexData, texDesc.size.width, texDesc.size.height);
    createImageBitmap(imageData).then((imageBitmap) => {
        this._device.queue.copyExternalImageToTexture({ source: imageBitmap }, { texture: this._transferFunctionTexture }, texDesc.size);
    });



    this.modelMatrix = new Matrix();
    this.viewMatrix = new Matrix();
    this.projectionMatrix = new Matrix();

    this._clipQuad = WebGPU.createClipQuad(this._device);

    // this._clipQuad = WebGL.createClipQuad(gl);
    // this._clipQuadProgram = WebGL.buildPrograms(gl, {
    //     quad: SHADERS.quad
    // }).quad;
}

destroy() {
    // const gl = this._gl;
    // this._frameBuffer.destroy();
    // this._accumulationBuffer.destroy();
    // this._renderBuffer.destroy();
    // gl.deleteTexture(this._transferFunction);
    // gl.deleteBuffer(this._clipQuad);
    // gl.deleteProgram(this._clipQuadProgram.program);

    this._transferFunctionTexture.destroy();
}

render() {
    // // TODO: put the following logic in VAO
    // const gl = this._gl;
    // gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    // gl.enableVertexAttribArray(0); // position always bound to attribute 0
    // gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // this._frameBuffer.use();
    // this._generateFrame();

    // this._accumulationBuffer.use();
    // this._integrateFrame();
    // this._accumulationBuffer.swap();

    // this._renderBuffer.use();
    // this._renderFrame();



    this._generateFrame();

    this._integrateFrame();
    this._accumulationBuffer.swap();

    this._renderFrame();
}

reset() {
    // // TODO: put the following logic in VAO
    // const gl = this._gl;
    // gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    // gl.enableVertexAttribArray(0); // position always bound to attribute 0
    // gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // this._accumulationBuffer.use();
    // this._resetFrame();
    // this._accumulationBuffer.swap();

    this._resetFrame();
    this._accumulationBuffer.swap();
}

_rebuildBuffers() {
    // if (this._frameBuffer) {
    //     this._frameBuffer.destroy();
    // }
    // if (this._accumulationBuffer) {
    //     this._accumulationBuffer.destroy();
    // }
    // if (this._renderBuffer) {
    //     this._renderBuffer.destroy();
    // }
    // const gl = this._gl;
    // this._frameBuffer = new SingleBuffer(gl, this._getFrameBufferSpec());
    // this._accumulationBuffer = new DoubleBuffer(gl, this._getAccumulationBufferSpec());
    // this._renderBuffer = new SingleBuffer(gl, this._getRenderBufferSpec());

    if (this._frameBuffer) {
        this._frameBuffer.destroy();
    }
    if (this._accumulationBuffer) {
        this._accumulationBuffer.destroy();
    }
    if (this._renderBuffer) {
        this._renderBuffer.destroy();
    }
    this._frameBuffer = new WebGPUSingleBuffer(this._device, this._getFrameBufferSpec());
    this._accumulationBuffer = new WebGPUDoubleBuffer(this._device, this._getAccumulationBufferSpec());
    this._renderBuffer = new WebGPUSingleBuffer(this._device, this._getRenderBufferSpec());


    // let tempTexData = new Uint8Array(256 * 256 * 4)
    // for (let i = 0; i < 256 * 256; ++i) {
    //     tempTexData[4*i] = 255
    //     tempTexData[4*i+1] = 0
    //     tempTexData[4*i+2] = 255
    //     tempTexData[4*i+3] = 255
    // }
    // let tempTexBuffer = this._device.createBuffer({
    //     size: ((tempTexData.byteLength + 3) & ~3),
    //     usage: GPUBufferUsage.COPY_SRC,
    //     mappedAtCreation: true
    // });
    // new Uint8Array(tempTexBuffer.getMappedRange()).set(tempTexData);
    // tempTexBuffer.unmap();
    // let ce = this._device.createCommandEncoder({});
    // ce.copyBufferToTexture({ buffer: tempTexBuffer, bytesPerRow: 256 * 4 }, {texture: this._frameBufferTex}, { width: 256, height: 256});
    // this._device.queue.submit([ce.finish()]);
}

setVolume(volume) {
    this._volume = volume;
    this.reset();
}

setTransferFunction(transferFunction) {
    // const gl = this._gl;
    // gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    // gl.texImage2D(gl.TEXTURE_2D, 0,
    //     gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, transferFunction);
    // gl.bindTexture(gl.TEXTURE_2D, null);

    if (this._transferFunctionTexture) {
        this._transferFunctionTexture.destroy();
    }
    this._transferFunctionTexture = WebGPU.webGPUTextureFromImageBitmapOrCanvas(
        this._device,
        transferFunction,
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC // TODO: Remove DST
    );
}

setResolution(resolution) {
    if (resolution !== this._bufferSize) {
        this._bufferSize = resolution;
        this._rebuildBuffers();
        this.reset();
    }
}

calculateMVPInverseTranspose() {
    const mvpit = new Matrix();
    mvpit.multiply(this.viewMatrix, this.modelMatrix);
    mvpit.multiply(this.projectionMatrix, mvpit);
    return mvpit.inverse().transpose();
}

getTexture() {
    return this._renderBuffer.getAttachments().color[0];
}

_resetFrame() {
    // IMPLEMENT
}

_generateFrame() {
    // IMPLEMENT
}

_integrateFrame() {
    // IMPLEMENT
}

_renderFrame() {
    // IMPLEMENT
}

_getFrameBufferSpec() {
    // IMPLEMENT
}

_getAccumulationBufferSpec() {
    // IMPLEMENT
}

_getRenderBufferSpec() {
    // const gl = this._gl;
    // return [{
    //     width          : this._bufferSize,
    //     height         : this._bufferSize,
    //     min            : gl.NEAREST,
    //     mag            : gl.NEAREST,
    //     wrapS          : gl.CLAMP_TO_EDGE,
    //     wrapT          : gl.CLAMP_TO_EDGE,
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA16F,
    //     type           : gl.FLOAT
    // }];

    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        size: [this._bufferSize, this._bufferSize, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    }];
}

}
