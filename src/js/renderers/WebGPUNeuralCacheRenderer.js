import { mat4 } from "../../lib/gl-matrix-module.js";

import { WebGPUAbstractComputeRenderer } from "./WebGPUAbstractComputeRenderer.js";
import { PerspectiveCamera } from "../PerspectiveCamera.js";

const [ SHADERS, MIXINS ] = await Promise.all([
    "shaders-wgsl.json",
    "mixins-wgsl.json",
].map(url => fetch(url).then(response => response.json())));

export class WebGPUNeuralCacheRenderer extends WebGPUAbstractComputeRenderer {

    constructor(device, volume, camera, environment, options = {}) {
        super(device, volume, camera, environment, options);

        this._playing = true;
        this._frameTimes = [];

        this.registerProperties([
            // Volume properties
            { name: "extinction", label: "Extinction", type: "spinner", value: 20, min: 0 },
            { name: "anisotropy", label: "Anisotropy", type: "slider", value: 0, min: -1, max: 1 },

            // Sampling parameters
            { name: "samples", label: "Samples", type: "spinner", value: 10, min: 1 },
            { name: "steps", label: "Steps", type: "spinner", value: 20, min: 1 },

            { name: "accumulate", label: "Accumulate", type: "checkbox", value: true },

            { name: "_frameTime", label: "Frame time", type: "text", value: "0 ms" },
            { name: "_fps", label: "FPS", type: "text", value: "0.0" },

            {
                name: "_playbackControls",
                type: "button-row",
                items: [
                    { action: "play", label: "Play" },
                    { action: "pause", label: "Pause" },
                    { action: "stop", label: "Stop" }
                ]
            },

            { name: "_dataSize", label: "Data size", type: "text", value: "0 MB" },
            { name: "_download", buttonLabel: "Download data", type: "button" },

            { name: "transferFunction", label: "Transfer function", type: "transfer-function", value: new Uint8Array(256) },
        ]);

        this.accumulate = true;

        this.addEventListener("change", e => {
            const { name } = e.detail;

            if (name === "transferFunction") {
                this.setTransferFunction(this.transferFunction);
            }

            // Reset on parameter changes that affect the path tracing
            if ([
                "samples",
                "steps",
                "extinction",
                "anisotropy",
                "transferFunction",
            ].includes(name)) {
                this.reset();
            }
        });

        // Handle button actions
        this.addEventListener("action", e => {
            const { action } = e.detail;
            switch (action) {
                case 'play':
                    this._playing = true;
                    break;
                case 'pause':
                    this._playing = false;
                    break;
                case 'stop':
                    this._playing = false;
                    this.reset();
                    break;
                case '_download':
                    break;
            }
        });

        // Build shader modules from parts
        const structCode = SHADERS.renderers.NeuralCache.structs || "";
        const helpersCode = SHADERS.renderers.NeuralCache.helpers || "";
        const resetCode = structCode + "\n" + helpersCode + "\n" + SHADERS.renderers.NeuralCache.reset;
        const renderCode = structCode + "\n" + helpersCode + "\n" + SHADERS.renderers.NeuralCache.render;

        this._programs = {
            reset: device.createShaderModule({ code: resetCode }),
            render: device.createShaderModule({ code: renderCode }),
        };

        this._createBuffers();
        this._createPipeline();
    }

    destroy() {
        this._photonBuffer.destroy();
        this._uniformBuffer.destroy();
        super.destroy();
    }

    reset() {
        this._resetFrame();
    }

    render() {
        if (this._playing) {
            if (!this.accumulate) {
                this.reset();
            }
            this._renderFrame();
        }
    }

