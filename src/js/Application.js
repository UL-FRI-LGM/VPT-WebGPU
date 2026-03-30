import { DOMUtils } from './utils/DOMUtils.js';

import './ui/UI.js';

import { LoaderFactory } from './loaders/LoaderFactory.js';
import { ReaderFactory } from './readers/ReaderFactory.js';

import { MainDialog } from './dialogs/MainDialog/MainDialog.js';
import { VolumeLoadDialog } from './dialogs/VolumeLoadDialog/VolumeLoadDialog.js';
import { EnvmapLoadDialog } from './dialogs/EnvmapLoadDialog/EnvmapLoadDialog.js';
import { RenderingContextDialog } from './dialogs/RenderingContextDialog/RenderingContextDialog.js';
import { DialogConstructor } from './dialogs/DialogConstructor.js';

import { RenderingContext } from './RenderingContext.js';
import { WebGPURenderingContext } from './WebGPURenderingContext.js';

import { PerspectiveCamera } from './PerspectiveCamera.js';
import { quat, mat4 } from '../lib/gl-matrix-module.js';

export class Application {

constructor() {
    this._handleFileDrop = this._handleFileDrop.bind(this);
    this._handleRendererChange = this._handleRendererChange.bind(this);
    this._handleToneMapperChange = this._handleToneMapperChange.bind(this);
    this._handleVisualizationChange = this._handleVisualizationChange.bind(this);
    this._handleCutPlaneChange = this._handleCutPlaneChange.bind(this);
    this._handleVolumeLoad = this._handleVolumeLoad.bind(this);
    this._handleEnvmapLoad = this._handleEnvmapLoad.bind(this);
    this._handleRecordAnimation = this._handleRecordAnimation.bind(this);

    this.binds = DOMUtils.bind(document.body);
    // console.log(this.binds);

    this.renderingContext = new WebGPURenderingContext(() => {
    ////////////////////////////////////////////////////////////////
    this.binds.canvasContainer.appendChild(this.renderingContext.canvas);

    document.body.addEventListener('dragover', e => e.preventDefault());
    document.body.addEventListener('drop', this._handleFileDrop);

    this.mainDialog = new MainDialog();
    this.binds.sidebarContainer.appendChild(this.mainDialog.object);

    this.volumeLoadDialog = new VolumeLoadDialog();
    this.mainDialog.getVolumeLoadContainer().appendChild(this.volumeLoadDialog.object);
    this.volumeLoadDialog.addEventListener('load', this._handleVolumeLoad);
    // console.log(this.volumeLoadDialog);

    this.envmapLoadDialog = new EnvmapLoadDialog();
    this.mainDialog.getEnvmapLoadContainer().appendChild(this.envmapLoadDialog.object);
    this.envmapLoadDialog.addEventListener('load', this._handleEnvmapLoad);
    // console.log(this.envmapLoadDialog);

    this.renderingContextDialog = new RenderingContextDialog();
    this.mainDialog.getRenderingContextSettingsContainer().appendChild(
            this.renderingContextDialog.object);
    this.renderingContextDialog.addEventListener('resolution', e => {
        const resolution = this.renderingContextDialog.resolution;
        this.renderingContext.resolution = resolution;
    });

    // this.modelTransform = new Transform();
    this.renderingContextDialog.addEventListener('transformation', e => {
        this.renderingContext.setVolMat(quat.fromEuler(quat.create(), ...this.renderingContextDialog.rotation), this.renderingContextDialog.translation, this.renderingContextDialog.scale);
        // this.modelTransform.localTranslation = this.renderingContextDialog.translation;
        // this.modelTransform.localRotation = quat.fromEuler(quat.create(), ...this.renderingContextDialog.rotation);
        // this.modelTransform.localScale = this.renderingContextDialog.scale;
        // TODO fix model transform

        // console.log(quat.fromEuler(quat.create(), ...this.renderingContextDialog.rotation), this.renderingContextDialog.translation, this.renderingContextDialog.scale);
    });
    // console.log(this.renderingContextDialog.translation, this.renderingContextDialog.rotation, this.renderingContextDialog.scale);
    this.renderingContextDialog.addEventListener('filter', e => {
        const filter = this.renderingContextDialog.filter;
        this.renderingContext.setFilter(filter);
    });
    this.renderingContextDialog.addEventListener('fullscreen', e => {
        this.renderingContext.canvas.classList.toggle('fullscreen',
            this.renderingContextDialog.fullscreen);
    });

    // console.log(this.renderingContextDialog);

    new ResizeObserver(entries => {
        const size = entries[0].contentBoxSize[0];
        const camera = this.renderingContext.camera.getComponent(PerspectiveCamera);
        camera.aspect = size.inlineSize / size.blockSize;
    }).observe(this.renderingContext.canvas);

    this.renderingContext.addEventListener('progress', e => {
        this.volumeLoadDialog.binds.loadProgress.value = e.detail;
    });

    this.renderingContext.addEventListener('animationprogress', e => {
        this.mainDialog.binds.animationProgress.value = e.detail;
    });
    
    let imgData = null;

    this.mainDialog.addEventListener('rendererchange', this._handleRendererChange);
    this.mainDialog.addEventListener('visualizationchange', this._handleVisualizationChange);
    this.mainDialog.addEventListener('cutplanechange', this._handleCutPlaneChange);
    this.mainDialog.addEventListener('tonemapperchange', this._handleToneMapperChange);
    this.mainDialog.addEventListener('computeclusters', e => {
        this.renderingContext._handleClusterCompute(e)
        .then(img => {imgData = img;})
        .then(e => {
            return fetch('/bumps')
            .then(r => r.json())
            .then(e => {
                // console.log(e);
                this._handleRendererChange(imgData, e);
            });
        }); // mogoče lhko preko tega naloudam še json
    });
    this._handleRendererChange();
    this._handleToneMapperChange();
    this._handleVisualizationChange();

    this.mainDialog.addEventListener('recordanimation', this._handleRecordAnimation);
    ////////////////////////////////////////////////////////////////
    }); // TODO: Remove

    this.volumeDetails = [];
    this.volumeDetailsOld = [];
    // this._handleCutPlaneChange();
}

async _handleRecordAnimation(e) {
    this.renderingContext.recordAnimation(e.detail);
}

_handleFileDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length === 0) {
        return;
    }
    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.bvp')) {
        throw new Error('Filename extension must be .bvp');
    }
    this._handleVolumeLoad(new CustomEvent('load', {
        detail: {
            type       : 'file',
            file       : file,
            filetype   : 'bvp',
            dimensions : { x: 0, y: 0, z: 0 }, // doesn't matter
            precision  : 8, // doesn't matter
        }
    }));
}

