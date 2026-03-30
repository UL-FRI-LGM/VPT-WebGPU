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

    this._visMode = 0;
    this._minCutPlane = new Float32Array([0.0, 0.0, 0.0]);
    this._maxCutPlane = new Float32Array([1.0, 1.0, 1.0]);
    this._viewCutDistance = 0.0;

    this._rebuildBuffers();

    this._transferFunction1 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction2 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction3 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction4 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction5 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction6 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction7 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction8 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction1D_1 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction1D_2 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction1D_3 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
        "rgba8unorm-srgb"
    );
    this._transferFunction1D_4 = WebGPU.createTextureFromTypedArray(
        device,
        [1, 1],
        new Uint8Array([0, 0, 0, 0]),
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
    this._transferFunctionSampler5 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler6 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler7 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler8 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler1D_1 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler1D_2 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler1D_3 = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._transferFunctionSampler1D_4 = device.createSampler({
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
    this._transferFunction5.destroy();
    this._transferFunction6.destroy();
    this._transferFunction7.destroy();
    this._transferFunction8.destroy();
    this._transferFunction1D_1.destroy();
    this._transferFunction1D_2.destroy();
    this._transferFunction1D_3.destroy();
    this._transferFunction1D_4.destroy();
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

setVisMode(visMode) {
    this._visMode = visMode;
}

setMinCutPlane(minCutPlane) {
    this._minCutPlane = new Float32Array(minCutPlane);
}

setMaxCutPlane(maxCutPlane) {
    this._maxCutPlane = new Float32Array(maxCutPlane);
}

setViewCutDistance(viewCutDistance) {
    this._viewCutDistance = viewCutDistance;
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
setTransferFunction5(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction5) {
        this._transferFunction5.destroy();
    }
    this._transferFunction5 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction6(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction6) {
        this._transferFunction6.destroy();
    }
    this._transferFunction6 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction7(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction7) {
        this._transferFunction7.destroy();
    }
    this._transferFunction7 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction8(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction8) {
        this._transferFunction8.destroy();
    }
    this._transferFunction8 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction1D_1(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction1D_1) {
        this._transferFunction1D_1.destroy();
    }
    this._transferFunction1D_1 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction1D_2(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction1D_2) {
        this._transferFunction1D_2.destroy();
    }
    this._transferFunction1D_2 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction1D_3(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction1D_3) {
        this._transferFunction1D_3.destroy();
    }
    this._transferFunction1D_3 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
}
setTransferFunction1D_4(transferFunction) {
    const device = this._device;
    // TODO: Consider not re-creating the texture if it's the same size
    if (this._transferFunction1D_4) {
        this._transferFunction1D_4.destroy();
    }
    this._transferFunction1D_4 = WebGPU.createTextureFromImageBitmapOrCanvas(device, transferFunction, "rgba8unorm-srgb");
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
