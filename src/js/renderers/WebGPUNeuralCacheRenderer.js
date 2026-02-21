import { mat4 } from "../../lib/gl-matrix-module.js";

import { WebGPUAbstractComputeRenderer } from "./WebGPUAbstractComputeRenderer.js";
import { PerspectiveCamera } from "../PerspectiveCamera.js";

const [ SHADERS ] = await Promise.all([
    "shaders-wgsl.json",
].map(url => fetch(url).then(response => response.json())));

export class WebGPUNeuralCacheRenderer extends WebGPUAbstractComputeRenderer {

    constructor(device, volume, camera, environment, options = {}) {
        super(device, volume, camera, environment, options);

        this._playing = true;
        this._frameTimes = [];
        this._groundTruthBytes = 0;
        this._groundTruthFrames = 0;
        this._groundTruthZip = new JSZip();
        this._stagingBufferMapped = false;

        this.registerProperties([
            // Volume properties
            { name: "extinction", label: "Extinction", type: "spinner", value: 20, min: 0 },
            { name: "anisotropy", label: "Anisotropy", type: "slider", value: 0, min: -1, max: 1 },

            // Sampling parameters
            { name: "samples", label: "Samples", type: "spinner", value: 1, min: 1 },
            { name: "bounces", label: "Bounces", type: "spinner", value: 20, min: 1 },
            { name: "steps", label: "Steps", type: "spinner", value: 500, min: 1 },

            { name: "accumulate", label: "Accumulate", type: "checkbox", value: true },
            { name: "stochastic", label: "Stochastic", type: "checkbox", value: true },

            {
                name: "mode",
                label: "Display mode",
                type: "select",
                value: "global",
                options: [
                    { value: "global", label: "Global illumination" },
                    { value: "direct", label: "Direct radiance" },
                    { value: "indirect", label: "Indirect radiance" },
                ]
            },
            { name: "background", label: "Background", type: "color-chooser", value: "#ffffff" },

            { name: "frameTime", label: "Frame time", type: "text", value: "0 ms" },
            { name: "fps", label: "FPS", type: "text", value: "0.0" },

            {
                name: "playbackControls",
                type: "button-row",
                items: [
                    { action: "play", label: "Play" },
                    { action: "pause", label: "Pause" },
                    { action: "stop", label: "Stop" }
                ]
            },

            { name: "store", label: "Store data", type: "checkbox", value: false },
            { name: "dataSize", label: "Data size", type: "text", value: "0 MB" },
            { name: "download", buttonLabel: "Download data", type: "button" },

            { name: "transferFunction", label: "Transfer function", type: "transfer-function", value: new Uint8Array(256) },
        ]);

        this._transferFunctionBumps = [];

        this.addEventListener("change", e => {
            const { name, value, bind } = e.detail;

            const num = parseFloat(value);
            if (!isNaN(num)) {
                this[name] = num;
            }

            if (name === "transferFunction") {
                this.setTransferFunction(this.transferFunction);
                this._transferFunctionBumps = bind.bumps;
            }

            // Reset on parameter changes that affect the path tracing
            if ([
                "samples",
                "bounces",
                "steps",
                "extinction",
                "anisotropy",
                "transferFunction",
                "stochastic",
                "background",
            ].includes(name)) {
                this.reset();
            }
        });

        // Handle button actions
        this.addEventListener("action", e => {
            const { action } = e.detail;
            switch (action) {
                case "play":
                    this._playing = true;
                    break;
                case "pause":
                    this._playing = false;
                    break;
                case "stop":
                    this._playing = false;
                    this.clearGroundTruth();
                    this.reset();
                    break;
                case "download":
                    // Store current parameters as a file
                    this._groundTruthZip.file(
                        "parameters.json",
                        JSON.stringify(this._getParameters(), null, "    "),
                    );

                    // Store current transfer function as a file
                    this._groundTruthZip.file(
                        "transfer_function.json",
                        JSON.stringify(this._transferFunctionBumps),
                    );

                    this._groundTruthZip.generateAsync({
                        type: "blob",
                        compression: "DEFLATE",
                    }).then(blob => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "ground_truth.zip";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    });
                    break;
            }
        });

