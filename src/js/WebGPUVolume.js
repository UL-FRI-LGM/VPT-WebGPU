import { WebGL } from './WebGL.js';
import { mat4, vec3, quat } from '../lib/gl-matrix-module.js';
// import skmeans from '../lib/skmeans.js';

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

    this.tfArray = [];
    for (let index = 0; index < 256 * 256; index++) {
        this.tfArray[index] = 0;
    }
    this.tfAccumulatedGM = null;
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

async readModality(modalityName) {
    this.ready = false;

    if (!this.metadata) {
        await this.readMetadata();
    }

    // console.log(this.metadata.modalities[0]);

    // const modality = this.metadata.modalities.find(modality => modality.name === modalityName);
    // if (!modality) {
    //     throw new Error(`Modality '${modalityName}' does not exist`);
    // }

    const modality = this.metadata.modalities[1]; // modalitiesRGBA ima 2 modalityja, dela, treba sam še dinamično to skp sestaut
    var modalityName = modality.name;
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

        device.queue.writeTexture(
            {
                label: 'Volume Texture',
                texture: this.texture,
                origin: [x, y, z]
            },
            this._typize(data, type),
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
}

// list arraybufferjeu
// concat(data) {
//     // console.log(data[0]);
//     let lim = 128;
//     let tf = null;
//     let sample = [];
//     let tempSample = null;
//     let labels = null;
//     let pointer = 0;
//     let reading = true;
//     let header = new Int32Array(4);
//     let offset = 0;
//     let count = 0;
//     let packageLen = 0;
//     let wholePackageLen = 0;
//     // console.log("tuki sm");
//     while(count < 3) { // nared tko da prebere use byte u svoje array
//         // console.log("zdej pa tle");
//         // console.log(pointer);

//         // console.log(data[pointer]);
//         header = new DataView(data[pointer]).getInt32(offset, true);
//         count = Number(header);
//         offset += 4;
//         header = new DataView(data[pointer]).getInt32(offset, true);
//         packageLen = Number(header);
//         offset += 4;
//         // console.log(count);
//         // console.log(packageLen);
//         if (count == 1) {
//             tf = new Array(packageLen);
//         }
//         else if (count == 2) {
//             tempSample = new Float32Array(11);
//         }
//         else if (count == 3) {
//             labels = new Int8Array(packageLen);
//         }
//         // console.log(offset);
//         // console.log(packageLen);
//         // console.log(data[data.length-1]);
        
//         let j = 0;
//         let prvaRunda = true;
//         let numFloats = 0;
//         for (; pointer < data.length; pointer++) {
//             if (pointer == data.length-1)
//                 lim = 6;
//             for (let k = prvaRunda ? 8 : 0; k < lim;) {
//                 if (count == 1) {
//                     if (j < packageLen)
//                     {
//                         tf[j] = new DataView(data[pointer]).getUint8(k);
//                         k++;
//                         j++
//                     }
//                     else 
//                     {
//                         reading = false;
//                         break;
//                     }
//                 }
//                 else if (count == 2) {
//                     //sample[j-offset] = new DataView(data[pointer]).getFloat32(k); // popravi, array vsebuje 11 dim vektorje!!!
//                     if (j < (packageLen/4))
//                     {
//                         if (numFloats < 11) 
//                         {
//                             // console.log(pointer);  
//                             tempSample[numFloats] = new DataView(data[pointer]).getFloat32(k, true);
//                             numFloats++;
//                         }
//                         else 
//                         {
//                             sample.push(tempSample);
//                             tempSample = new Float32Array(11);
//                             numFloats = 0;
//                         }
//                         k+=4;
//                         j++;
//                     }
//                     else 
//                     {
//                         reading = false;
//                         break;
//                     }
//                 }
//                 else if (count == 3) {
//                     if (j < packageLen) 
//                     {
//                         labels[j-offset] = new DataView(data[pointer]).getInt8(k, true);
//                         k++;
//                         j++;
//                     }
//                     else
//                     {
//                         reading = false;
//                         break;
//                     }
//                 }
//             }
//             prvaRunda = false;
//             if (!reading) {
//                 reading = true;
//                 break;
//             }
//         }
//         wholePackageLen += (packageLen+8);
//         offset = wholePackageLen%128; // problem: data[i] je 128B, offset naslednega branja se zamika znotrej tega. Rabm poračunat offset indexa posebej ne morem sam seštevat :(
//     }
//     // console.log(pointer);
//     // console.log(data.length);
//     return [tf, sample, labels];
// }

concat(data) {
    let tf = null;
    let sample = [];
    let tempSample = null;
    let labels = null;
    let header = new Int32Array(4);
    let offset = 0;
    let count = 0;
    let packageLen = 0;
  
    while(count < 3) {
        header = new DataView(data).getInt32(offset, true);
        count = Number(header);
        offset += 4;
        header = new DataView(data).getInt32(offset, true);
        packageLen = Number(header);
        offset += 4;

        if (count == 1) {
            tf = new Array(packageLen);
        }
        else if (count == 2) {
            tempSample = new Float32Array(11);
        }
        else if (count == 3) {
            labels = new Int8Array(packageLen);
        }
        
        let j = 0;
        let numFloats = 0;
        for (let k = offset; k < (packageLen + offset);) {
            if (count == 1) {
                tf[k-offset] = new DataView(data).getUint8(k);
                k++;
                j = k;
            }
            else if (count == 2) {
                if (numFloats < 11) 
                {
                    tempSample[numFloats] = new DataView(data).getFloat32(k, true);
                    numFloats++;
                }
                else 
                {
                    sample.push(tempSample);
                    tempSample = new Float32Array(11);
                    numFloats = 0;
                }
                k+=4;
                j = k;
            }
            else if (count == 3) {
                labels[k-offset] = new DataView(data).getInt8(k, true);
                k++;
                j = k;
            }
        }
        offset = j;
    }
    return [tf, sample, labels];
}

// // Stari readModalities za bekap
// async readModalities(which) {
//     this.ready = false;

//     if (!this.metadata) {
//         await this.readMetadata();
//     }

//     const modality = this.metadata.modalities[which]; // modalitiesRGBA ima 2 modalityja, dela, treba sam še dinamično to skp sestaut
//     var modalityName = modality.name;
//     if (!modality) {
//         throw new Error(`Modality '${modalityName}' does not exist`);
//     }

//     this.modality = modality;

//     console.log(this.modality);
//     console.log(this.metadata);
//     let fullvolume = [];

//     const { width, height, depth } = modality.dimensions;
//     const { format, internalFormat, type } = modality;

//     if (this.modality.name == 'tsne') {

//         // bom poskusu narest tko da ne rabm nč brat iz bvpja, tko da bom lhko morde celo polaufu to sam z kkšno zastavco v fajlu
//         console.log(fullvolume);
//         console.log("tuki preberi koordinate");
//         let testArr = [];
//         let allData = [];
//         for (const { index, position } of modality.placements) {
//             const data = await this._reader.readBlock(index);
//             const block = this.metadata.blocks[index];
//             const { width, height, depth } = block.dimensions;
//             const { x, y, z } = position;

//             // device.queue.writeTexture(
//             //     {
//             //         label: 'Volume Texture',
//             //         texture: this.texture,
//             //         origin: [x, y, z]
//             //     },
//             //     this._typize(data, type),
//             //     {
//             //         offset: 0,
//             //         bytesPerRow: width * 4,
//             //         rowsPerImage: height
//             //     },
//             //     {
//             //         width,
//             //         height,
//             //         depthOrArrayLayers: depth
//             //     }
//             // );

//             // console.log(data);
//             // allData = [...allData, data];
//             allData.push(data);
//             // testArr.push(this._typize(data, type));

//             const progress = (index + 1) / modality.placements.length;
//             this.dispatchEvent(new CustomEvent('progress', { detail: progress }));
//         }

//         // // prvo morem vidt kaj shranjujem v fullVolume spremenljivko, bom zamenju inpute
//         // const pyCode = spawn('python3', ['./processing.py', allInput[0], allInput[1], allInput[2], allInput[3], W, H, D]);
//         // let pyBuffer = await pyCode.stdout;
//         // let orderedData = this.concat(pyBuffer); // morem probat če actually dela, fingers crossed

//         // const total = allData.reduce((s, c) => s + c.length, 0);
//         // const allBytes = new Uint8Array(total);

//         // let offset = 0;
//         // for (const c of allData) {
//         //     allBytes.set(c, offset);
//         //     offset += c.length;
//         // }
//         // const allBytes = this.concat(...allData);
//         // console.log(allData);
//         let proba = this.concat(allData);
//         let tfproba = proba[0];
//         let sampleproba = proba[1];
//         let labelproba = proba[2];
//         console.log(sampleproba);
//         console.log(labelproba);

//         // // console.log(allData[0]);
//         // let lim = 128;
//         // let allBytes = new Array(allData.length*128);
//         // let pointer = 0;
//         // for (let i = 0; i < allData.length; i++) {
//         //     if (i == allData.length-1)
//         //         lim = 6;
//         //     for (let j = 0; j < lim; j++) {
//         //         allBytes[pointer] = new DataView(allData[i]).getUint8(j);
//         //         pointer++;
//         //     }
//         // }

//         // // console.log(allBytes);
//         // let testhead = new Array(8);
//         // // let testhead2 = new Array(4);
//         // for (let index = 0; index < 8; index++) {
//         //     // if (index < (8+256*256*4+20))
//         //     testhead[index] = allBytes[index];
//         //     // else
//         //     //     testhead2[index-(8+256*256*4+20)] = allBytes[index];
//         // }
//         // console.log(new Uint32Array(testhead));
//         // // console.log(testview.getUint32(4, true));

//         // for (let index = (8+256*256*4+16); index < (8+256*256*4+24); index++) {
//         //     // if (index < (8+256*256*4+20))
//         //     testhead[index-(8+256*256*4+16)] = allBytes[index];
//         //     // else
//         //     //     testhead2[index-(8+256*256*4+20)] = allBytes[index];
//         // }
//         // console.log(new Int32Array(testhead));
//         // // console.log(new Int32Array(testhead2));

//         // let img = new Array(256*256*4);
//         // for (let i = 8; i < (img.length + 8); i++) {
//         //     img[i-8] = allBytes[i];
//         // }

//         // let samples = new Array(allBytes.length - (256*256*4+4));
//         // for (let i = 4; i < (testimg.length + 4); i++) {
//         //     testimg[i-4] = allBytes[i];
//         // }

//         // let testimg = new Array(256*256*4);
//         // for (let i = 4; i < (testimg.length + 4); i++) {
//         //     testimg[i-4] = allBytes[i];
//         // }
//         // console.log(testimg);
//         // let tf = new Array(256*256*4);
//         // let tf = new Array(testimg);

//         // console.log("test kaj je pršlo iz bvpja");
//         // for (let index = 0; index < testArr.length; index++) {
//         //     console.log(testArr[0]);
//         // }
//         // console.log("testArr[2047] length: " + testArr[0].byteLength);
//         console.log("testArr:")
//         console.log(testArr);
//         console.log("tf array length: " + this.tfArray.length);
//         // let tf = new Array(256*256*4);
//         // let ix = 0;
//         // for (let i = 0; i < testArr.length; i++) {
//         //     for (let j = 0; j < testArr[i].length; j++) {
//         //         tf[ix] = testArr[i][j];
//         //         ix++;
//         //     }
//         //     // tf[i] = testArr[i];
//         //     // this.tfArray[i] = testArr[i];
//         // }
//         // console.log(tf);
//         this.tfArray = tfproba;
//         console.log(this.tfArray);
//         const imgData = new ImageData(Uint8ClampedArray.from(this.tfArray), 256, 256);
//         const canv = document.createElement('canvas');
//         canv.width = 256;
//         canv.height = 256;
//         const ctx = canv.getContext('2d');
//         ctx.putImageData(imgData, 0, 0);
//         this.tfAccumulatedGM = canv.toDataURL();
//         this.ready = true;
//         return;
//     }

//     // console.log(this.metadata.modalities[0]);

//     // const modality = this.metadata.modalities.find(modality => modality.name === modalityName);
//     // if (!modality) {
//     //     throw new Error(`Modality '${modalityName}' does not exist`);
//     // }

    


//     const device = this._device;
//     if (this.texture) {
//         this.texture.destroy();
//     }
//     this.texture = device.createTexture({
//         size: [width, height, depth],
//         dimension: "3d",
//         format: "rgba8unorm", // tle je format texture HARDCODAN
//         usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
//     });
//     this.textureSampler = device.createSampler({
//         magFilter: "linear",
//         minFilter: "linear"
//     });
//     // const _skmeans = skmeans;
    
//     let pointer = 0;
//     for (const { index, position } of modality.placements) {
//         console.log(index);
//         const data = await this._reader.readBlock(index);
//         const block = this.metadata.blocks[index];
//         const { width, height, depth } = block.dimensions;
//         const { x, y, z } = position;
//         const typedData = this._typize(data, type);
//         for (let i = 0; i < typedData.length; i++) {
//             fullvolume[pointer+i] = typedData[i];     
//         }
//         fullvolume.push([typedData, width, height, depth, x, y, z]);
//         // console.log(fullvolume);
//         // console.log(block);
        
//         pointer = fullvolume.length;
//         // console.log(typedData);
//         // let output = _skmeans(typedData, 4);
//         // console.log(output.idxs);
//         // console.log("typedData length: "+typedData.length)
//         // for (let i = 0; i < output.idxs.length; i+=2) {
//         //     this.tfArray[output.idxs[i+1] * 256 + output.idxs[i]]++;
//         // }
//         // for (let i = 0; i < typedData.length; i+=2) {
//         //     this.tfArray[typedData[i+1] * 256 + typedData[i]]++;
//         // }
//         // multidim.push(typedData);
//     }

//     // const prepdata = this._typize(fullvolume);
//     // let rchan = [];
//     // let gchan = [];
//     // let bchan = [];
//     // let achan = [];

//     // let ds = [];

//     // for (let index = 0; index < fullvolume.length; index+=4) {
//     //     // rchan[index] = prepdata[r];
//     //     // gchan[index] = prepdata[g];
//     //     // bchan[index] = prepdata[b];
//     //     // achan[index] = prepdata[a];
//     //     // ds[index] = [prepdata[r],[prepdata[g],[prepdata[b],[prepdata[a]]]]];
//     //     ds.push([fullvolume[index], fullvolume[index+1], fullvolume[index+2], fullvolume[index+3]]); // Rabm premislt kku delat z Voxli, ker tuki delam tsne na slojih textur kr je pomojm narobe
//     // } // preglej si coresete za tSNE

//     // // let dataset = [new Uint8ClampedArray(rchan), new Uint8ClampedArray(gchan), new Uint8ClampedArray(bchan), new Uint8ClampedArray(achan)];
//     // // let dists = [[1.0, 0.1, 0.2], [0.1, 1.0, 0.3], [0.2, 0.1, 1.0]];
//     // // console.log(proba);
//     // console.log(ds);
//     // // // console.log("this.tfArray length: "+this.tfArray.length);
//     // console.log("ds dolzina: " + ds.length + ", base array dolzina: " + fullvolume.length);

//     // let test = new tsnejs.tSNE({
//     //     dim: 2,
//     //     perplexity: 1.0,
//     //     epsilon: 100.0,
//     // });

//     // test.initDataRaw(ds);

//     // for (let k = 0; k < 500; k++) {
//     //     test.step();
//     // }

//     // // console.log(error);

//     // let output = test.getSolution();

//     // console.log(output);

//     // let remainingBlocks = modality.placements.length;
//     for (const { index, position } of modality.placements) {
//         const data = await this._reader.readBlock(index);
//         const block = this.metadata.blocks[index];
//         const { width, height, depth } = block.dimensions;
//         const { x, y, z } = position;
//         const typedData = this._typize(data, type);
//         // console.log(typedData);

//         // for (let i = 0; i < typedData.length; i+=2) {
//         //     this.tfArray[typedData[i+1] * 256 + typedData[i]]++;
//         // }

//         // remainingBlocks--;
//         // if (remainingBlocks === 0) {
//         //     // const m = Math.log(Math.max(...this.tfArray));
//         //     // console.log(m);
//         //     // let tf = new Array(this.tfArray.length * 4);
//         //     // for (let j = 0; j < this.tfArray.length; j++) {
//         //     //     const v = 255 - Math.log(this.tfArray[j]) / m * 255;
//         //     //     tf[4*j] = v;
//         //     //     tf[4*j+1] = v;
//         //     //     tf[4*j+2] = v;
//         //     //     tf[4*j+3] = 255;
//         //     // }
//         //     // this.tfArray = tf;
//         //     // console.log("output length: "+output.idxs.length+", this.tfArray length: "+this.tfArray.length);
//         //     // console.log(this.tfArray);
//         //     // const imgData = new ImageData(Uint8ClampedArray.from(this.tfArray), 256, 256);
//         //     // const canv = document.createElement('canvas');
//         //     // canv.width = 256;
//         //     // canv.height = 256;
//         //     // const ctx = canv.getContext('2d');
//         //     // ctx.putImageData(imgData, 0, 0);
//         //     // this.tfAccumulatedGM = canv.toDataURL();
//         // }

//         device.queue.writeTexture(
//             {
//                 label: 'Volume Texture',
//                 texture: this.texture,
//                 origin: [x, y, z]
//             },
//             this._typize(data, type),
//             {
//                 offset: 0,
//                 bytesPerRow: width * 4,
//                 rowsPerImage: height
//             },
//             {
//                 width,
//                 height,
//                 depthOrArrayLayers: depth
//             }
//         );

//         const progress = (index + 1) / modality.placements.length;
//         this.dispatchEvent(new CustomEvent('progress', { detail: progress }));
//     }
    
//     // backup (preden sem uturu tSNE notr - dela)
//     // for (const { index, position } of modality.placements) {
//     //     const data = await this._reader.readBlock(index);
//     //     const block = this.metadata.blocks[index];
//     //     const { width, height, depth } = block.dimensions;
//     //     const { x, y, z } = position;
//     //     const typedData = this._typize(data, type);
//     //     console.log(typedData);
//     //     for (let i = 0; i < typedData.length; i+=2) {
//     //         this.tfArray[typedData[i+1] * 256 + typedData[i]]++;
//     //     }
//     //     remainingBlocks--;
//     //     if (remainingBlocks === 0) {
//     //         const m = Math.log(Math.max(...this.tfArray));
//     //         let tf = new Array(this.tfArray.length * 4);
//     //         for (let j = 0; j < this.tfArray.length; j++) {
//     //             const v = 255 - Math.log(this.tfArray[j]) / m * 255;
//     //             tf[4*j] = v;
//     //             tf[4*j+1] = v;
//     //             tf[4*j+2] = v;
//     //             tf[4*j+3] = 255;
//     //         }
//     //         this.tfArray = tf;
//     //         // console.log(this.tfArray);
//     //         const imgData = new ImageData(Uint8ClampedArray.from(this.tfArray), 256, 256);
//     //         const canv = document.createElement('canvas');
//     //         canv.width = 256;
//     //         canv.height = 256;
//     //         const ctx = canv.getContext('2d');
//     //         ctx.putImageData(imgData, 0, 0);
//     //         this.tfAccumulatedGM = canv.toDataURL();
//     //     }

//     //     device.queue.writeTexture(
//     //         {
//     //             label: 'Volume Texture',
//     //             texture: this.texture,
//     //             origin: [x, y, z]
//     //         },
//     //         this._typize(data, type),
//     //         {
//     //             offset: 0,
//     //             bytesPerRow: width * 4,
//     //             rowsPerImage: height
//     //         },
//     //         {
//     //             width,
//     //             height,
//     //             depthOrArrayLayers: depth
//     //         }
//     //     );

//     //     const progress = (index + 1) / modality.placements.length;
//     //     this.dispatchEvent(new CustomEvent('progress', { detail: progress }));
//     // }

//     this.ready = true;
// }

// Stari readModalities za bekap
async readModalities(index) {
    this.ready = false;

    if (!this.metadata) {
        await this.readMetadata();
    }

    let fullvolume = [];
    const device = this._device;
    console.log(this.metadata.modalities.length);
    const modality = this.metadata.modalities[index];
    var modalityName = modality.name;
    if (!modality) {
        throw new Error(`Modality '${modalityName}' does not exist`);
    }
    this.modality = modality;
    const canv = document.createElement('canvas');
    canv.width = 256;
    canv.height = 256;
    const ctx = canv.getContext('2d');
    if (modalityName == 'tsne') {
        const clusterModality = this.metadata.modalities[index-1];
        const { width, height, depth } = clusterModality.dimensions;
        const { format, internalFormat, type } = clusterModality;
        let pointer = 0;
        for (const { index, position } of clusterModality.placements) {
            const data = await this._reader.readBlock(index);
            const block = this.metadata.blocks[index];
            const typedData = this._typize(data, type);
            for (let i = 0; i < typedData.length; i++, pointer++) {
                fullvolume[pointer] = typedData[i];
            }
        }
        let test = new Uint8ClampedArray(fullvolume);
        let header = new Uint32Array(5);
        header[0] = width;
        header[1] = height;
        header[2] = depth;
        header[3] = (test.length/(width*height*depth));
        header[4] = test.length;
        let tfproba = null;
        let sampleproba = null;
        let labelproba = null;
        // console.log(test);
        let args = [header[0], header[1], header[2], header[3], header[4], ...test]; // problem: stvar je u stringu ne v dejanskih bajtih!!!!
        await fetch('/process', {
            method: 'POST',
            body: args,
            headers: { 'Content-Type': 'application/octet-stream' }
        })
        .then(r => r.arrayBuffer())
        .then(buf => {
            // const bytes = new Uint8Array(buf);
            // // decode volume / labels / samples here
            // // prvo morem vidt kaj shranjujem v fullVolume spremenljivko, bom zamenju inpute
            let orderedData = this.concat(buf); // morem probat če actually dela, fingers crossed
            tfproba = orderedData[0];
            sampleproba = orderedData[1];
            labelproba = orderedData[2];
            console.log(sampleproba);
            console.log(labelproba);
            console.log("tfproba:")
            console.log(tfproba);
        });
        console.log("tf array length: " + this.tfArray.length);
        this.tfArray = tfproba;
        console.log(this.tfArray);
        const imgData = new ImageData(Uint8ClampedArray.from(this.tfArray), 256, 256);
        console.log(imgData);
        ctx.putImageData(imgData, 0, 0);
        this.tfAccumulatedGM = canv.toDataURL();
        // console.log(this.tfAccumulatedGM);
    }
    else {
        console.log(this.modality);
        console.log(this.metadata);

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
    }

    this.ready = true;
    return;
}

async load() {
    await this.readModality('default');
}

// async loadAll(which) {
//     await this.readModalities(which); // rewrite da bo nalagalo use!!!
// }

async loadAll(index) {
    await this.readModalities(index); // rewrite da bo nalagalo use!!!
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
