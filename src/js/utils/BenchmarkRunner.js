"use strict";

import { BlobLoader } from "../loaders/BlobLoader.js";
import { RAWReader } from "../readers/RAWReader.js";
import { applyParameters, applyTransferFunction } from "../nn/ModelUtils.js";

export class BenchmarkRunner {

    constructor(renderer, renderingContext) {
        this.renderer = renderer;
        this.renderingContext = renderingContext;
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
        if (this.isGroundTruth(experiment)) {
            await this.runGroundTruth(experiment);
        } else if (this.isImageExperiment(experiment)) {
            await this.runImageExperiment(experiment);
        }
    }

    isGroundTruth(experiment) {
        return experiment.radiance && !experiment.train_time && !experiment.benchmark_time;
    }

    isImageExperiment(experiment) {
        return !!experiment.rendering_time && !experiment.radiance
            && !experiment.train_time && !experiment.benchmark_time;
    }

    async runGroundTruth(experiment) {
        console.log(`[BenchmarkRunner] Starting ground truth: ${experiment.name}`);

        await this.setup(experiment);
        this.stop();
        this.setCameraPreset(experiment.vpt_config.camera_preset);
        this.enableStore();
        this.play();
        await this.waitForData();
        this.renderer._playing = false;
        await this.download(experiment);

        console.log(`[BenchmarkRunner] Completed ground truth: ${experiment.name}`);
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

    async setup(experiment) {
        await this.loadVolume(experiment);
        await this.loadTransferFunction(experiment);
        this.applyConfig(experiment.vpt_config);
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
        this.renderer._groundTruthZip.file(
            "parameters.json",
            JSON.stringify(this.renderer._getParameters(), null, "    "),
        );

        this.renderer._groundTruthZip.file(
            "transfer_function.json",
            JSON.stringify(this.renderer._transferFunctionBumps),
        );

        const blob = await this.renderer._groundTruthZip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
        });

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

    async captureAndDownload(experiment, mode) {
        const canvasMap = {
            "global": this.renderingContext.canvas,
            "direct": this.renderer.directCanvas,
            "indirect": this.renderer.indirectCanvas,
        };
        const canvas = canvasMap[mode];

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
