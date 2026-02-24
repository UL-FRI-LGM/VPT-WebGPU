import { WebGL } from './WebGL.js';
import { mat4 } from '../lib/gl-matrix-module.js';

export function centerModelMatrix(matrix) {
    mat4.translate(matrix, matrix, [-0.5, -0.5, -0.5]);
    return matrix;
}

export class WebGPUVolume extends EventTarget {

constructor(device, reader, options = {}) {
    super();

    this._device = device;
    this._reader = reader;

    this.metadata = null;
    this.ready = false;
    this.texture = null;
    this.textureSampler = null;
    this.modality = null;
    this.modelMatrix = centerModelMatrix(mat4.create());
}

destroy() {
    return; // TODO

    const gl = this._gl;
    if (this.texture) {
        gl.deleteTexture(this.texture);
    }
}

async readMetadata() {
    if (!this.metadata) {
        this.metadata = await this._reader.readMetadata();
    }
    return this.metadata;
}

async readModality(modalityName) {
    this.ready = false;

    if (!this.metadata) {
        await this.readMetadata();
    }

    const modality = this.metadata.modalities.find(modality => modality.name === modalityName);
    if (!modality) {
        throw new Error(`Modality '${modalityName}' does not exist`);
    }

    this.modality = modality;

    const { width, height, depth } = modality.dimensions;
    const { format, internalFormat, type } = modality;
    
    const device = this._device;
    if (this.texture) {
        this.texture.destroy();
    }
    this.texture = device.createTexture({
        size: [width, height, depth],
        dimension: "3d",
        format: "r8unorm", // TODO
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.textureSampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });


    for (const { index, position } of modality.placements) {
        const data = await this._reader.readBlock(index);
        const block = this.metadata.blocks[index];
        const { width, height, depth } = block.dimensions;
        const { x, y, z } = position;

        device.queue.writeTexture(
            {
                texture: this.texture,
                origin: [x, y, z]
            },
            this._typize(data, type),
            {
                offset: 0,
                bytesPerRow: width * 1,
                rowsPerImage: height
            },
            {
                width,
                height,
                depthOrArrayLayers: depth
            }
        );

        const progress = (index + 1) / modality.placements.length;
        this.dispatchEvent(new CustomEvent('progress', { detail: progress }));
    }

    this.ready = true;
}

async load() {
    await this.readModality('default');
}

_typize(data, type) {
    return new Uint8Array(data); // TODO

    const gl = this._gl;
    switch (type) {
        case gl.BYTE:                         return new Int8Array(data);
        case gl.UNSIGNED_BYTE:                return new Uint8Array(data);
        case gl.UNSIGNED_BYTE:                return new Uint8ClampedArray(data);
        case gl.SHORT:                        return new Int16Array(data);
        case gl.UNSIGNED_SHORT:               return new Uint16Array(data);
        case gl.UNSIGNED_SHORT_5_6_5:         return new Uint16Array(data);
        case gl.UNSIGNED_SHORT_5_5_5_1:       return new Uint16Array(data);
        case gl.UNSIGNED_SHORT_4_4_4_4:       return new Uint16Array(data);
        case gl.INT:                          return new Int32Array(data);
        case gl.UNSIGNED_INT:                 return new Uint32Array(data);
        case gl.UNSIGNED_INT_5_9_9_9_REV:     return new Uint32Array(data);
        case gl.UNSIGNED_INT_2_10_10_10_REV:  return new Uint32Array(data);
        case gl.UNSIGNED_INT_10F_11F_11F_REV: return new Uint32Array(data);
        case gl.UNSIGNED_INT_24_8:            return new Uint32Array(data);
        case gl.HALF_FLOAT:                   return new Uint16Array(data);
        case gl.FLOAT:                        return new Float32Array(data);
        default: throw new Error('Unknown volume datatype: ' + type);
    }
}

getTexture() {
    if (!this.ready) {
        return null;
    }
    return this.texture;
}

getTextureSampler() {
    if (!this.ready) {
        return null;
    }
    return this.textureSampler;
}

setFilter(filter) {
    const device = this._device;
    this.textureSampler = device.createSampler({
        magFilter: filter,
        minFilter: filter
    });
}

}
