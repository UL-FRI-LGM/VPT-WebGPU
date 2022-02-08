// #part /js/renderers/WebGPUEAMRenderer

// #link ../WebGL
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

    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
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