        const commonCode = SHADERS.renderers.NeuralCache.common;
        const resetCode = commonCode + "\n" + SHADERS.renderers.NeuralCache.reset;
        const renderCode = commonCode + "\n" + SHADERS.renderers.NeuralCache.render;

        this._programs = {
            reset: device.createShaderModule({
                label: "WebGPUNeuralCacheRenderer reset shader module",
                code: resetCode,
            }),
            render: device.createShaderModule({
                label: "WebGPUNeuralCacheRenderer render shader module",
                code: renderCode,
            }),
        };

        this._createBuffers();
        this._createPipeline();
    }

    destroy() {
        this._radianceBuffer.destroy();
        this._uniformBuffer.destroy();
        this._groundTruthBuffer.destroy();
        this._stagingBuffer.destroy();
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

    clearGroundTruth() {
        this._groundTruthBytes = 0;
        this._groundTruthFrames = 0;
        this._groundTruthZip = new JSZip();
        this._stagingBufferMapped = false;
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "dataSize", value: "0 MB" }
        }));
    }

    get uniformSize() {
        return 128;
    }

    get radianceSize() {
        return 32;
    }

    // Packed 8 floats instead of a structure with padding
    get groundTruthSize() {
        return 32;
    }

    get groundTruthMaxBytes() {
        return 1024 * 1024 * 1024;
    }

    _createBuffers() {
        const pixels = this._resolution * this._resolution;

        // Radiance buffer - one radiance value per pixel
        this._radianceBuffer = this._device.createBuffer({
            size: pixels * this.radianceSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        // Uniform buffer - shared between reset and render
        this._uniformBuffer = this._device.createBuffer({
            size: this.uniformSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Ground truth data buffer for indirect radiance values
        this._groundTruthBuffer = this._device.createBuffer({
            size: pixels * this.groundTruthSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        this._stagingBuffer = this._device.createBuffer({
            size: pixels * this.groundTruthSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        this._stagingBufferMapped = false;
    }

    _rebuildBuffers() {
        const pixels = this._resolution * this._resolution;

        if (this._radianceBuffer) {
            this._radianceBuffer.destroy();
        }
        this._radianceBuffer = this._device.createBuffer({
            size: pixels * this.radianceSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        if (this._groundTruthBuffer) {
            this._groundTruthBuffer.destroy();
        }
        this._groundTruthBuffer = this._device.createBuffer({
            size: pixels * this.groundTruthSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        if (this._stagingBuffer) {
            this._stagingBuffer.destroy();
        }
        this._stagingBuffer = this._device.createBuffer({
            size: pixels * this.groundTruthSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        this._stagingBufferMapped = false;
        this.clearGroundTruth();

        super._rebuildBuffers();
    }

    _createPipeline() {
        this._resetPipeline = this._device.createComputePipeline({
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

        this._renderPipeline = this._device.createComputePipeline({
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
        this._updateUniforms();

        const bindGroup = this._device.createBindGroup({
            label: "WebGPUNeuralCacheRenderer reset bind group",
            layout: this._resetPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this._uniformBuffer } },
                { binding: 1, resource: { buffer: this._radianceBuffer } },
                { binding: 2, resource: this._renderBuffer.getAttachments()[0].texture.createView() },
            ],
        });

        const encoder = this._device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this._resetPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(...this._getWorkgroupCount());
        pass.end();
        this._device.queue.submit([encoder.finish()]);
    }

    _renderFrame() {
        const startTime = performance.now();

        this._updateUniforms();

        const bindGroup = this._device.createBindGroup({
            label: "WebGPUNeuralCacheRenderer render bind group",
            layout: this._renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this._uniformBuffer } },
                { binding: 1, resource: { buffer: this._radianceBuffer } },
                { binding: 2, resource: this._renderBuffer.getAttachments()[0].texture.createView() },
                { binding: 3, resource: this._volume.getTexture().createView() },
                { binding: 4, resource: this._volume.getTextureSampler() },
                { binding: 5, resource: this._transferFunction.createView() },
                { binding: 6, resource: this._transferFunctionSampler },
                { binding: 7, resource: this._environment.texture.createView() },
                { binding: 8, resource: this._environment.sampler },
                { binding: 9, resource: this._groundTruthBuffer }
            ],
        });

        const encoder = this._device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this._renderPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(...this._getWorkgroupCount());
        pass.end();
        this._device.queue.submit([encoder.finish()]);

        this._device.queue.onSubmittedWorkDone().then(() => {
            const frameTime = performance.now() - startTime;
            this._updateFPS(startTime, frameTime);
        });

        if (!this.store || this._groundTruthBytes >= this.groundTruthMaxBytes || this._stagingBufferMapped) {
            return;
        }

        // Copy ground truth data
        const copyEncoder = this._device.createCommandEncoder();
        copyEncoder.copyBufferToBuffer(
            this._groundTruthBuffer, 0,
            this._stagingBuffer, 0,
            this._resolution * this._resolution * this.groundTruthSize
        );
        this._device.queue.submit([copyEncoder.finish()]);

        this._stagingBufferMapped = true;

        this._stagingBuffer.mapAsync(GPUMapMode.READ).then(() => {
            const data = new Float32Array(this._stagingBuffer.getMappedRange());

            this._groundTruthZip.file(
                "indirect_radiance_"
                + this._groundTruthFrames.toString().padStart(4, "0")
                + ".bin",
                data.slice().buffer,

            );
            this._groundTruthFrames++;
            this._groundTruthBytes += data.byteLength;
            this._stagingBuffer.unmap();

            const size = (this._groundTruthBytes / 1024 / 1024).toFixed(1);
            this.dispatchEvent(new CustomEvent("change", {
                detail: { name: "dataSize", value: `${size} MB` }
            }));

            this._stagingBufferMapped = false;
        });
    }

    _updateUniforms() {
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

        this._device.queue.writeBuffer(this._uniformBuffer, 0, matrix);
        this._device.queue.writeBuffer(this._uniformBuffer, 64, new Float32Array([
            1 / this._resolution, 1 / this._resolution,
            this._resolution, this._resolution,
            0, // blur
            this.extinction,
            this.anisotropy,
        ]));
        this._device.queue.writeBuffer(this._uniformBuffer, 92, new Uint32Array([
            this.stochastic ? randSeedUint[0] : 42,
            this.samples,
            this.bounces,
            this.steps,
            ["global", "direct", "indirect"].indexOf(this.mode),
        ]));

        // Parse hex color to RGB floats
        const hex = this.background;
        this._device.queue.writeBuffer(this._uniformBuffer, 112, new Float32Array([
            parseInt(hex.slice(1, 3), 16) / 255, // red
            parseInt(hex.slice(3, 5), 16) / 255, // green
            parseInt(hex.slice(5, 7), 16) / 255, // blue
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
            detail: { name: "frameTime", value: this._frameTime }
        }));
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "fps", value: this._fps }
        }));
    }

    _getWorkgroupCount() {
        return [
            Math.ceil(this._resolution / this._workgroup_size[0]),
            Math.ceil(this._resolution / this._workgroup_size[1]),
        ];
    }

    _getParameters() {
        return {
            extinction: this.extinction,
            anisotropy: this.anisotropy,
            samples: this.samples,
            bounces: this.bounces,
            steps: this.steps,
            accumulate: this.accumulate,
            stochastic: this.stochastic,
            resolution: this._resolution,
        };
    }
}
