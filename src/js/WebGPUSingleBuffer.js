// #part /js/WebGPUSingleBuffer

// #link WebGPU

class WebGPUSingleBuffer {

constructor(device, spec) {
    // this._gl = gl;
    // this._spec = spec;

    // this._attachments = this._createAttachmentsFromSpec(gl, this._spec);
    // this._framebuffer = WebGL.createFramebuffer(gl, this._attachments);

    // this._width = this._spec[0].width;
    // this._height = this._spec[0].height;


    this._device = device;
    this._spec = spec;

    this._attachments = this._createAttachmentsFromSpec(this._device, this._spec);

    this._width = this._spec[0].width;
    this._height = this._spec[0].height;

    // this._frameBufferTex = this._device.createTexture({
    //     size: [fbSpec.width, fbSpec.height, 1],
    //     format: fbSpec.format,
    //     usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC // TODO: Remove DST
    // });

    // this._frameBufferDepthTex = this._device.createTexture({
    //     size: [fbSpec.width, fbSpec.height, 1],
    //     format: "depth24plus-stencil8",
    //     usage: GPUTextureUsage.RENDER_ATTACHMENT // | GPUTextureUsage.COPY_SRC
    // });


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

destroy() {
    // TODO: Implement cleanup
    
    // const gl = this._gl;
    // gl.deleteFramebuffer(this._framebuffer);
    // for (let texture of this._attachments.color) {
    //     gl.deleteTexture(texture);
    // }
}

_createAttachmentsFromSpec(device, spec) {
    return { color: spec.map(s => device.createTexture(s)) };
    // return { color: spec.map(s => WebGL.createTexture(gl, s)) };
}

getAttachments() {
    return this._attachments;
}

}
