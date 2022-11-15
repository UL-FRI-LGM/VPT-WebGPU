// #part /js/WebGPUDoubleBuffer

// #link WebGPU

class WebGPUDoubleBuffer { // TODO: Inheritance from SingleBuffer?

constructor(device, spec) {
    // this._gl = gl;
    // this._spec = spec;

    // this._attachments = this._createAttachmentsFromSpec(gl, this._spec);
    // this._framebuffer = WebGL.createFramebuffer(gl, this._attachments);

    // this._width = this._spec[0].width;
    // this._height = this._spec[0].height;


    this._device = device;
    this._spec = spec;

    this._readAttachments = this._createAttachmentsFromSpec(this._device, this._spec);
    this._writeAttachments = this._createAttachmentsFromSpec(this._device, this._spec);

    this._width = this._spec[0].width;
    this._height = this._spec[0].height;
}

destroy() {
    // TODO: Implement cleanup
}

_createAttachmentsFromSpec(device, spec) {
    return { color: spec.map(s => device.createTexture(s)) };
    // return { color: spec.map(s => WebGL.createTexture(gl, s)) };
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
