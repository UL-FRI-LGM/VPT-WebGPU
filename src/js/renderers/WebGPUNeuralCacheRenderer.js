import { mat4 } from "../../lib/gl-matrix-module.js";

import { WebGPUAbstractComputeRenderer } from "./WebGPUAbstractComputeRenderer.js";
import { PerspectiveCamera } from "../PerspectiveCamera.js";
import { CameraPresetAnimator } from "../animators/CameraPresetAnimator.js";
import { parseModelWeights } from "../nn/model_utils.js";
import { RadianceFieldNetwork } from "../nn/radiance_field_network.js";

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

        this._orbit = options.cameraAnimator;

        // Replaces camera and volume matrices with animation ones
        this._cameraPresetAnimator = new CameraPresetAnimator(this._orbit, this._volume);

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

            { name: "filterEnabled", label: "Bilateral filter", type: "checkbox", value: false },
            { name: "filterSigma", label: "Sigma", type: "spinner", value: 5.0, min: 0.1 },
            { name: "filterKSigma", label: "kSigma", type: "spinner", value: 2.0, min: 0.1 },
            { name: "filterThreshold", label: "Threshold", type: "spinner", value: 0.1, min: 0.001 },

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

            {
                name: "cameraPreset",
                label: "Camera preset",
                type: "select",
                value: "free",
                options: [
                    { value: "free", label: "Free orbit" },
                    { value: "front", label: "Front" },
                    { value: "back", label: "Back" },
                    { value: "oscillate", label: "Oscillate" },
                    { value: "turntable", label: "Turntable" },
                ]
            },
            { name: "transform", buttonLabel: "Print camera transform", type: "button" },

            { name: "trainServer", label: "Training server", type: "text-input", value: "localhost:8001" },
            { name: "status", label: "Server status", type: "text", value: "Disconnected", color: "red" },
            { name: "ping", label: "Ping", type: "text", value: "0 ms" },
            { name: "valLoss", label: "Validation loss", type: "text", value: "0.0" },
            { name: "train", label: "Train", type: "checkbox", value: true },
            { name: "predict", label: "Predict", type: "checkbox", value: false },
            {
                name: "serverControls",
                type: "button-row",
                items: [
                    { action: "connect", label: "Connect" },
                    { action: "disconnect", label: "Disconnect" },
                    { action: "reset", label: "Reset" },
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

            if (name === "cameraPreset") {
                this._cameraPresetAnimator.setPreset(value);
                this._cameraPresetAnimator.reset();
                this.reset();
            }

            // During training we cannot accumulate with filtering because we
            // are overwriting ground truth data because of easier implementation
            if ((name === "filterEnabled" || name === "train") && bind) {
                const accumulateBind = bind.closest("div")
                    .querySelector('[bind="accumulate"]');
                const shouldDisable = this.filterEnabled && this.train;

                if (shouldDisable && accumulateBind) {
                    accumulateBind.disabled = true;
                    this._accumulateRestore = this.accumulate;
                    accumulateBind.checked = false;
                    this.accumulate = false;
                } else if (!value && accumulateBind) {
                    accumulateBind.disabled = false;
                    if (this._accumulateRestore) {
                        accumulateBind.checked = this._accumulateRestore;
                        this.accumulate = this._accumulateRestore;
                        this._accumulateRestore = undefined;
                    }
                }
            }

            if (name === "trainServer") {
                this.trainServerConnect(value);
            } else if (name === "predict") {
                const trainBind = bind.closest("div")
                    .querySelector('[bind="train"]');
                if (trainBind && value) {
                    this._trainRestore = trainBind.checked;
                    trainBind.checked = false;
                    trainBind.disabled = true;
                    this.train = false;
                } else if (trainBind && !value) {
                    trainBind.disabled = false;
                    if (this._trainRestore) {
                        trainBind.checked = this._trainRestore;
                        this.train = this._trainRestore;
                        this._trainRestore = undefined;
                    }
                }

                if (value && this._modelStale) {
                    this.trainServerSend("model-request");
                } if (!value || value && !this._modelStale) {
                    this.reset();
                }
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
                "filterEnabled",
            ].includes(name)) {
                this.reset();
            }

            // Reset NN when parameter affecting radiance changes
            if ([
                "bounces",
                "steps",
                "extinction",
                "anisotropy",
                "transferFunction",
                "filterEnabled",
            ].includes(name)) {
                this.trainServerSend("model-reset");
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
                    this._cameraPresetAnimator.reset();
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
                case "transform":
                    console.log(
                        this._orbit._yaw, this._orbit._pitch,
                        Array.from(this._orbit._focus), this._orbit._focusDistance,
                    );
                    break;
                case "connect":
                    this.trainServerConnect(this.trainServer);
                    break;
                case "disconnect":
                    this.trainServerDisconnect();
                    break;
                case "reset":
                    if (this.serverConnected) {
                        this.trainServerSend("model-reset");
                        this.dispatchEvent(new CustomEvent("change", {
                            detail: { name: "valLoss", value: "/" }
                        }));
                    }
                    break;
            }
        });

        const commonCode = SHADERS.renderers.NeuralCache.common;
        const resetCode = commonCode + "\n" + SHADERS.renderers.NeuralCache.reset;
        const renderCode = commonCode + "\n" + SHADERS.renderers.NeuralCache.render;
        const filterCode = commonCode + "\n" + SHADERS.renderers.NeuralCache.filter;
        const neuralRenderCode = commonCode + "\n" + SHADERS.renderers.NeuralCache.render + "\n" + SHADERS.renderers.NeuralCache.neuralRender;

        this._programs = {
            reset: device.createShaderModule({
                label: "WebGPUNeuralCacheRenderer reset shader module",
                code: resetCode,
            }),
            render: device.createShaderModule({
                label: "WebGPUNeuralCacheRenderer render shader module",
                code: renderCode,
            }),
            filter: device.createShaderModule({
                label: "WebGPUNeuralCacheRenderer filter shader module",
                code: filterCode,
            }),
            neuralRender: device.createShaderModule({
                label: "WebGPUNeuralCacheRenderer neural render shader module",
                code: neuralRenderCode,
            }),
        };

        this._createBuffers();
        this._createPipeline();

        this.serverConnected = false;
        this.trainingInProgress = false;
        this._model = undefined;
        this._modelStale = undefined;
    }

    destroy() {
        if (this._model) {
            this._model.destroyBuffers();
            this._model = undefined;
        }
        this._radianceBuffer.destroy();
        this._uniformBuffer.destroy();
        this._groundTruthBuffer.destroy();
        this._stagingBuffer.destroy();
        this._samplePointsBuffer.destroy();
        this.websocket.close();
        super.destroy();
    }

    reset() {
        this._resetFrame();
    }

    render() {
        if (this._playing) {
            this._cameraPresetAnimator.update();

            if (!this.accumulate) {
                this.reset();
            }
            if (this.predict && this._model && !this._modelStale) {
                this._neuralRender();
            } else {
                this._renderFrame();
            }
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

    trainServerDisconnect() {
        if (this.websocket !== undefined) {
            this.websocket.close();
            this.websocket = undefined;
        }

        if (this.pingdom !== undefined) {
            clearInterval(this.pingdom);
            this.pingdom = undefined;
        }

        if (this._model) {
            this._model.destroyBuffers();
            this._model = undefined;
        }
        this._modelStale = undefined;

        this.serverConnected = false;
        this.trainingInProgress = false;
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "status", value: "Disconnected", color: "red" }
        }));
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "ping", value: "0 ms" }
        }));
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "valLoss", value: "0.0" }
        }));
    }

    trainServerConnect(address) {
        this.trainServerDisconnect();

        let wsURI;
        try {
            const url = new URL(`ws://${address}`);
            if (url.port === "") {
                return;
            }
            wsURI = url.href;
        } catch (e) {
            return;
        }

        this.websocket = new WebSocket(wsURI);
        this.websocket.binaryType = "arraybuffer";
        this.websocket.addEventListener("error", () => {
            this.trainServerDisconnect();
        });
        this.websocket.addEventListener("close", () => {
            this.trainServerDisconnect();
        });
        this.websocket.addEventListener("message", (e) => {
            const raw = new Uint8Array(e.data);
            const nullIndex = raw.indexOf(0);
            const json = JSON.parse(new TextDecoder().decode(raw.subarray(0, nullIndex)));
            const payload = raw.subarray(nullIndex + 1);

            switch (json["type"]) {
                case "pong":
                    const received = performance.now();
                    const ping = ((received - json["time"]) / 2).toFixed(1);
                    this.dispatchEvent(new CustomEvent("change", {
                        detail: { name: "ping", value: `${ping} ms` }
                    }));
                    break;
                case "model-created":
                    const modelArgs = json["model_args"];
                    const shader = SHADERS.nn.radiance_field_network;
                    if (this._model) {
                        this._model.destroyBuffers();
                    }
                    this._model = new RadianceFieldNetwork({
                        device: this._device,
                        modelArgs,
                        resolution: this._resolution,
                        shader,
                    });
                    this._modelStale = true;
                    this.serverConnected = true;
                    this.dispatchEvent(new CustomEvent("change", {
                        detail: { name: "status", value: "Connected", color: "green" }
                    }));
                    this.dispatchEvent(new CustomEvent("change", {
                        detail: { name: "valLoss", value: "/" }
                    }));
                    this.trainServerSend("ping", {time: performance.now()});
                    this.pingdom = setInterval(() => {
                        this.trainServerSend("ping", {time: performance.now()});
                    }, 5000);
                    break;
                case "model-reset":
                    this.dispatchEvent(new CustomEvent("change", {
                        detail: { name: "valLoss", value: "/" }
                    }));
                    break;
                case "metrics":
                    this.trainingInProgress = false;
                    this._modelStale = true;
                    const valLoss = json["val_loss"].toFixed(5);
                    this.dispatchEvent(new CustomEvent("change", {
                        detail: { name: "valLoss", value: valLoss }
                    }));
                    break;
                case "model-weights":
                    parseModelWeights(payload.buffer).then(
                        res => {
                            this._model.loadWeights(
                                res.positionTablesData,
                                res.directionTablesData,
                                res.fcWeightsData,
                                res.fcBiasesData,
                            );
                            this._modelStale = false;
                            this.reset();
                        },
                    );
                    break;
            }
        });
    }

    trainServerSend(messageType, data) {
        if (messageType === "ground-truth") {
            if (this.trainingInProgress) {
                return;
            }
            this.trainingInProgress = true;
        }

        const header = new TextEncoder().encode(messageType);

        let dataLength;
        if (data === undefined) {
            dataLength = 0;
        } else if (ArrayBuffer.isView(data)) {
            dataLength = data.byteLength;
        } else {
            data = JSON.stringify(data);
            dataLength = data.length;
        }

        const buffer = new ArrayBuffer(header.byteLength + 1 + dataLength);
        const bytes = new Uint8Array(buffer);
        bytes.set(header, 0);
        bytes[header.byteLength] = 0;

        if (ArrayBuffer.isView(data)) {
            bytes.set(new Uint8Array(data.buffer), header.byteLength + 1);
        } else if (data !== undefined) {
            bytes.set(new TextEncoder().encode(data), header.byteLength + 1);
        }

        if (this.websocket !== undefined) {
            this.websocket.send(buffer);
        }
    }

    get uniformSize() {
        return 144;
    }

    get radianceSize() {
        return 48;
    }

    // Packed 8 floats instead of a structure with padding
    get groundTruthSize() {
        return 32;
    }

    get samplePointSize() {
        return 32;
    }

    get groundTruthMaxBytes() {
        return 4 * 1024 * 1024 * 1024;
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

        this._samplePointsBuffer = this._device.createBuffer({
            label: "sample points buffer",
            size: pixels * this.samplePointSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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

        if (this._samplePointsBuffer) {
            this._samplePointsBuffer.destroy();
        }
        this._samplePointsBuffer = this._device.createBuffer({
            label: "sample points buffer",
            size: pixels * this.samplePointSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this._stagingBufferMapped = false;
        this.clearGroundTruth();

        if (this._model) {
            this._model.setResolution(this._resolution);
        }

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

        this._filterPipeline = this._device.createComputePipeline({
            label: "WebGPUNeuralCacheRenderer filter pipeline",
            layout: "auto",
            compute: {
                module: this._programs.filter,
                entryPoint: "bilateralFilter",
                constants: {
                    WORKGROUP_SIZE_X: this._workgroup_size[0],
                    WORKGROUP_SIZE_Y: this._workgroup_size[1],
                },
            },
        });

        this._neuralRenderPipeline = this._device.createComputePipeline({
            label: "WebGPUNeuralCacheRenderer neural render pipeline",
            layout: "auto",
            compute: {
                module: this._programs.neuralRender,
                entryPoint: "neuralRender",
                constants: {
                    WORKGROUP_SIZE_X: this._workgroup_size[0],
                    WORKGROUP_SIZE_Y: this._workgroup_size[1],
                },
            },
        });
    }

    _neuralRender() {
        const startTime = performance.now();
        this._updateUniforms();

        const neuralRenderBindGroup = this._device.createBindGroup({
            label: "WebGPUNeuralCacheRenderer neural render bind group",
            layout: this._neuralRenderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this._uniformBuffer } },
                { binding: 1, resource: { buffer: this._radianceBuffer } },
                { binding: 3, resource: this._volume.getTexture().createView() },
                { binding: 4, resource: this._volume.getTextureSampler() },
                { binding: 5, resource: this._transferFunction.createView() },
                { binding: 6, resource: this._transferFunctionSampler },
                { binding: 7, resource: this._environment.texture.createView() },
                { binding: 8, resource: this._environment.sampler },
                { binding: 10, resource: { buffer: this._samplePointsBuffer } },
            ],
        });

        const encoder = this._device.createCommandEncoder();

        // Direct-only path tracing + sample point capture
        const neuralPass = encoder.beginComputePass();
        neuralPass.setPipeline(this._neuralRenderPipeline);
        neuralPass.setBindGroup(0, neuralRenderBindGroup);
        neuralPass.dispatchWorkgroups(...this._getWorkgroupCount());
        neuralPass.end();

        // NN forward — writes directly to render buffer
        const nnPass = encoder.beginComputePass();
        const hex = this.background;
        const modeIndex = ["global", "direct", "indirect"].indexOf(this.mode);
        this._model.updateUniforms(
            [
                parseInt(hex.slice(1, 3), 16) / 255,
                parseInt(hex.slice(3, 5), 16) / 255,
                parseInt(hex.slice(5, 7), 16) / 255,
            ],
            modeIndex,
        );
        this._model.dispatchForward(
            nnPass,
            this._samplePointsBuffer,
            this._radianceBuffer,
            this._renderBuffer.getAttachments()[0].texture.createView(),
        );
        nnPass.end();

        this._device.queue.submit([encoder.finish()]);

        this._device.queue.onSubmittedWorkDone().then(() => {
            const frameTime = performance.now() - startTime;
            this._updateFPS(startTime, frameTime);
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
                { binding: 9, resource: { buffer: this._groundTruthBuffer } },
            ],
        });

        const encoder = this._device.createCommandEncoder();

        // Path tracing
        const pass = encoder.beginComputePass();
        pass.setPipeline(this._renderPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(...this._getWorkgroupCount());
        pass.end();

        // Bilateral filter
        if (this.filterEnabled) {
            const filterBindGroup = this._device.createBindGroup({
                label: "WebGPUNeuralCacheRenderer filter bind group",
                layout: this._filterPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this._uniformBuffer } },
                    { binding: 1, resource: { buffer: this._radianceBuffer } },
                    { binding: 2, resource: this._renderBuffer.getAttachments()[0].texture.createView() },
                    { binding: 9, resource: this._groundTruthBuffer }
                ],
            });

            const filterPass = encoder.beginComputePass();
            filterPass.setPipeline(this._filterPipeline);
            filterPass.setBindGroup(0, filterBindGroup);
            filterPass.dispatchWorkgroups(...this._getWorkgroupCount());
            filterPass.end();
        }

        this._device.queue.submit([encoder.finish()]);

        this._device.queue.onSubmittedWorkDone().then(() => {
            const frameTime = performance.now() - startTime;
            this._updateFPS(startTime, frameTime);
        });

        const downloadData = this.store && this._groundTruthBytes < this.groundTruthMaxBytes;
        const sendData = this.serverConnected && this.train;

        if (this._stagingBufferMapped || !downloadData && !sendData) {
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

            if (downloadData) {
                this._groundTruthZip.file(
                    "indirect_radiance_"
                    + this._groundTruthFrames.toString().padStart(4, "0")
                    + ".bin",
                    data.slice().buffer,

                );
                this._groundTruthBytes += data.byteLength;

                const size = (this._groundTruthBytes / 1024 / 1024).toFixed(1);
                this.dispatchEvent(new CustomEvent("change", {
                    detail: { name: "dataSize", value: `${size} MB` }
                }));
            }

            if (sendData) {
                this.trainServerSend("ground-truth", data);
            }

            this._groundTruthFrames++;
            this._stagingBuffer.unmap();
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

        this._device.queue.writeBuffer(this._uniformBuffer, 124, new Float32Array([
            this.filterSigma,
            this.filterKSigma,
            this.filterThreshold,
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
            filterEnabled: this.filterEnabled,
            filterSigma: this.filterSigma,
            filterKSigma: this.filterKSigma,
            filterThreshold: this.filterThreshold,
        };
    }

    setVolume(volume) {
        super.setVolume(volume);
        this._cameraPresetAnimator.volume = volume;
    }
}
