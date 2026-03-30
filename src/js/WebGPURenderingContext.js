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

async setVolumes(reader, numModalities) {
    this.reader = reader;
    this.volume = [];
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
        if (index == numModalities.length && numModalities.length < toLoad) {
            await this.volume[index].loadBlank();
        }
        else {
            await this.volume[index].loadAll(index);
        }
        this.volume[index].setFilter(this.filter);
    }
    if (this.renderer) {
        this.renderer.setVolume(this.volume);
    }
}

async setClusterMask(samples, labels, colors, width, height, depth) {
    // this.volume.push(new WebGPUVolume(this.device, this.reader));
    await this.volume[this.volume.length-1].loadMask(samples, labels, colors, width, height, depth);
    console.log(this.volume);
}

async concat(data) {
    const view = new DataView(data);
    let tf = null;
    let sample = null;
    // let colors = [];
    // let tempColors = null;
    // let tempSample = null;
    // let labels = null;
    let header = new Int32Array(4);
    let offset = 0;
    let count = 0;
    let packageLen = 0;
  
    while(offset < data.byteLength) {
        header = view.getInt32(offset, true);
        count = Number(header);
        offset += 4;
        header = view.getInt32(offset, true);
        packageLen = Number(header);
        offset += 4;
        
        let j = 0;
        for (let k = offset; k < (packageLen + offset);) {
            switch (count) {
                case 1:
                    sample = new Uint8Array(data, k, packageLen);
                    k += packageLen;
                    j = k;
                    break;
                case 2:
                    tf = new Uint8Array(data, k, packageLen);
                    k += packageLen;
                    j = k;
                    break;
                default:
                    break;
            }
        }
        offset = j;
    }
    return [sample, tf];
}

async _handleClusterCompute(e) {
    const clusterModality = this.volume[0].metadata.modalities[0];
    const { width, height, depth } = clusterModality.dimensions;
    let fullvolume = new Uint8ClampedArray(width*height*depth*4);
    // const { format, internalFormat, type } = clusterModality;
    let pointer = 0;
    for (const { index, position } of clusterModality.placements) {
        const data = await this.reader.readBlock(index);
        const typedData = new Uint8ClampedArray(data);
        for (let i = 0; i < typedData.length; i++, pointer++) {
            fullvolume[pointer] = typedData[i];
        }
    }
    // let test = new Uint8ClampedArray(fullvolume);
    let header = new Uint32Array(1);
    let args = [];
    switch (e.detail.visualizer) {
        case "tsne":
            header = new Uint32Array(14);
            header[0] = width;
            header[1] = height;
            header[2] = depth;
            header[3] = (fullvolume.length/(width*height*depth));
            header[4] = fullvolume.length;
            header[5] = 0;
            header[6] = e.detail.tsnePerp;
            header[7] = e.detail.tsneExag;
            header[8] = e.detail.tsneLearn;
            header[9] = e.detail.tsneNum;
            header[10] = e.detail.sampleSize;
            header[11] = e.detail.sigmaValue;
            header[12] = e.detail.hdbsCluster;
            header[13] = e.detail.hdbsSample;
            console.log(width + " " + height + " " + depth + " " + fullvolume.length/(width*height*depth) + " " + fullvolume.length);
            args = [header[0], header[1], header[2], header[3], header[4], header[5], header[6], header[7], header[8], header[9], header[10],  header[11], header[12], header[13], ...fullvolume];
            break;
        case "umap":
            header = new Uint32Array(12);
            header[0] = width;
            header[1] = height;
            header[2] = depth;
            header[3] = (fullvolume.length/(width*height*depth));
            header[4] = fullvolume.length;
            header[5] = 1;
            header[6] = e.detail.umapNeighbors;
            header[7] = e.detail.umapDistance;
            header[8] = e.detail.sampleSize;
            header[9] = e.detail.sigmaValue;
            header[10] = e.detail.hdbsCluster;
            header[11] = e.detail.hdbsSample;
            args = [header[0], header[1], header[2], header[3], header[4], header[5], header[6], header[7], header[8], header[9], header[10], header[11], ...fullvolume];
            break;    
        default:
            break;
    }
    
    let tfproba = null;
    let sampleproba = null;
    let labelproba = null;
    let colorproba = null;
    
    await fetch('/process', {
        method: 'POST',
        body: args,
        headers: { 'Content-Type': 'application/octet-stream' }
    })
    await fetch('/output')
    .then(r => r.arrayBuffer())
    .then(buf => {
        return this.concat(buf)
    })
    .then(res => {
        sampleproba = res[0]; // to gre direkt na canvas
        tfproba = res[1]; // clusterMask
        // labelproba = res[2]; // clusterMask
        // colorproba = res[3]; // clusterMask
        this.setClusterMask(sampleproba, labelproba, colorproba, width, height, depth);
    });
    const canv = document.createElement('canvas');
    canv.width = 256;
    canv.height = 256;
    const ctx = canv.getContext('2d');
    this.tfArray = tfproba;
    const imgData = new ImageData(Uint8ClampedArray.from(this.tfArray), 256, 256);
    ctx.putImageData(imgData, 0, 0);
    return canv.toDataURL();
}


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