_handleRendererChange(img = null, bumpsData = null) {
    if (this.rendererDialog) {
        this.rendererDialog.remove();
    }

    const which = this.mainDialog.getSelectedRenderer();
    this.renderingContext.chooseRenderer(which);
    const renderer = this.renderingContext.renderer;
    
    const object = DialogConstructor.construct(renderer.properties);
    let i = 0;
    object.childNodes.forEach(element => {
        if (element.nodeName == "DIV" && !isNaN(element.textContent) || element.nodeName == "DIV" && element.textContent == this.volumeDetailsOld[i]) {
            let index = parseInt(element.textContent);
            element.textContent = this.volumeDetails[index];
            i++;
        }
        if (element.nodeName == "UI-TRANSFER-FUNCTION" || element.nodeName == "UI-TRANSFER-FUNCTION-1D") {
            element.style.backgroundRepeat = "no-repeat";
            if (img != null)
                element.style.backgroundImage = 'url('+img+')';
            else
                element.style.backgroundImage = "none";
        }
        if (element.nodeName == "UI-TRANSFER-FUNCTION" && bumpsData != null) {
            console.log(bumpsData);
            element.dispatchEvent(new CustomEvent('computed', {
                detail: bumpsData
            }));
        }
    });
    this.volumeDetailsOld = this.volumeDetails;
    
    const binds = DOMUtils.bind(object);
    this.rendererDialog = object;
    for (const name in binds) {
        binds[name].addEventListener('change', e => {
            const value = binds[name].value;
            renderer[name] = value;
            renderer.dispatchEvent(new CustomEvent('change', {
                detail: { name, value }
            }));
        });
    }
    const container = this.mainDialog.getRendererSettingsContainer();
    container.appendChild(this.rendererDialog);
    this._handleVisualizationChange();
}

