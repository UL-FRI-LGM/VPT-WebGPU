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
        this.volume = new WebGPUVolume(this.device);
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

    // this.volume = new WebGPUVolume(this.device);
}

// ============================ WEBGPU SUBSYSTEM ============================ //

async initWebGPU() {
    if (!navigator.gpu) {
        throw new Error("WebGPU not supported");
    }

    this.adapter = await navigator.gpu.requestAdapter();
    this.device = await this.adapter.requestDevice({
        requiredLimits: {
            maxStorageBuffersPerShaderStage: 10,
        },
    });
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

async setVolume(reader) {
    this.volume = new WebGPUVolume(this.device, reader);
    this.volume.addEventListener('progress', e => {
        this.dispatchEvent(new CustomEvent('progress', { detail: e.detail }));
    });
    await this.volume.load();
    this.volume.setFilter(this.filter);
    if (this.renderer) {
        this.renderer.setVolume(this.volume);
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
        cameraAnimator: this.cameraAnimator,
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
