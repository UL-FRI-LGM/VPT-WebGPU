export class WebGPU {

/**
 * Create WebGPU buffer from a typed array
 * @param {GPUDevice} device 
 * @param {TypedArray} data 
 * @param {GPUBufferUsageFlags} usage
 * @returns {GPUBuffer}
 */
static createBuffer(device, data, usage) {
    let buffer = device.createBuffer({
        size: (data.byteLength + 3) & ~3,
        usage,
        mappedAtCreation: true
    });
    new data.constructor(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
}

/**
 * Create texture from typed array
 * @param {GPUDevice} device 
 * @param {number[]} size 
 * @param {TypedArray} data 
 * @param {string} format 
 * @param {number} usage 
 * @returns {GPUTexture}
 */
static createTextureFromTypedArray(
        device, // device
        size, // [2, 1]
        data, // new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255])
        format = "rgba8unorm", // "default: rgba8unorm-srgb"
        usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
) {
    if (data.byteLength % (size[0] * size[1]) !== 0) {
        console.warn(`Data byte length (${data.byteLength}) not divisible by size (${size})`);
    }
    // TODO: Infer bytes per texel from format
    const bytesPerRow = Math.floor(data.byteLength / size[1]);
    let texture = device.createTexture({ size, format, usage });
    device.queue.writeTexture({ texture }, data, { bytesPerRow }, size);
    return texture
}

/**
 * Create texture from external image
 * @param {GPUDevice} device 
 * @param {ImageBitmap|HTMLCanvasElement} source 
 * @param {string} format
 * @param {number} usage
 * @returns {GPUTexture}
 */
static createTextureFromImageBitmapOrCanvas(
        device,
        source,
        format = "rgba8unorm",
        usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
) {
    const size = [source.width, source.height];
    const texture = device.createTexture({ size, format, usage });
    device.queue.copyExternalImageToTexture({ source }, { texture }, size)
    return texture;
}

/**
 * Insert mixins into shaders and build shader modules
 * @param {GPUDevice} device 
 * @param {Object<string, string>} shaders 
 * @param {Object<string, string>} mixins 
 * @returns {Object<string, GPUShaderModule>}
 */
static buildShaderModules(device, shaders, mixins) {
    const cooked = {};
    for (const name in shaders) {
        cooked[name] = shaders[name].replace(/#include <(\S+)>/g, (_, path) => {
            let struct = mixins;
            for (const part of path.split('/')) {
                struct = struct[part];
            }
            return struct;
        });
    }

    // console.log(cooked);

    const modules = {};
    for (const name in cooked) {
        try {
            const code = cooked[name];
            modules[name] = device.createShaderModule({ code });
        } catch (e) {
            e.message = `Error compiling and building ${name}:\n${e.message}`;
            throw e;
        }
    }

    return modules;
}

/**
 * Get fallback texture for handling errors
 * @param {GPUDevice} device 
 * @returns {Object<string, GPUObjectBase}
 */
static getFallbackTexture(device) {
    if (this._fallbackTexture) {
        return this._fallbackTexture;
    }

    this._fallbackTexture = {
        texture: WebGPU.createTextureFromTypedArray(device, [1, 1], new Uint8Array([255, 255, 255, 255]), "rgba8unorm"),
        sampler: device.createSampler()
    };
    return this._fallbackTexture;
}
static _fallbackTexture = undefined;

}