    _createBuffers() {
        const device = this._device;

        // Photon buffer - one photon per pixel
        const photonSize = 64;
        this._photonBuffer = device.createBuffer({
            size: this._resolution * this._resolution * photonSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        // Uniform buffer - shared between reset and render
        this._uniformBuffer = device.createBuffer({
            size: 112,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    _rebuildBuffers() {
        const photonSize = 64;
        const bufferSize = this._resolution * this._resolution * photonSize;

        if (this._photonBuffer) {
            this._photonBuffer.destroy();
        }
        this._photonBuffer = this._device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        super._rebuildBuffers();
    }

    _createPipeline() {
        const device = this._device;

        this._resetPipeline = device.createComputePipeline({
            label: "WebGPUNeuralCacheRenderer reset pipeline",
            layout: "auto",
            compute: {
                module: this._programs.reset,
                entryPoint: "reset",
                constants: {
                    WORKGROUP_SIZE_X: this._workgroup_size[0],
                    WORKGROUP_SIZE_Y: this._workgroup_size[1],
                },
            },
        });

        this._renderPipeline = device.createComputePipeline({
            label: "WebGPUNeuralCacheRenderer render pipeline",
            layout: "auto",
            compute: {
                module: this._programs.render,
                entryPoint: "render",
                constants: {
                    WORKGROUP_SIZE_X: this._workgroup_size[0],
                    WORKGROUP_SIZE_Y: this._workgroup_size[1],
                },
            },
        });
    }

    _resetFrame() {
        const device = this._device;

        this._updateUniforms();

        const bindGroup = device.createBindGroup({
            layout: this._resetPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this._uniformBuffer } },
                { binding: 1, resource: { buffer: this._photonBuffer } },
                { binding: 2, resource: this._renderBuffer.getAttachments()[0].texture.createView() },
            ],
        });

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this._resetPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(...this._getWorkgroupCount());
        pass.end();
        device.queue.submit([encoder.finish()]);
    }

    _renderFrame() {
        const startTime = performance.now();
        const device = this._device;

        this._updateUniforms();

        const bindGroup = device.createBindGroup({
            layout: this._renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this._uniformBuffer } },
                { binding: 1, resource: { buffer: this._photonBuffer } },
                { binding: 2, resource: this._renderBuffer.getAttachments()[0].texture.createView() },
                { binding: 3, resource: this._volume.getTexture().createView() },
                { binding: 4, resource: this._volume.getTextureSampler() },
                { binding: 5, resource: this._transferFunction.createView() },
                { binding: 6, resource: this._transferFunctionSampler },
                { binding: 7, resource: this._environment.texture.createView() },
                { binding: 8, resource: this._environment.sampler },
            ],
        });

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this._renderPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(...this._getWorkgroupCount());
        pass.end();
        device.queue.submit([encoder.finish()]);

        device.queue.onSubmittedWorkDone().then(() => {
            const frameTime = performance.now() - startTime;
            this._updateFPS(startTime, frameTime);
        });
    }

    _updateUniforms() {
        const device = this._device;

        // Compute MVP inverse matrix
        const modelMatrix = this._volume.modelMatrix;
        const viewMatrix = this._camera.transform.inverseGlobalMatrix;
        const projectionMatrix = this._camera.getComponent(PerspectiveCamera).projectionMatrix;

        const matrix = mat4.create();
        mat4.multiply(matrix, modelMatrix, matrix);
        mat4.multiply(matrix, viewMatrix, matrix);
        mat4.multiply(matrix, projectionMatrix, matrix);
        mat4.invert(matrix, matrix);

        const randSeed = new Float32Array(1);
        randSeed[0] = Math.random();
        const randSeedUint = new Uint32Array(randSeed.buffer);

        device.queue.writeBuffer(this._uniformBuffer, 0, matrix);
        device.queue.writeBuffer(this._uniformBuffer, 64, new Float32Array([
            1 / this._resolution, 1 / this._resolution,
            this._resolution, this._resolution,
            0, // blur
            this.extinction,
            this.anisotropy,
        ]));
        device.queue.writeBuffer(this._uniformBuffer, 92, new Uint32Array([
            randSeedUint[0],
            this.samples,
            this.steps,
        ]));
    }

    _updateFPS(start, time) {
        if (!this._playing) {
            return;
        }

        const now = performance.now();
        this._frameTimes.push({start, time});

        // Remove older frame times
        this._frameTimes = this._frameTimes.filter(t => now - t.start < 500);

        const avg = this._frameTimes.reduce(
            (acc, t) => acc + t.time, 0
        ) / this._frameTimes.length;
        this._frameTime = `${avg.toFixed(1)} ms`;
        if (avg > 0) {
            this._fps = (1000 / avg).toFixed(1);
        } else {
            this._fps = "0.0";
        }

        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "_frameTime", value: this._frameTime }
        }));
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "_fps", value: this._fps }
        }));
    }

    _getWorkgroupCount() {
        return [
            Math.ceil(this._resolution / this._workgroup_size[0]),
            Math.ceil(this._resolution / this._workgroup_size[1]),
        ];
    }
}
