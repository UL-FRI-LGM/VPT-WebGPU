// #part /js/renderers/MCCRenderer

// #link ../WebGL

// MCC: Monte Carlo Compute renderer
class MCCRenderer {

constructor(gl, volume, environmentTexture, options) {
    Object.assign(this, {
        absorptionCoefficient : 1,
        scatteringCoefficient : 1,
        scatteringBias        : 0,
        majorant              : 2,
        maxBounces            : 8,
        steps                 : 1,
        _resolution           : 512,
        _workgroup            : 8
    }, options);

    this._gl = gl;
    this._volume = volume;
    this._envmap = environmentTexture;

    this.modelMatrix = new Matrix();
    this.viewMatrix = new Matrix();
    this.projectionMatrix = new Matrix();

    this.init();
}

_init() {
    const gl = this._gl;

    this._programs = WebGL.buildPrograms(gl, SHADERS.renderers.MCC, MIXINS);

    this._transferFunction = WebGL.createTexture(gl, {
        width  : 2,
        height : 1,
        data   : new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),
        wrapS  : gl.CLAMP_TO_EDGE,
        wrapT  : gl.CLAMP_TO_EDGE,
        min    : gl.LINEAR,
        mag    : gl.LINEAR
    });

    this._renderBuffer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._renderBuffer);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, this._resolution, this._resolution);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // struct Photon {     //
    //     vec3 position;  // 4 * 4B
    //     vec3 direction; // 4 * 4B
    //     vec3 radiance;  // 4 * 4B
    //     vec3 color;     // 4 * 4B
    //     uint bounces;   // 4B
    //     uint samples;   // 4B
    //          padding    // ??
    // };                  //
    const bufferSize = 20 * 4 * this._resolution * this._resolution;
    this._photonBuffer = gl.createBuffer();
    gl.bindBuffer(gl.SHADER_STORAGE_BUFFER, this._photonBuffer);
    gl.bindBufferBase(gl.SHADER_STORAGE_BUFFER, 0, this._photonBuffer);
    gl.bufferData(gl.SHADER_STORAGE_BUFFER, bufferSize, gl.STATIC_DRAW);
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });
}

getTexture() {
    return this._renderBuffer;
}

setVolume(volume) {
    this._volume = volume;
    this.reset();
}

setTransferFunction(transferFunction) {
    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    gl.texImage2D(gl.TEXTURE_2D, 0,
        gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, transferFunction);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

setResolution(resolution) {
    const gl = this._gl;

    this._resolution = resolution;

    gl.deleteTexture(this._renderBuffer);
    this._renderBuffer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._renderBuffer);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, this._resolution, this._resolution);
}

calculateMVPInverseTranspose() {
    const mvpit = new Matrix();
    mvpit.multiply(this.viewMatrix, this.modelMatrix);
    mvpit.multiply(this.projectionMatrix, mvpit);
    return mvpit.inverse().transpose();
}

reset() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);
    gl.uniform2f(uniforms.uInverseResolution, 1 / this._resolution, 1 / this._resolution);
    gl.uniform1f(uniforms.uRandSeed, Math.random());
    gl.uniform1f(uniforms.uBlur, 0);

    gl.bindBuffer(gl.SHADER_STORAGE_BUFFER, this._photonBuffer);
    gl.bindBufferBase(gl.SHADER_STORAGE_BUFFER, 0, this._photonBuffer);

    gl.bindImageTexture(0, this._renderBuffer, 0, false, 0, gl.WRITE_ONLY, gl.RGBA32F);

    const groups = this._resolution / this._workgroup;
    gl.dispatchCompute(groups, groups, 1);
}

render() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._envmap);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    gl.uniform1i(uniforms.uVolume, 0);
    gl.uniform1i(uniforms.uEnvironment, 1);
    gl.uniform1i(uniforms.uTransferFunction, 2);

    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);
    gl.uniform2f(uniforms.uInverseResolution, 1 / this._resolution, 1 / this._resolution);
    gl.uniform1f(uniforms.uRandSeed, Math.random());
    gl.uniform1f(uniforms.uBlur, 0);

    gl.uniform1f(uniforms.uAbsorptionCoefficient, this.absorptionCoefficient);
    gl.uniform1f(uniforms.uScatteringCoefficient, this.scatteringCoefficient);
    gl.uniform1f(uniforms.uScatteringBias, this.scatteringBias);
    gl.uniform1f(uniforms.uMajorant, this.majorant);
    gl.uniform1ui(uniforms.uMaxBounces, this.maxBounces);
    gl.uniform1ui(uniforms.uSteps, this.steps);

    gl.bindBuffer(gl.SHADER_STORAGE_BUFFER, this._photonBuffer);
    gl.bindBufferBase(gl.SHADER_STORAGE_BUFFER, 0, this._photonBuffer);

    gl.bindImageTexture(0, this._renderBuffer, 0, false, 0, gl.WRITE_ONLY, gl.RGBA32F);

    const groups = this._resolution / this._workgroup;
    gl.dispatchCompute(groups, groups, 1);
}

}
