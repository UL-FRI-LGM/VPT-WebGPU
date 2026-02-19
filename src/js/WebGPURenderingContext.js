import { WebGPU } from './WebGPU.js';
import { Ticker } from './Ticker.js';

import { Node } from './Node.js';
import { PerspectiveCamera } from './PerspectiveCamera.js';
import { WebGPUVolume } from './WebGPUVolume.js';

import { WebGPURendererFactory } from './renderers/WebGPURendererFactory.js';
import { WebGPUToneMapperFactory } from './tonemappers/WebGPUToneMapperFactory.js';

import { CircleAnimator } from './animators/CircleAnimator.js';
import { OrbitCameraAnimator } from './animators/OrbitCameraAnimator.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPURenderingContext extends EventTarget {

constructor(onInitialized, options = {}) {
    super();

    this.render = this.render.bind(this);

    this.canvas = document.createElement('canvas');

    // TODO: Find a better way to do this
    this.initWebGPU().then(() => {
        this.volume = new WebGPUVolume(this.device)
        // this.volume = [ new WebGPUVolume(this.device) ];
        onInitialized();
    });

    this.resolution = options.resolution ?? 512;
    this.filter = options.filter ?? 'linear';

    this.camera = new Node();
    this.camera.transform.localTranslation = [0, 0, 2];
    this.camera.components.push(new PerspectiveCamera(this.camera));

    this.camera.transform.addEventListener('change', e => {
        if (this.renderer) {
            this.renderer.reset();
        }
    });

    //this.cameraAnimator = new CircleAnimator(this.camera, {
    //    center: [0, 0, 2],
    //    direction: [0, 0, 1],
    //    radius: 0.01,
    //    frequency: 1,
    //});
    this.cameraAnimator = new OrbitCameraAnimator(this.camera, this.canvas);

    this.reader = null;

    this.tfArray = [];
    for (let index = 0; index < 256 * 256; index++) {
        this.tfArray[index] = 0;
    }
    this.tfAccumulatedGM = null;

    // this.volume = new WebGPUVolume(this.device);
}

// ============================ WEBGPU SUBSYSTEM ============================ //

async initWebGPU() {
    if (!navigator.gpu) {
        throw new Error("WebGPU not supported");
    }

    this.adapter = await navigator.gpu.requestAdapter();
    this.device = await this.adapter.requestDevice();
    const device = this.device;

    this.context = this.canvas.getContext("webgpu");
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
        device,
        format: this.canvasFormat
    });

    const module = device.createShaderModule({ code: SHADERS.quad });
    this.pipeline = device.createRenderPipeline({
        label: "WebGPURenderingContext render pipeline",
        layout: "auto",
        vertex: {
            module,
            entryPoint: "vertex_main"
        },
        fragment: {
            module,
            entryPoint: "fragment_main",
            targets: [{ format: this.canvasFormat }]
        }
    });

    this.sampler = device.createSampler({
        magFilter: "nearest",
        minFilter: "nearest"
    });

    this.environment = {
        texture: WebGPU.createTextureFromTypedArray(
            device,
            [1, 1],
            new Uint8Array([255, 255, 255, 255]),
            "rgba8unorm" // TODO: HDRI & OpenEXR support
        ),
        sampler: device.createSampler({
            magFilter: "linear",
            minFilter: "linear"
        })
    };
}

resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.camera.getComponent(PerspectiveCamera).aspect = width / height;
}

// async setVolume(reader) {
//     console.log("Pre-import volume:")
//     console.log(this.volume);
//     this.volume = new WebGPUVolume(this.device, reader);
//     this.volume.addEventListener('progress', e => {
//         this.dispatchEvent(new CustomEvent('progress', { detail: e.detail }));
//     });
//     await this.volume.load();
//     this.volume.setFilter(this.filter);
//     if (this.renderer) {
//         this.renderer.setVolume(this.volume);
//     }
//     console.log("Post-import volume:")
//     console.log(this.volume);
// }

