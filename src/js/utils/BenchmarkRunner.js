"use strict";

import { BlobLoader } from "../loaders/BlobLoader.js";
import { RAWReader } from "../readers/RAWReader.js";
import { applyParameters, applyTransferFunction, loadModelFromURL } from "../nn/ModelUtils.js";
import { Zip, ZipDeflate, strToU8 } from "../../lib/fflate-module.js";

export class BenchmarkRunner {

    constructor(renderer, renderingContext, shader) {
        this.renderer = renderer;
        this.renderingContext = renderingContext;
        this.shader = shader;
    }

    async run(experiments) {
        for (const experiment of experiments) {
            await this.runExperiment(experiment);
        }
        console.log("[BenchmarkRunner] Experiments finished");
        this.stop();

        const el = document.querySelector('[bind="experiments"]');
        if (el) {
            el.binds.input.value = "";
            el.binds.label.innerText = "";
        }
    }

    async runExperiment(experiment) {
        switch (experiment.type) {
            case "model": await this.runModelExperiment(experiment); break;
            case "image": await this.runImageExperiment(experiment); break;
            case "performance": await this.runPerformanceExperiment(experiment); break;
            case "online": await this.runOnlineExperiment(experiment); break;
            case "quality": await this.runQualityExperiment(experiment); break;
        }
    }

    async runModelExperiment(experiment) {
        console.log(`[BenchmarkRunner] Starting model: ${experiment.name}`);

        await this.setup(experiment);
        this.stop();
        this.setCameraPreset(experiment.vpt_config.camera_preset);
        this.enableStore();
        this.play();
        await this.waitForData();
        this.renderer._playing = false;
        await this.download(experiment);

        console.log(`[BenchmarkRunner] Completed model: ${experiment.name}`);
    }

    async runImageExperiment(experiment) {
        console.log(`[BenchmarkRunner] Starting image rendering: ${experiment.name}`);

        await this.setup(experiment);
        this.stop();
        this.setCameraPreset(experiment.vpt_config.camera_preset);
        this.renderer.mode = "global";
        const modeEl = document.querySelector('[bind="mode"]');
        if (modeEl) {
            modeEl.value = "global";
        }
        this.play();

        const durationMs = this.parseTime(experiment.rendering_time);
        await this.waitForTime(durationMs);

        const displayModes = experiment.display_modes || ["global"];
        for (const mode of displayModes) {
            await this.captureAndDownload(experiment, mode);
        }

        console.log(`[BenchmarkRunner] Completed image rendering: ${experiment.name}`);
    }

