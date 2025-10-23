import { PropertyBag } from '../PropertyBag.js';
import { WebGPU } from '../WebGPU.js';
import { WebGPUSingleBuffer } from '../WebGPUSingleBuffer.js';

export class WebGPUAbstractComputeRenderer extends PropertyBag {

constructor(device, volume, camera, environment, options = {}) {
    super();

    this._resolution = options.resolution ?? 512;
    this._workgroup_size = options.workgroup_size ?? [8, 8];

    this._device = device;
    this._volume = volume;
    this._camera = camera;
    this._environment = environment;

    this._rebuildBuffers();

    this._transferFunction1 = WebGPU.createTextureFromTypedArray(
        device,
        [2, 1],
        new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),
        "rgba8unorm-srgb"
    );
    this._transferFunction2 = WebGPU.createTextureFromTypedArray(
        device,
        [2, 1],
        new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),
        "rgba8unorm-srgb"
    );
    this._transferFunction3 = WebGPU.createTextureFromTypedArray(
        device,
        [2, 1],
        new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),
        "rgba8unorm-srgb"
    );
    this._transferFunction4 = WebGPU.createTextureFromTypedArray(
        device,
        [2, 1],
        new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),
        "rgba8unorm-srgb"
    );
    this._transferFunctionSampler1 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler2 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler3 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler4 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
}

destroy() {
    this._renderBuffer.destroy();

    this._transferFunction1.destroy();
    this._transferFunction2.destroy();
    this._transferFunction3.destroy();
    this._transferFunction4.destroy();
}

render() {
    this._renderFrame();
}

reset() {
    this._resetFrame();
}

_rebuildBuffers() {
    if (this._renderBuffer) {
        this._renderBuffer.destroy();
    }
    const device = this._device;
    this._renderBuffer = new WebGPUSingleBuffer(device, this._getRenderBufferSpec());
}

setVolume(volume) {
    this._volume = volume;
    this.reset();
}

setTransferFunction1(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction1) {
        this._transferFunction1.destroy();
    }
    this._transferFunction1 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction2(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction2) {
        this._transferFunction2.destroy();
    }
    this._transferFunction2 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction3(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction3) {
        this._transferFunction3.destroy();
    }
    this._transferFunction3 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction4(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction4) {
        this._transferFunction4.destroy();
    }
    this._transferFunction4 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}

setResolution(resolution) {
    if (resolution !== this._resolution) {
        this._resolution = resolution;
        this._rebuildBuffers();
        this.reset();
    }
}

getTexture() {
    return this._renderBuffer.getAttachments()[0].texture;
}

getTextureSampler() {
    return this._renderBuffer.getAttachments()[0].sampler;
}

_resetFrame() {
    // IMPLEMENT
}

_renderFrame() {
    // IMPLEMENT
}

_getRenderBufferSpec() {
    return [{
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "nearest",
            minFilter: "nearest"
        }
    }];
}

_getWorkgroupCount() {
    return [
        Math.ceil(this._resolution / this._workgroup_size[0]),
        Math.ceil(this._resolution / this._workgroup_size[1])
    ]
}

}
