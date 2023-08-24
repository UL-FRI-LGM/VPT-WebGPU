export class WebGPUDoubleBuffer {

constructor(device, spec) {
    this._device = device;
    this._spec = spec;

    this._readAttachments = this._createAttachmentsFromSpec(device, spec);
    this._writeAttachments = this._createAttachmentsFromSpec(device, spec);

    this._width = spec[0].textureDescriptor.size[0];
    this._height = spec[0].textureDescriptor.size[1];
}

destroy() {
    return; // TODO

    const gl = this._gl;
    gl.deleteFramebuffer(this._readFramebuffer);
    for (let texture of this._readAttachments.color) {
        gl.deleteTexture(texture);
    }
    gl.deleteFramebuffer(this._writeFramebuffer);
    for (let texture of this._writeAttachments.color) {
        gl.deleteTexture(texture);
    }
}

_createAttachmentsFromSpec(device, spec) {
    return spec.map(s => ({
        texture: device.createTexture(s.textureDescriptor),
        sampler: device.createSampler(s.samplerDescriptor)
    }));
}

swap() {
    let tmp = this._readAttachments;
    this._readAttachments = this._writeAttachments;
    this._writeAttachments = tmp;
}

// getAttachments() {
//     return this._readAttachments;
// }

getReadAttachments() {
    return this._readAttachments;
}

getWriteAttachments() {
    return this._writeAttachments;
}

}