// to treba dodelat da bo dejansko shranlo vsak volumen v tabelo
// to bi pol uporabu kot nadomestek za original setVolume() funkcijo
// async setVolumes(reader, numModalities) { // popravi tko da bo load() funkcija use pohendlala, ne rendering context
//     this.volume = []
//     if (numModalities.length-1 < 2)
//     {
//         this.volume.push(new WebGPUVolume(this.device, reader));
//         this.volume[0].addEventListener('progress', e => {
//             this.dispatchEvent(new CustomEvent('progress', { detail: e.detail }));
//         });
//         await this.volume[0].loadAll(0);
//         this.volume[0].setFilter(this.filter);
//         this.volume.push(new WebGPUVolume(this.device, reader));
//         this.volume[1].addEventListener('progress', e => {
//             this.dispatchEvent(new CustomEvent('progress', { detail: e.detail }));
//         });
//         await this.volume[1].loadBlank(); // tale loadBlank() funkcija bo za stestirat, sm sam neki na kruto vrgu notr
//         this.volume[1].setFilter(this.filter);
//         if (this.renderer) {
//             this.renderer.setVolume(this.volume);
//         }
//         if (numModalities[1].name == 'tsne') {
//             await this.volume[0].loadAll(1);
//         }
//         console.log(this.volume[0].getTexture());
//         console.log(this.volume[1].getTexture());
//     }
//     else 
//     {
//         for (let index = 0; index < numModalities.length-1; index++) {
//             this.volume.push(new WebGPUVolume(this.device, reader));
//             this.volume[index].addEventListener('progress', e => {
//                 this.dispatchEvent(new CustomEvent('progress', { detail: e.detail }));
//             });
//             await this.volume[index].loadAll(index);
//             this.volume[index].setFilter(this.filter);
//         }
//         if (this.renderer) {
//             this.renderer.setVolume(this.volume);
//         }
//     }
//     // console.log(this.volume.length);
// }

async setVolumes(reader, numModalities, tsnePerp, tsneExag, tsneLearn, tsneNum, hdbsClusterSize, hdbsSampleSize) { // tuki uporabm ta novo load() funkcijo
    this.reader = reader;
    this.volume = [];
    // console.log(tsnePerp + " " + tsneExag + " " + tsneLearn + " " + tsneNum + " " + hdbsClusterSize + " " + hdbsSampleSize);
    let toLoad = 0;
    if (numModalities.length < 2)
        toLoad = numModalities.length+1;
    else
        toLoad = numModalities.length;
    for (let index = 0; index < toLoad; index++) {
        this.volume.push(new WebGPUVolume(this.device, this.reader));
        this.volume[index].addEventListener('progress', e => {
            this.dispatchEvent(new CustomEvent('progress', { detail: e.detail }));
        });
        // if (numModalities[index].name == 'tsne') {
        //     await this.volume[index].loadBlank();
        //     await this.volume[index-1].loadAll(index, tsnePerp, tsneExag, tsneLearn, tsneNum, hdbsClusterSize, hdbsSampleSize);
        // }
        // else {
        //}
        if (index == numModalities.length && numModalities.length < toLoad)
            await this.volume[index].loadBlank();
        else
            await this.volume[index].loadAll(index, tsnePerp, tsneExag, tsneLearn, tsneNum, hdbsClusterSize, hdbsSampleSize);
        this.volume[index].setFilter(this.filter);
    }
    if (this.renderer) {
        this.renderer.setVolume(this.volume);
    }
}

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

async _handleClusterCompute(e) {
    // tle morm klicat pol uno drugo funkcijo
    console.log(this.volume[0]);
    let fullvolume = [];
    ///////////////////////////////////////////////////////////////////////////////////
    const clusterModality = this.volume[0].metadata.modalities[0]; // verjetno zamenjam z volumes
    const { width, height, depth } = clusterModality.dimensions; // verjetno zamenjam z volumes
    const { format, internalFormat, type } = clusterModality; // verjetno zamenjam z volumes
    let pointer = 0;
    for (const { index, position } of clusterModality.placements) { // verjetno zamenjam z volumes
        const data = await this.reader.readBlock(index);
        // const block = this.metadata.blocks[index];
        const typedData = new Uint8ClampedArray(data);
        for (let i = 0; i < typedData.length; i++, pointer++) {
            fullvolume[pointer] = typedData[i];
        }
    }
    ///////////////////////////////////////////////////////////////////////////////////

    let test = new Uint8ClampedArray(fullvolume);
    let header = new Uint32Array(11);
    header[0] = width;
    header[1] = height;
    header[2] = depth;
    header[3] = (test.length/(width*height*depth));
    header[4] = test.length;
    header[5] = e.detail.tsnePerp;
    header[6] = e.detail.tsneExag;
    header[7] = e.detail.tsneLearn;
    header[8] = e.detail.tsneNum;
    header[9] = e.detail.hdbsCluster;
    header[10] = e.detail.hdbsSample;
    let tfproba = null;
    let sampleproba = null;
    let labelproba = null;
    // let args = [header[0], header[1], header[2], header[3], header[4], ...test];
    let args = [header[0], header[1], header[2], header[3], header[4], header[5], header[6], header[7], header[8], header[9], header[10], ...test];
    await fetch('/process', {
        method: 'POST',
        body: args,
        headers: { 'Content-Type': 'application/octet-stream' }
    })
    .then(r => r.arrayBuffer())
    .then(buf => {
        let orderedData = this.concat(buf);
        tfproba = orderedData[0];
        sampleproba = orderedData[1];
        labelproba = orderedData[2];
        // console.log(sampleproba);
        // console.log(labelproba);
        // console.log("tfproba:")
        // console.log(tfproba);
    });
    const canv = document.createElement('canvas');
    canv.width = 256;
    canv.height = 256;
    const ctx = canv.getContext('2d');
    console.log("tf array length: " + this.tfArray.length);
    this.tfArray = tfproba;
    console.log(this.tfArray);
    const imgData = new ImageData(Uint8ClampedArray.from(this.tfArray), 256, 256);
    console.log(imgData);
    ctx.putImageData(imgData, 0, 0);
    this.tfAccumulatedGM = canv.toDataURL();
    // console.log(this.renderer);
    // console.log(this.tfAccumulatedGM);
    // this.dispatchEvent(new CustomEvent('generateHistogram', {
    //     detail: {
    //         imgData: this.tfAccumulatedGM
    //     }
    // }));
    return this.tfAccumulatedGM;
}

