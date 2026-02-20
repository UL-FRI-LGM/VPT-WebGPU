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
    for (let readAttachment of this._readAttachments) {
        readAttachment.texture.destroy();
    }
    for (let writeAttachment of this._writeAttachments) {
        writeAttachment.texture.destroy();
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

getReadAttachments() {
    return this._readAttachments;
}

getWriteAttachments() {
    return this._writeAttachments;
}

}
