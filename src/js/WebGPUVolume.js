import { WebGL } from './WebGL.js';
import { mat4, vec3, quat } from '../lib/gl-matrix-module.js';

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
    // this.modelmat = mat4.fromRotationTranslationScale(mat4.create(), quat.fromEuler(quat.create(), 0,0,0), vec3.fromValues(0,0,0), vec3.normalize(vec3.create(), vec3.fromValues(1024, 1024, 30))); //hardcoded
    this.modelmat = mat4.fromRotationTranslationScale(mat4.create(), quat.fromEuler(quat.create(), 0,0,0), vec3.fromValues(-0.5,-0.5,-0.5), vec3.fromValues(1,1,1)); //hardcoded
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
    // console.log(this.metadata);
    return this.metadata;
}

async readModalities(index) {
    this.ready = false;

    if (!this.metadata) {
        await this.readMetadata();
    }

    let fullvolume = [];
    const device = this._device;
    // console.log(this.metadata.modalities.length);
    const modality = this.metadata.modalities[index];
    var modalityName = modality.name;
    if (!modality) {
        throw new Error(`Modality '${modalityName}' does not exist`);
    }
    this.modality = modality;
    const { width, height, depth } = modality.dimensions;
    const { format, internalFormat, type } = modality;

    if (this.texture) {
        this.texture.destroy();
    }
    this.texture = device.createTexture({
        size: [width, height, depth],
        dimension: "3d",
        format: "rgba8unorm", // tle je format texture HARDCODAN
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
        const typedData = this._typize(data, type);
        fullvolume.push(typedData);

        device.queue.writeTexture(
            {
                label: 'Volume Texture',
                texture: this.texture,
                origin: [x, y, z]
            },
            typedData,
            {
                offset: 0,
                bytesPerRow: width * 4,
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
    console.log([width, height, depth]);
    return [width, height, depth];
}

async load() {
    await this.readModality('default');
}

async loadAll(index) {
    await this.readModalities(index);
}

async loadBlank() {
    const data = new Uint8Array([0, 0, 0, 0]);
    this.texture = this._device.createTexture({
        size: [1, 1, 1],
        dimension: "3d",
        format: "rgba8unorm", // tle je format texture HARDCODAN
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.textureSampler = this._device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });
    this._device.queue.writeTexture(
        {
            label: 'Blank Texture',
            texture: this.texture,
            origin: [0, 0, 0]
        },
        data,
        {},
        {
            width: 1, 
            height: 1
        }
    );
    this.ready = true;
    return this.texture
}

async loadMask(samples, labels, colors, width, height, depth) {
    // console.log(colors);
    this.texture = this._device.createTexture({
        size: [ width, height, depth ],
        dimension: "3d",
        format: "rgba8unorm", // tle je format texture HARDCODAN
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.textureSampler = this._device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });

    // console.log(samples.length);
    // console.log(labels.length);
    // let i = 0;
    let data = new Uint8ClampedArray((width * height * depth * 4)); // tle je treba sestavt podatke skp predn jih pošlem v texturo
    for (let index = 0; index < samples.length; index++) {
        // pejd čez samples array, tm kjer ima sample koordinato, vstavi notr barve v data array
        const x = samples[index][2] * width;
        const y = samples[index][3] * height;
        const z = samples[index][4] * depth;
        const voxelIndex = (x + y * width + z * width * height) * 4;
        const label = labels[index];
        
        if (label !== -1 && label !== undefined && colors[label]) {
            data[voxelIndex] = colors[label][0];
            data[voxelIndex+1] = colors[label][1];
            data[voxelIndex+2] = colors[label][2];
            data[voxelIndex+3] = 255;
            // data[voxelIndex] = 255;
            // data[voxelIndex+1] = 255;
            // data[voxelIndex+2] = 255;
        }
        else {
            // i++;
            data[voxelIndex] = 0;
            data[voxelIndex+1] = 0;
            data[voxelIndex+2] = 0;
            data[voxelIndex+3] = 0;
        }
        // data[voxelIndex] = 255;
        // data[voxelIndex+1] = 255;
        // data[voxelIndex+2] = 255;
        // data[voxelIndex+3] = 255;
    }
    // console.log("kol. vokslov ki naj bi bili sum: "+i)

    this._device.queue.writeTexture(
        {
            label: 'Cluster Mask Texture',
            texture: this.texture,
            origin: [0, 0, 0]
        },
        data,
        {
            offset: 0,
            bytesPerRow: width * 4,
            rowsPerImage: height
        },
        {
            width: width, 
            height: height,
            depthOrArrayLayers: depth
        }
    );
    this.ready = true;
}


_typize(data, type) {
    return new Uint8ClampedArray(data); // TODO

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

getModelMatrix() {
    return this.modelmat;
}

setModelMatrix(r, t, s) {
    this.modelmat = mat4.fromRotationTranslationScale(this.modelmat, r, t, s);
}

}