// set tsnePerp(params) {

// }

// set tsneExag(params) {

// }

// set tsneLearn(params) {

// }

// set tsneNum(params) {

// }

// set hdbsClusterSize(params) {

// }

// set hdbsSampleSize(params) {

// }

setVolMat(r, t, s) {
    for (let index = 0; index < this.volume.length; index++) {
        this.volume[index].setModelMatrix(r, t, s);
    }
}

async setEnvironmentMap(image) {
    const imageBitmap = await createImageBitmap(image);
    if (this.environment.texture) {
        this.environment.texture.destroy();
    }
    this.environment.texture = WebGPU.createTextureFromImageBitmapOrCanvas(this.device, imageBitmap, "rgba8unorm");
}

setFilter(filter) {
    this.filter = filter;
    if (this.volume) {
        this.volume.setFilter(filter);
        if (this.renderer) {
            this.renderer.reset();
        }
    }
}

chooseRenderer(renderer) {
    if (this.renderer) {
        this.renderer.destroy();
    }
    const rendererClass = WebGPURendererFactory(renderer);
    this.renderer = new rendererClass(this.device, this.volume, this.camera, this.environment, {
        resolution: this.resolution,
    });
    this.renderer.reset();
    
    if (this.toneMapper) {
        this.toneMapper.setTexture(this.renderer.getTexture(), this.renderer.getTextureSampler());
    }
    this.isTransformationDirty = true;
}

chooseToneMapper(toneMapper) {
    if (this.toneMapper) {
        this.toneMapper.destroy();
    }
    const device = this.device;
    let texture, textureSampler;
    if (this.renderer) {
        texture = this.renderer.getTexture();
        textureSampler = this.renderer.getTextureSampler();
    } else {
        texture = WebGPU.getFallbackTexture(device).texture;
        textureSampler = WebGPU.getFallbackTexture(device).sampler;
    }
    const toneMapperClass = WebGPUToneMapperFactory(toneMapper);
    this.toneMapper = new toneMapperClass(device, texture, textureSampler, {
        resolution: this.resolution,
    });
}

render() {
    const device = this.device;
    if (!device || !this.renderer || !this.toneMapper) {
        return;
    }

    this.renderer.render();
    this.toneMapper.render();

    const bindGroup = device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: this.toneMapper.getTexture().createView()
            },
            {
                binding: 1,
                resource: this.toneMapper.getTextureSampler()
            },
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
}

get resolution() {
    return this._resolution;
}

set resolution(resolution) {
    this._resolution = resolution;
    this.canvas.width = resolution;
    this.canvas.height = resolution;
    if (this.renderer) {
        this.renderer.setResolution(resolution);
    }
    if (this.toneMapper) {
        this.toneMapper.setResolution(resolution);
        if (this.renderer) {
            this.toneMapper.setTexture(this.renderer.getTexture(), this.renderer.getTextureSampler());
        }
    }
}

async recordAnimation(options = {}) {
    throw new Error("Not implemented");
}

startRendering() {
    Ticker.add(this.render);
}

stopRendering() {
    Ticker.remove(this.render);
}

}
