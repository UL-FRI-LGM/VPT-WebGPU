import { DOMUtils } from './utils/DOMUtils.js';

import './ui/UI.js';

import { LoaderFactory } from './loaders/LoaderFactory.js';
import { ReaderFactory } from './readers/ReaderFactory.js';

import { MainDialog } from './dialogs/MainDialog/MainDialog.js';
import { VolumeLoadDialog } from './dialogs/VolumeLoadDialog/VolumeLoadDialog.js';
import { EnvmapLoadDialog } from './dialogs/EnvmapLoadDialog/EnvmapLoadDialog.js';
import { TweakDialog } from './dialogs/TweakPaneDialog/TweakDialog.js';
import { DataMidlayer } from './DataMidlayer.js';
import { SettingsMidlayer } from './SettingsMidlayer.js';

import { RenderingContextDialog } from './dialogs/RenderingContextDialog/RenderingContextDialog.js';
import { DialogConstructor } from './dialogs/DialogConstructor.js';

import { RenderingContext } from './RenderingContext.js';
import { WebGPURenderingContext } from './WebGPURenderingContext.js';

import { PerspectiveCamera } from './PerspectiveCamera.js';

export class Application {

constructor() {

    this._handleFileDrop = this._handleFileDrop.bind(this);
    this._handleRendererChange = this._handleRendererChange.bind(this);
    this._handleToneMapperChange = this._handleToneMapperChange.bind(this);
    this._handleVolumeLoad = this._handleVolumeLoad.bind(this);
    this._handleEnvmapLoad = this._handleEnvmapLoad.bind(this);
    this._handleRecordAnimation = this._handleRecordAnimation.bind(this);

    this.binds = DOMUtils.bind(document.body);

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

    this.envmapLoadDialog = new EnvmapLoadDialog();
    this.mainDialog.getEnvmapLoadContainer().appendChild(this.envmapLoadDialog.object);
    this.envmapLoadDialog.addEventListener('load', this._handleEnvmapLoad);

    this.tweakDialog = new TweakDialog();

    this.dataMidlayer = new DataMidlayer(this.tweakDialog);
    this.dataMidlayer.addEventListener('loadVolume', this._handleVolumeLoad);
    this.dataMidlayer.addEventListener('loadEnv', this._handleVolumeLoad);

    this.settingsMidlayer = new SettingsMidlayer(this.tweakDialog);
    this.settingsMidlayer.addEventListener('changeRenderer', this._handleRendererChange);
    this.settingsMidlayer.addEventListener('changeToneMapper', this._handleToneMapperChange);
    //this.settingsMidlayer.addEventListener()
    //this.tweakDialog = new TweakDialog();
    //this.mainDialog.getTweakDialogContainer().appendChild(this.tweakDialog.object);

    this.renderingContextDialog = new RenderingContextDialog();
    this.mainDialog.getRenderingContextSettingsContainer().appendChild(
            this.renderingContextDialog.object);
    
    this.settingsMidlayer.addEventListener('resolution', e => { 
        this.renderingContext.resolution = e.detail.value;;
    });
    this.renderingContextDialog.addEventListener('resolution', e => {
        const resolution = this.renderingContextDialog.resolution;
        this.renderingContext.resolution = resolution;
    });
    this.renderingContextDialog.addEventListener('transformation', e => {
        const t = this.renderingContextDialog.translation;
        const r = this.renderingContextDialog.rotation;
        const s = this.renderingContextDialog.scale;
        // TODO fix model transform
    });
    this.renderingContextDialog.addEventListener('filter', e => {
        const filter = this.renderingContextDialog.filter;
        this.renderingContext.setFilter(filter);
    });
    this.settingsMidlayer.addEventListener('fullscreen', e => { 
        this.renderingContext.canvas.classList.toggle('fullscreen', e.detail.value);
    });
    this.renderingContextDialog.addEventListener('fullscreen', e => {
        console.log(this.renderingContextDialog.fullscreen);
        this.renderingContext.canvas.classList.toggle('fullscreen',
            this.renderingContextDialog.fullscreen);
    });

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

    this.mainDialog.addEventListener('rendererchange', this._handleRendererChange);
    this.mainDialog.addEventListener('tonemapperchange', this._handleToneMapperChange);

    
    this._handleRendererChange();
    this._handleToneMapperChange();

    this.mainDialog.addEventListener('recordanimation', this._handleRecordAnimation);
    ////////////////////////////////////////////////////////////////
    }); // TODO: Remove
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


_handleRendererChange(e) {
    if (this.rendererDialog) {
        this.rendererDialog.remove();
    }

    var which;
    if (e == null) {    
        which = 'eam';
    } else {
        which = e.detail.value;
    }
    this.renderingContext.chooseRenderer(which);
    const renderer = this.renderingContext.renderer;
    const object = DialogConstructor.construct(renderer.properties);
    this.settingsMidlayer._updateTweakpaneUI('renderer', renderer.properties);
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

}

_handleToneMapperChange(e) {
    if (this.toneMapperDialog) {
        this.toneMapperDialog.remove();
    }

    var which;
    if (e == null) {    
        which = 'artistic';
    } else {
        which = e.detail.value;
    }
    //const which = e.detail.value;
    this.renderingContext.chooseToneMapper(which);
    const toneMapper = this.renderingContext.toneMapper;
    const object = DialogConstructor.construct(toneMapper.properties);
    this.settingsMidlayer._updateTweakpaneUI('toneMapper', toneMapper.properties);
    //TODO use tonemapper properties to contact settingsmidlayer, providing options in the UI
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

async _handleVolumeLoad(e) {
    //console.log(e);
    const options = e.detail;
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
            await this.renderingContext.setVolume(reader);
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

_handleTweakLoad(e) {
    console.log(loaded);
}

}
