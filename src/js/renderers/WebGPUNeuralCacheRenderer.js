import { mat4 } from "../../lib/gl-matrix-module.js";
import { zipSync, strToU8 } from "../../lib/fflate-module.js";

import { WebGPUAbstractComputeRenderer } from "./WebGPUAbstractComputeRenderer.js";
import { PerspectiveCamera } from "../PerspectiveCamera.js";
import { CameraPresetAnimator } from "../animators/CameraPresetAnimator.js";
import { parseModelWeights, loadModelFromFile } from "../nn/ModelUtils.js";
import { RadianceFieldNetwork } from "../nn/RadianceFieldNetwork.js";
import { resetFrame, renderFrame, neuralRender } from "./NeuralCachePipelines.js";
import { DOMUtils } from '../utils/DOMUtils.js';
import { BenchmarkRunner } from '../utils/BenchmarkRunner.js';

const [ SHADERS ] = await Promise.all([
    "shaders-wgsl.json",
].map(url => fetch(url).then(response => response.json())));

export class WebGPUNeuralCacheRenderer extends WebGPUAbstractComputeRenderer {

    constructor(device, volume, camera, environment, options = {}) {
        super(device, volume, camera, environment, options);

        this._directCanvas = document.createElement('canvas');
        this._directCanvas.width = this._resolution;
        this._directCanvas.height = this._resolution;
        this._directCanvasContext = this._directCanvas.getContext("webgpu");
        this._directCanvasContext.configure({ device, format: navigator.gpu.getPreferredCanvasFormat() });

        this._indirectCanvas = document.createElement('canvas');
        this._indirectCanvas.width = this._resolution;
        this._indirectCanvas.height = this._resolution;
        this._indirectCanvasContext = this._indirectCanvas.getContext("webgpu");
        this._indirectCanvasContext.configure({ device, format: navigator.gpu.getPreferredCanvasFormat() });

        this._playing = true;
        this._frameTimes = [];
        this._frameCount = 0;
        this._groundTruthBytes = 0;
        this._groundTruthFrames = 0;
        this._groundTruthZip = {};
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
                    { value: "head", label: "Head" },
                    { value: "insides", label: "Insides" },
                    { value: "front_heptane", label: "F Heptane" },
                    { value: "turntable_heptane", label: "T Heptane" },
                    { value: "front_neurons", label: "F Neurons" },
                    { value: "turntable_neurons", label: "T Neurons" },
                    { value: "front_frog", label: "F Frog" },
                    { value: "turntable_frog", label: "T Frog" },
                    { value: "front_mri_ventricles", label: "F Ventricles" },
                    { value: "turntable_mri_ventricles", label: "T Ventricles" },
                    { value: "front_silicium", label: "F Silicium" },
                    { value: "turntable_silicium", label: "T Silicium" },
                    { value: "front_vismale", label: "F Vismale" },
                    { value: "turntable_vismale", label: "T Vismale" },
                    { value: "front_miranda", label: "F Miranda" },
                    { value: "turntable_miranda", label: "T Miranda" },
                    { value: "front_bonsai", label: "F Bonsai" },
                    { value: "turntable_bonsai", label: "T Bonsai" },
                ]
            },
            { name: "transform", buttonLabel: "Print camera transform", type: "button" },

            { name: "modelFile", label: "Model file", type: "file-chooser", value: null },
            { name: "trainServer", label: "Training server", type: "text-input", value: "localhost:8001" },
            { name: "status", label: "Server status", type: "text", value: "Disconnected", color: "red" },
            { name: "ping", label: "Ping", type: "text", value: "0 ms" },
            { name: "valLoss", label: "Validation loss", type: "text", value: "0.0" },
            { name: "train", label: "Train", type: "checkbox", value: true },
            { name: "predict", label: "Predict", type: "checkbox", value: false, disabled: true },
            {
                name: "serverControls",
                type: "button-row",
                items: [
                    { action: "connect", label: "Connect" },
                    { action: "disconnect", label: "Disconnect", hidden: true },
                    { action: "reset", label: "Reset" },
                ]
            },

            { name: "store", label: "Store data", type: "checkbox", value: false },
            { name: "dataSize", label: "Data size", type: "text", value: "0 MB" },
            { name: "download", buttonLabel: "Download data", type: "button" },

            { name: "experiments", label: "Experiments", type: "file-chooser", multiple: true },

            { name: "transferFunction", label: "Transfer function", type: "transfer-function", value: new Uint8Array(256) },
        ]);

        this._transferFunctionBumps = [];

        this.addEventListener("change", e => {
            const { name, value, bind } = e.detail;

            const num = parseFloat(value);
            if (!isNaN(num)) {
                this[name] = num;
            }

            if (name === "modelFile") {
                const file = value[0];
                if (!file) return;
                loadModelFromFile(file, this, SHADERS.nn.model);
            }

            if (name === "experiments") {
                if (!value || value.length === 0) {
                    return;
                }
                this._loadExperiments(value);
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

            // Sample points buffer size depends on samples count
            if (name === "samples") {
                this._rebuildSamplePointsBuffer();
            }

            // Reset NN when parameter affecting radiance changes
            if ([
                "bounces",
                "steps",
                "anisotropy",
                "transferFunction",
                "filterEnabled",
                "extinction",
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
                    this._groundTruthZip["parameters.json"] =
                        strToU8(JSON.stringify(this._getParameters(), null, "    "));

                    // Store current transfer function as a file
                    this._groundTruthZip["transfer_function.json"] =
                        strToU8(JSON.stringify(this._transferFunctionBumps));

                    const zipped = zipSync(this._groundTruthZip);
                    const blob = new Blob([zipped], { type: "application/zip" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "ground_truth.zip";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
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
        const filterCode = commonCode + "\n" + SHADERS.renderers.NeuralCache.filter;
        const renderCode = commonCode + "\n" + SHADERS.renderers.NeuralCache.render;

        this._programs = {
            reset: device.createShaderModule({
                label: "WebGPUNeuralCacheRenderer reset shader module",
                code: resetCode,
            }),
            filter: device.createShaderModule({
                label: "WebGPUNeuralCacheRenderer filter shader module",
                code: filterCode,
            }),
            render: device.createShaderModule({
                label: "WebGPUNeuralCacheRenderer render shader module",
                code: renderCode,
            }),
        };

        this._createBuffers();
        this._createPipeline();
        this._initTimestampQueries();

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
        if (this._timestampQuerySet) {
            this._timestampQuerySet.destroy();
        }
        if (this._timestampResolveBuffer) {
            this._timestampResolveBuffer.destroy();
        }
        if (this._timestampStagingBuffer) {
            this._timestampStagingBuffer.destroy();
        }
        if (this._directTexture) {
            this._directTexture.destroy();
        }
        if (this._directSampler) {
            this._directSampler.destroy();
        }
        if (this._indirectTexture) {
            this._indirectTexture.destroy();
        }
        if (this._indirectSampler) {
            this._indirectSampler.destroy();
        }
        if (this.websocket !== undefined) {
            this.websocket.close();
        }
        super.destroy();
    }

    reset() {
        this._updateUniforms();
        resetFrame(this);
    }

    render() {
        if (this._playing) {
            this._frameCount++;
            this._cameraPresetAnimator.update();

            if (!this.accumulate) {
                this.reset();
            }

            this._updateUniforms();

            const startTime = performance.now();
            if (this.predict && this._model && !this._modelStale) {
                this._model.updateUniforms(
                    this._parseHexColor(this.background), this.samples);
                neuralRender(this);
            } else {
                renderFrame(this);
            }

            this._device.queue.onSubmittedWorkDone().then(() => {
                this._updateFPS(startTime, performance.now() - startTime);
            });

            this._processGroundTruth();
            this._processTimestamps();
        }
    }

    clearGroundTruth() {
        this._groundTruthBytes = 0;
        this._groundTruthFrames = 0;
        this._groundTruthZip = {};
        this._stagingBufferMapped = false;
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "dataSize", value: "0 MB" }
        }));
    }

    _updateConnectionButtons(connected) {
        const connectBtn = document.querySelector('button[data-action="connect"]');
        const disconnectBtn = document.querySelector('button[data-action="disconnect"]');
        if (connectBtn && disconnectBtn) {
            DOMUtils.toggle(connectBtn, !connected);
            DOMUtils.toggle(disconnectBtn, connected);
        }
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
        this._updateConnectionButtons(false);
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "status", value: "Disconnected", color: "red" }
        }));
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "ping", value: "0 ms" }
        }));
        this.dispatchEvent(new CustomEvent("change", {
            detail: { name: "valLoss", value: "0.0" }
        }));

        const predictBind = document.querySelector('[bind="predict"]');
        if (predictBind) {
            predictBind.checked = false;
            predictBind.disabled = true;
        }
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
            const jsonStr = new TextDecoder().decode(raw.subarray(0, nullIndex));
            const json = JSON.parse(jsonStr);
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
                    const shader = SHADERS.nn.model;
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
                    this._updateConnectionButtons(true);
                    const predictBind = document.querySelector('[bind="predict"]');
                    if (predictBind) {
                        predictBind.disabled = false;
                    }
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
                    if (json["val_loss"] !== null) {
                        this.dispatchEvent(new CustomEvent("change", {
                            detail: { name: "valLoss", value: json["val_loss"].toFixed(5) }
                        }));
                        this.dispatchEvent(new CustomEvent("metrics", {
                            detail: { valLoss: json["val_loss"], trainTime: json["train_time"] }
                        }));
                    }
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
            this.dispatchEvent(new CustomEvent("ground-truth-sent", {
                detail: { frameIndex: this._groundTruthFrames }
            }));
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
        return 80;
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
            size: pixels * this.samples * this.samplePointSize,
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

        if (this.samples !== undefined) {
            this._rebuildSamplePointsBuffer();
        }

        this._stagingBufferMapped = false;
        this.clearGroundTruth();

        if (this._model) {
            this._model.setResolution(this._resolution);
        }


        if (this._directTexture) {
            this._directTexture.destroy();
        }
        this._directTexture = this._device.createTexture({
            size: [this._resolution, this._resolution],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });
        this._directSampler = this._device.createSampler({
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "nearest",
            minFilter: "nearest",
        });

        if (this._indirectTexture) {
            this._indirectTexture.destroy();
        }
        this._indirectTexture = this._device.createTexture({
            size: [this._resolution, this._resolution],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });
        this._indirectSampler = this._device.createSampler({
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "nearest",
            minFilter: "nearest",
        });

        super._rebuildBuffers();
    }

    _rebuildSamplePointsBuffer() {
        const pixels = this._resolution * this._resolution;
        if (this._samplePointsBuffer) {
            this._samplePointsBuffer.destroy();
        }
        this._samplePointsBuffer = this._device.createBuffer({
            size: pixels * this.samples * this.samplePointSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
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

        this._volumeSamplingPipeline = this._device.createComputePipeline({
            label: "WebGPUNeuralCacheRenderer volume sampling pipeline",
            layout: "auto",
            compute: {
                module: this._programs.render,
                entryPoint: "volumeSampling",
                constants: {
                    WORKGROUP_SIZE_X: this._workgroup_size[0],
                    WORKGROUP_SIZE_Y: this._workgroup_size[1],
                },
            },
        });

        this._directIlluminationPipeline = this._device.createComputePipeline({
            label: "WebGPUNeuralCacheRenderer direct illumination pipeline",
            layout: "auto",
            compute: {
                module: this._programs.render,
                entryPoint: "directIllumination",
                constants: {
                    WORKGROUP_SIZE_X: this._workgroup_size[0],
                    WORKGROUP_SIZE_Y: this._workgroup_size[1],
                },
            },
        });

        this._indirectIlluminationPipeline = this._device.createComputePipeline({
            label: "WebGPUNeuralCacheRenderer indirect illumination pipeline",
            layout: "auto",
            compute: {
                module: this._programs.render,
                entryPoint: "indirectIllumination",
                constants: {
                    WORKGROUP_SIZE_X: this._workgroup_size[0],
                    WORKGROUP_SIZE_Y: this._workgroup_size[1],
                },
            },
        });

        this._composePipeline = this._device.createComputePipeline({
            label: "WebGPUNeuralCacheRenderer compose pipeline",
            layout: "auto",
            compute: {
                module: this._programs.render,
                entryPoint: "compose",
                constants: {
                    WORKGROUP_SIZE_X: this._workgroup_size[0],
                    WORKGROUP_SIZE_Y: this._workgroup_size[1],
                },
            },
        });

        this._accumulatePipeline = this._device.createComputePipeline({
            label: "WebGPUNeuralCacheRenderer accumulate pipeline",
            layout: "auto",
            compute: {
                module: this._programs.render,
                entryPoint: "accumulate",
                constants: {
                    WORKGROUP_SIZE_X: this._workgroup_size[0],
                    WORKGROUP_SIZE_Y: this._workgroup_size[1],
                },
            },
        });
    }

    _processGroundTruth() {
        const downloadData = this.store && this._groundTruthBytes < this.groundTruthMaxBytes;
        const sendData = this.serverConnected && this.train;

        if (this._stagingBufferMapped || !downloadData && !sendData) {
            return;
        }

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
                this._groundTruthZip[
                    "indirect_radiance_"
                    + this._groundTruthFrames.toString().padStart(4, "0")
                    + ".bin"
                ] = new Uint8Array(data.slice().buffer);
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

    _initTimestampQueries() {
        const supported = this.renderingContext?.timestampQueriesSupported ?? false;
        if (!supported) {
            this._timestampQuerySet = null;
            return;
        }

        const device = this._device;
        const count = 12; // 6 stages × 2 (begin/end)

        this._timestampQuerySet = device.createQuerySet({
            type: 'timestamp',
            count,
        });

        this._timestampResolveBuffer = device.createBuffer({
            size: count * 8,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });

        this._timestampStagingBuffer = device.createBuffer({
            size: count * 8,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        this._timestampStagingMapped = false;
        this._filterDispatchedThisFrame = false;

        this._stageTimeHistories = {
            sampleGeneration: [],
            directRadiance: [],
            indirectRadiance: [],
            filter: [],
            accumulate: [],
            compose: [],
        };

        this._stageSampleGeneration = 0;
        this._stageDirectRadiance = 0;
        this._stageIndirectRadiance = 0;
        this._stageFilter = 0;
        this._stageAccumulate = 0;
        this._stageCompose = 0;
    }

    _processTimestamps() {
        if (!this._timestampQuerySet || this._timestampStagingMapped) {
            return;
        }

        this._timestampStagingMapped = true;

        this._timestampStagingBuffer.mapAsync(GPUMapMode.READ).then(() => {
            const data = new BigUint64Array(this._timestampStagingBuffer.getMappedRange());

            const now = performance.now();
            const stageTimes = [
                Number(data[1] - data[0]) / 1e6,   // sample generation
                Number(data[3] - data[2]) / 1e6,   // direct radiance
                Number(data[5] - data[4]) / 1e6,   // indirect radiance
                this._filterDispatchedThisFrame ? Number(data[7] - data[6]) / 1e6 : -1,
                Number(data[9] - data[8]) / 1e6,   // accumulate
                Number(data[11] - data[10]) / 1e6, // compose
            ];

            const stageKeys = [
                'sampleGeneration', 'directRadiance', 'indirectRadiance',
                'filter', 'accumulate', 'compose',
            ];

            for (let i = 0; i < 6; i++) {
                const key = stageKeys[i];
                if (stageTimes[i] < 0) continue; // filter not dispatched

                this._stageTimeHistories[key].push({ start: now, time: stageTimes[i] });
                this._stageTimeHistories[key] = this._stageTimeHistories[key].filter(t => now - t.start < 500);
            }

            this._stageSampleGeneration = this._average(this._stageTimeHistories.sampleGeneration);
            this._stageDirectRadiance = this._average(this._stageTimeHistories.directRadiance);
            this._stageIndirectRadiance = this._average(this._stageTimeHistories.indirectRadiance);
            this._stageFilter = this._average(this._stageTimeHistories.filter);
            this._stageAccumulate = this._average(this._stageTimeHistories.accumulate);
            this._stageCompose = this._average(this._stageTimeHistories.compose);

            this._timestampStagingBuffer.unmap();
            this._timestampStagingMapped = false;
        });
    }

    _average(history) {
        if (history.length === 0) return 0;
        return history.reduce((acc, t) => acc + t.time, 0) / history.length;
    }

    _parseHexColor(hex) {
        return [
            parseInt(hex.slice(1, 3), 16) / 255,
            parseInt(hex.slice(3, 5), 16) / 255,
            parseInt(hex.slice(5, 7), 16) / 255,
        ];
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
        this._device.queue.writeBuffer(this._uniformBuffer, 112, new Float32Array(
            this._parseHexColor(this.background),
        ));

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

    _loadExperiments(files) {
        Promise.all(Array.from(files).map(f => f.text())).then(texts => {
            const experiments = texts.map(t => JSON.parse(t));
            const runner = new BenchmarkRunner(this, this.renderingContext, SHADERS.nn.model);
            runner.run(experiments);
        });
    }

    setVolume(volume) {
        super.setVolume(volume);
        this._cameraPresetAnimator.volume = volume;
    }

    getDirectTexture() {
        return this._directTexture;
    }

    getDirectTextureSampler() {
        return this._directSampler;
    }

    getIndirectTexture() {
        return this._indirectTexture;
    }

    getIndirectTextureSampler() {
        return this._indirectSampler;
    }

    get directCanvas() {
        return this._directCanvas;
    }

    get indirectCanvas() {
        return this._indirectCanvas;
    }

    blitLayerCanvases() {
        const ctx = this.renderingContext;
        const toneMapper = ctx.toneMapper;
        const pipeline = ctx.pipeline;
        const device = ctx.device;

        const layers = [
            { texture: this._directTexture, sampler: this._directSampler, context: this._directCanvasContext },
            { texture: this._indirectTexture, sampler: this._indirectSampler, context: this._indirectCanvasContext },
        ];

        for (const layer of layers) {
            toneMapper.setTexture(layer.texture, layer.sampler);
            toneMapper.render();

            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: toneMapper.getTexture().createView() },
                    { binding: 1, resource: toneMapper.getTextureSampler() },
                ]
            });

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: layer.context.getCurrentTexture().createView(),
                    clearValue: [0.0, 0.0, 0.0, 1.0],
                    loadOp: "clear",
                    storeOp: "store"
                }]
            });
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();
            device.queue.submit([encoder.finish()]);
        }
    }
}