    async runPerformanceExperiment(experiment) {
        console.log(`[BenchmarkRunner] Starting performance: ${experiment.name}`);

        if (experiment.model) {
            const modelUrl = `http://${experiment.file_server}/${experiment.model}`;
            const response = await fetch(modelUrl, { method: "HEAD" });
            if (!response.ok) {
                console.log(`[BenchmarkRunner] Model not available, generating radiance: ${experiment.name}`);
                await this.runModelExperiment(experiment);
                return;
            }
        }

        await this.setup(experiment);
        this.stop();
        this.setCameraPreset(experiment.vpt_config.camera_preset);

        if (experiment.model) {
            const modelUrl = `http://${experiment.file_server}/${experiment.model}`;
            await loadModelFromURL(modelUrl, this.renderer, this.shader);
            this.renderer.predict = true;
        }

        const totalDurationMs = this.parseTime(experiment.benchmark_time);
        const intervalMs = this.parseTime(experiment.interval);

        this.renderer._frameCount = 0;
        const metrics = [];
        const startTime = performance.now();
        let nextInterval = intervalMs;

        this.play();

        await new Promise(resolve => {
            const timer = setInterval(() => {
                const elapsed = performance.now() - startTime;

                if (elapsed >= totalDurationMs) {
                    clearInterval(timer);
                    resolve();
                    return;
                }

                if (elapsed < nextInterval) {
                    return;
                }
                nextInterval += intervalMs;

                const fps = parseFloat(this.renderer._fps) || 0;
                const frameTime = parseFloat(this.renderer._frameTime) || 0;

                const stageSample = this.renderer._stageSampleGeneration?.toFixed(3) ?? -1;
                const stageDirect = this.renderer._stageDirectRadiance?.toFixed(3) ?? -1;
                const stageIndirect = this.renderer._stageIndirectRadiance?.toFixed(3) ?? -1;
                const stageFilter = this.renderer._filterDispatchedThisFrame ? (this.renderer._stageFilter?.toFixed(3) ?? -1) : -1;
                const stageAccumulate = this.renderer._stageAccumulate?.toFixed(3) ?? -1;
                const stageCompose = this.renderer._stageCompose?.toFixed(3) ?? -1;

                metrics.push(
                    `${(elapsed / 1000).toFixed(3)},${this.renderer._frameCount},${fps},${frameTime},${stageSample},${stageDirect},${stageIndirect},${stageFilter},${stageAccumulate},${stageCompose}`
                );
            }, 500);
        });

        this.renderer._playing = false;

        const csvContent = "time,frame_index,fps,frame_time,stage_sample_gen,stage_direct,stage_indirect,stage_filter,stage_accumulate,stage_compose\n" + metrics.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${experiment.name}_performance.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[BenchmarkRunner] Completed performance: ${experiment.name}`);
    }

    async runOnlineExperiment(experiment) {
        console.log(`[BenchmarkRunner] Starting online: ${experiment.name}`);

        await this.setup(experiment);

        // Connect to training server
        const connected = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.renderer.removeEventListener("change", handler);
                resolve(false);
            }, 5000);

            const handler = (e) => {
                if (e.detail.name === "status" && e.detail.value === "Connected") {
                    clearTimeout(timeout);
                    this.renderer.removeEventListener("change", handler);
                    resolve(true);
                }
            };
            this.renderer.addEventListener("change", handler);
            this.renderer.trainServerConnect(experiment.train_server);
        });

        if (!connected) {
            console.error(`[BenchmarkRunner] Failed to connect to training server: ${experiment.train_server}`);
            return;
        }

        this.stop();
        this.renderer.trainServerSend("seed", { seed: experiment.seed });
        this.setCameraPreset(experiment.vpt_config.camera_preset);

        // Enable training
        this.renderer.train = true;
        const trainEl = document.querySelector('[bind="train"]');
        if (trainEl) {
            trainEl.checked = true;
        }

        const totalDurationMs = this.parseTime(experiment.benchmark_time);
        const pendingFrames = [];
        const metrics = [];
        const startTime = performance.now();

        // Track which frames were sent for training
        const gtHandler = (e) => {
            pendingFrames.push(e.detail.frameIndex);
        };
        this.renderer.addEventListener("ground-truth-sent", gtHandler);

        // Track validation loss responses
        const metricsHandler = (e) => {
            if (pendingFrames.length === 0) {
                return;
            }
            const frameIndex = pendingFrames.shift();
            const elapsed = performance.now() - startTime;
            const fps = parseFloat(this.renderer._fps) || 0;
            const frameTime = parseFloat(this.renderer._frameTime) || 0;
            const valLoss = e.detail.valLoss.toFixed(5);
            const trainTime = e.detail.trainTime.toFixed(3);
            metrics.push(`${elapsed.toFixed(1)},${frameIndex},${valLoss},${trainTime},${fps},${frameTime}`);
        };
        this.renderer.addEventListener("metrics", metricsHandler);

        this.play();

        await new Promise(resolve => {
            const timer = setInterval(() => {
                if (performance.now() - startTime >= totalDurationMs) {
                    clearInterval(timer);
                    resolve();
                }
            }, 500);
        });

        this.renderer._playing = false;
        this.renderer.train = false;
        this.renderer.removeEventListener("ground-truth-sent", gtHandler);
        this.renderer.removeEventListener("metrics", metricsHandler);
        this.renderer.trainServerDisconnect();

        const csvContent = "time_ms,frame_index,val_loss,train_time_ms,fps,frame_time\n" + metrics.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${experiment.name}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[BenchmarkRunner] Completed online: ${experiment.name}`);
    }

    async runQualityExperiment(experiment) {
        console.log(`[BenchmarkRunner] Starting quality: ${experiment.name}`);

        if (experiment.model) {
            const modelUrl = `http://${experiment.file_server}/${experiment.model}`;
            const response = await fetch(modelUrl, { method: "HEAD" });
            if (!response.ok) {
                console.log(`[BenchmarkRunner] Model not available, generating radiance: ${experiment.name}`);
                await this.runModelExperiment(experiment);
                return;
            }
        }

        await this.setup(experiment);
        this.stop();
        this.setCameraPreset(experiment.vpt_config.camera_preset);

        if (experiment.model) {
            const modelUrl = `http://${experiment.file_server}/${experiment.model}`;
            await loadModelFromURL(modelUrl, this.renderer, this.shader);
            this.renderer.predict = true;
        }

        const totalDurationMs = this.parseTime(experiment.benchmark_time);
        const intervalMs = this.parseTime(experiment.interval);
        const runs = experiment.runs || 1;
        const displayModes = experiment.display_modes || ["global"];
        const canvasMap = {
            "global": this.renderingContext.canvas,
            "direct": this.renderer.directCanvas,
            "indirect": this.renderer.indirectCanvas,
        };

        const images = [];

        for (let run = 0; run < runs; run++) {
            console.log(`[BenchmarkRunner] Run ${run + 1}/${runs}`);
            this.stop();

            this.play();

            const startTime = performance.now();
            let nextInterval = intervalMs;
            let i = 0;

            await new Promise(resolve => {
                const timer = setInterval(async () => {
                    const elapsed = performance.now() - startTime;

                    if (elapsed >= totalDurationMs) {
                        clearInterval(timer);
                        resolve();
                        return;
                    }

                    if (elapsed < nextInterval) {
                        return;
                    }
                    nextInterval += intervalMs;

                    const elapsedMs = elapsed.toFixed(0);
                    const index = i.toString().padStart(3, "0");
                    for (const mode of displayModes) {
                        const canvas = canvasMap[mode];
                        const blob = await this.captureCanvasBlob(canvas);
                        images.push({
                            name: `${run}/${mode}/${index}_${elapsedMs}.png`,
                            data: blob,
                        });
                    }
                    i++;
                }, 10);
            });

            this.renderer._playing = false;
        }

        const chunks = [];
        const zip = new Zip((err, chunk, final) => {
            if (err) throw err;
            chunks.push(chunk);
        });

        for (const image of images) {
            const entry = new ZipDeflate(image.name, { level: 1 });
            zip.add(entry);
            entry.push(new Uint8Array(await image.data.arrayBuffer()), true);
            await new Promise(r => setTimeout(r, 0));
        }
        zip.end();

        const zipBlob = new Blob(chunks, { type: "application/zip" });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${experiment.name}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[BenchmarkRunner] Completed quality: ${experiment.name}`);
    }

    async setup(experiment) {
        await this.loadVolume(experiment);
        await this.loadTransferFunction(experiment);
        this.applyConfig(experiment.vpt_config);
        this.renderer.predict = false;
        const predictEl = document.querySelector('[bind="predict"]');
        if (predictEl) {
            predictEl.checked = false;
        }
    }

    async loadVolume(experiment) {
        const fileServer = experiment.file_server;
        const volumePath = experiment.volume;
        const url = `http://${fileServer}/${volumePath}`;

        // Parse dimensions from filename: name_WxHxD_...raw
        const match = volumePath.match(/(\d+)x(\d+)x(\d+)/);
        if (!match) {
            throw new Error(`Cannot parse dimensions from volume path: ${volumePath}`);
        }
        const width = parseInt(match[1]);
        const height = parseInt(match[2]);
        const depth = parseInt(match[3]);

        const response = await fetch(url);
        const blob = await response.blob();
        const loader = new BlobLoader(blob);
        const reader = new RAWReader(loader, { width, height, depth });

        this.renderingContext.stopRendering();
        await this.renderingContext.setVolume(reader);
        this.renderingContext.startRendering();
    }

    async loadTransferFunction(experiment) {
        const fileServer = experiment.file_server;
        const tfPath = experiment.transfer_function;
        const url = `http://${fileServer}/${tfPath}`;

        const response = await fetch(url);
        const transferFunction = await response.json();
        applyTransferFunction(transferFunction);
    }

    applyConfig(config) {
        const { camera_preset, background, resolution, ...parameters } = config;

        applyParameters(this.renderer, parameters);

        if (resolution) {
            this.renderingContext.resolution = resolution;
            const el = document.querySelector('[bind="resolution"]');
            if (el) {
                el.value = resolution;
            }
        }

        if (background) {
            this.renderer.background = background;
            const el = document.querySelector('[bind="background"]');
            if (el) {
                el.value = background;
            }
        }
    }

    stop() {
        this.renderer._playing = false;
        this.renderer._cameraPresetAnimator.reset();
        this.renderer.clearGroundTruth();
        this.renderer.reset();
    }

    setCameraPreset(preset) {
        if (!preset) return;
        this.renderer._cameraPresetAnimator.setPreset(preset);
        this.renderer._cameraPresetAnimator.reset();

        const el = document.querySelector('[bind="cameraPreset"]');
        if (el) {
            el.value = preset;
        }
    }

    enableStore() {
        this.renderer.store = true;
        const el = document.querySelector('[bind="store"]');
        if (el) {
            el.checked = true;
        }
    }

    play() {
        this.renderer._playing = true;
    }

    async waitForData() {
        return new Promise(resolve => {
            const check = () => {
                if (this.renderer._groundTruthBytes >= this.renderer.groundTruthMaxBytes) {
                    resolve();
                } else {
                    setTimeout(check, 500);
                }
            };
            check();
        });
    }

    async download(experiment) {
        this.renderer._groundTruthZip["parameters.json"] =
            strToU8(JSON.stringify(this.renderer._getParameters(), null, "    "));
        this.renderer._groundTruthZip["transfer_function.json"] =
            strToU8(JSON.stringify(this.renderer._transferFunctionBumps));

        const chunks = [];
        const zip = new Zip((err, chunk, final) => {
            if (err) throw err;
            chunks.push(chunk);
        });

        const names = Object.keys(this.renderer._groundTruthZip);
        for (const name of names) {
            console.log(`[BenchmarkRunner] Compressing ${name}`);
            const data = this.renderer._groundTruthZip[name];
            const entry = new ZipDeflate(name, { level: 1 });
            zip.add(entry);
            entry.push(data, true);
            delete this.renderer._groundTruthZip[name];
            await new Promise(r => setTimeout(r, 0));
        }
        zip.end();

        const blob = new Blob(chunks, { type: "application/zip" });

        const filename = experiment.radiance.split("/").reverse()[0];
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    parseTime(timeString) {
        const match = timeString.match(/^(\d+)(ms|s|m)$/);
        if (!match) {
            throw new Error(`Cannot parse time: ${timeString}`);
        }
        const value = parseInt(match[1]);
        const unit = match[2];
        switch (unit) {
            case "ms": return value;
            case "s":  return value * 1000;
            case "m":  return value * 60 * 1000;
        }
    }

    async waitForTime(durationMs) {
        return new Promise(resolve => setTimeout(resolve, durationMs));
    }

    async captureCanvasBlob(canvas) {
        let blob = await new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob), "image/png");
        });

        if (!blob) {
            const tmpCanvas = document.createElement("canvas");
            tmpCanvas.width = canvas.width;
            tmpCanvas.height = canvas.height;
            const ctx = tmpCanvas.getContext("2d");
            ctx.drawImage(canvas, 0, 0);
            blob = await new Promise(resolve => {
                tmpCanvas.toBlob(blob => resolve(blob), "image/png");
            });
        }

        if (!blob) {
            throw new Error("Failed to capture canvas as PNG");
        }

        return blob;
    }

    async captureAndDownload(experiment, mode) {
        const canvasMap = {
            "global": this.renderingContext.canvas,
            "direct": this.renderer.directCanvas,
            "indirect": this.renderer.indirectCanvas,
        };
        const canvas = canvasMap[mode];
        const blob = await this.captureCanvasBlob(canvas);

        const filename = `${experiment.name}_${mode}.png`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

}