_handleToneMapperChange() {
    if (this.toneMapperDialog) {
        this.toneMapperDialog.remove();
    }

    const which = this.mainDialog.getSelectedToneMapper();
    this.renderingContext.chooseToneMapper(which);
    const toneMapper = this.renderingContext.toneMapper;
    const object = DialogConstructor.construct(toneMapper.properties);
    const binds = DOMUtils.bind(object);
    this.toneMapperDialog = object;
    for (const name in binds) {
        binds[name].addEventListener('change', e => {
            const value = binds[name].value;
            toneMapper[name] = value;
            toneMapper.dispatchEvent(new CustomEvent('change', {
                detail: { name, value }
            }));
        });
    }
    const container = this.mainDialog.getToneMapperSettingsContainer();
    container.appendChild(this.toneMapperDialog);
}

_handleVisualizationChange() {
    this.mainDialog.setVisualizationParameters(this.mainDialog.getSelectedVisualization());
    // console.log(this.renderingContext);
    // console.log(this.renderingContext?.renderer);
    switch (this.mainDialog.getSelectedVisualization()) {
        case "tsne":
            this.renderingContext.renderer.setVisMode(0);
            this.mainDialog.setVisibleTFs(0);
            break;
        case "umap":
            this.renderingContext.renderer.setVisMode(0);
            this.mainDialog.setVisibleTFs(0);
            break;
        case "basic":
            this.renderingContext.renderer.setVisMode(1);
            this.mainDialog.setVisibleTFs(1);
            break;
        case "perchan":
            this.renderingContext.renderer.setVisMode(2);
            this.mainDialog.setVisibleTFs(2);
            break;
        default:
            this.renderingContext.renderer.setVisMode(2);
            this.mainDialog.setVisibleTFs(2);
            break;
    }
}

_handleCutPlaneChange() {
    const minCutPlane = this.mainDialog.getMinCutPlane();
    const maxCutPlane = this.mainDialog.getMaxCutPlane();
    const viewCutDistance = this.mainDialog.getViewCutDistance();
    this.renderingContext.renderer.setMinCutPlane(minCutPlane); // nastavim vrednosti
    this.renderingContext.renderer.setMaxCutPlane(maxCutPlane);
    this.renderingContext.renderer.setViewCutDistance(viewCutDistance);
}

async _handleVolumeLoad(e) {
    const options = e.detail;
    // console.log(options);
    if (options.type === 'file') {
        const readerClass = ReaderFactory(options.filetype);
        if (readerClass) {
            const loaderClass = LoaderFactory('blob');
            const loader = new loaderClass(options.file);
            const reader = new readerClass(loader, {
                width  : options.dimensions[0],
                height : options.dimensions[1],
                depth  : options.dimensions[2],
                bits   : options.precision,
            });
            this.renderingContext.stopRendering();
            var numModalities = await reader.readMetadata();
            let filenames = await numModalities.modalities[0].files;
            this.volumeDetails = [];
            filenames.forEach(element => {
                let temp = element.split("/");
                this.volumeDetails.push(temp[temp.length-1].split(".")[0]);
            });
            // console.log(this.volumeDetails); // tole rabi nekako prit do TF
            // console.log(numModalities.modalities[0]);
            await this.renderingContext.setVolumes(reader, numModalities.modalities);
            this.renderingContext.startRendering();
        }
    } else if (options.type === 'url') {
        const readerClass = ReaderFactory(options.filetype);
        if (readerClass) {
            const loaderClass = LoaderFactory('ajax');
            const loader = new loaderClass(options.url);
            const reader = new readerClass(loader);
            this.renderingContext.stopRendering();
            await this.renderingContext.setVolume(reader);
            this.renderingContext.startRendering();
        }
    }
    this._handleRendererChange(this.renderingContext.volume[0].tfAccumulatedGM); // pokličem še enkrat da nalouda skalkuliran histogram v ozadje
}

_handleEnvmapLoad(e) {
    const options = e.detail;
    let image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', async () => {
        await this.renderingContext.setEnvironmentMap(image);
        this.renderingContext.renderer.reset();
    });

    if (options.type === 'file') {
        let reader = new FileReader();
        reader.addEventListener('load', () => {
            image.src = reader.result;
        });
        reader.readAsDataURL(options.file);
    } else if (options.type === 'url') {
        image.src = options.url;
    }
}

}
