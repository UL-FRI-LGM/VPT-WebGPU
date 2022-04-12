// #part /js/WebGPUVolume

// #link WebGPU

class WebGPUVolume {

constructor(device, reader, options) {
    Object.assign(this, {
        ready: false
    }, options);

    this._device = device;
    this._reader = reader;

    this.meta       = null;
    this.modalities = null;
    this.blocks     = null;
    this._texture   = null;
}

destroy() {
    // const gl = this._gl;
    // if (this._texture) {
    //     gl.deleteTexture(this._texture);
    // }

    if (this._texture) {
        this._texture.destroy();
        this._texture = null;
    }
}

readMetadata(handlers) {
    if (!this._reader) {
        return;
    }
    this.ready = false;
    this._reader.readMetadata({
        onData: data => {
            this.meta = data.meta;
            this.modalities = data.modalities;
            this.blocks = data.blocks;
            handlers.onData && handlers.onData();
        }
    });
}

readModality(modalityName, handlers) {
    if (!this._reader || !this.modalities) {
        return;
    }
    this.ready = false;
    const modality = this.modalities.find(modality => modality.name === modalityName);
    if (!modality) {
        return;
    }
    const dimensions = modality.dimensions;
    const components = modality.components;
    const blocks = this.blocks;

    if (this._texture) {
        this._texture.destroy();
    }
    this._texture = this._device.createTexture({
        size: [dimensions.width, dimensions.height, dimensions.depth],
        dimension: "3d",
        format: "r8unorm", // TODO
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    // this._texture = this._device.createTexture({
    //     size: [256, 256, 256],
    //     dimension: "3d",
    //     format: "r8unorm", // TODO
    //     usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    // });

    // let ones = new Uint8Array(256 * 256 * 256);
    // for (let i = 0; i < 256 * 256 * 256; ++i) {
    //     ones[i] = 255;
    // }

    // this._device.queue.writeTexture(
    //     {
    //         texture: this._texture,
    //         origin: [0,0,0]
    //     },
    //     ones,
    //     {
    //         offset: 0,
    //         bytesPerRow: 256,
    //         rowsPerImage: 256
    //     },
    //     { width: 256, height: 256, depthOrArrayLayers: 256 }
    // );



    // gl.texStorage3D(gl.TEXTURE_3D, 1, modality.internalFormat,
    //     dimensions.width, dimensions.height, dimensions.depth);
    let remainingBlocks = modality.placements.length;
    modality.placements.forEach(placement => {
        this._reader.readBlock(placement.index, {
            onData: data => {
                const position = placement.position;
                const block = blocks[placement.index];
                const blockdim = block.dimensions;

                // format: 6403, // RED
                // internalFormat: 33321, // R8
                // type: 5121, // UNSIGNED_BYTE

                this._device.queue.writeTexture(
                    {
                        texture: this._texture,
                        origin: [position.x, position.y, position.z]
                    },
                    this._typize(data, modality.type),
                    {
                        offset: 0, // ((position.z * blockdim.height + position.y) * blockdim.width + position.x) * 1,
                        bytesPerRow: blockdim.width * 1,
                        rowsPerImage: blockdim.height
                    },
                    { width: blockdim.width, height: blockdim.height, depthOrArrayLayers: blockdim.depth }
                );

                remainingBlocks--;
                if (remainingBlocks === 0) {
                    this.ready = true;
                    handlers.onLoad && handlers.onLoad();
                }
            }
        });
    });
}

_typize(data, type) {
    // const gl = this._gl;
    // switch (type) {
    //     case gl.BYTE:                         return new Int8Array(data);
    //     case gl.UNSIGNED_BYTE:                return new Uint8Array(data);
    //     case gl.UNSIGNED_BYTE:                return new Uint8ClampedArray(data);
    //     case gl.SHORT:                        return new Int16Array(data);
    //     case gl.UNSIGNED_SHORT:               return new Uint16Array(data);
    //     case gl.UNSIGNED_SHORT_5_6_5:         return new Uint16Array(data);
    //     case gl.UNSIGNED_SHORT_5_5_5_1:       return new Uint16Array(data);
    //     case gl.UNSIGNED_SHORT_4_4_4_4:       return new Uint16Array(data);
    //     case gl.INT:                          return new Int32Array(data);
    //     case gl.UNSIGNED_INT:                 return new Uint32Array(data);
    //     case gl.UNSIGNED_INT_5_9_9_9_REV:     return new Uint32Array(data);
    //     case gl.UNSIGNED_INT_2_10_10_10_REV:  return new Uint32Array(data);
    //     case gl.UNSIGNED_INT_10F_11F_11F_REV: return new Uint32Array(data);
    //     case gl.UNSIGNED_INT_24_8:            return new Uint32Array(data);
    //     case gl.HALF_FLOAT:                   return new Uint16Array(data);
    //     case gl.FLOAT:                        return new Float32Array(data);
    //     default: throw new Error('Unknown volume datatype: ' + type);
    // }

    return new Uint8Array(data);
}

getTextureView() {
    if (this.ready) {
        return this._texture.createView({ dimension: "3d" });
    } else {
        return null;
    }
}

setFilter(filter) {
    if (!this._texture) {
        return;
    }

    // const gl = this._gl;
    // filter = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    // gl.bindTexture(gl.TEXTURE_3D, this._texture);
    // gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
    // gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
}

}
