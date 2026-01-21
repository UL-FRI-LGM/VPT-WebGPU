import { DOMUtils } from '../../utils/DOMUtils.js';

const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./MainDialog.html', import.meta.url))
    .then(response => response.text());

const aboutTemplate = await fetch(new URL('./AboutText.html', import.meta.url))
    .then(response => response.text());

export class MainDialog extends EventTarget {

constructor() {
    super();

    this.object = template.content.cloneNode(true);
    this.binds = DOMUtils.bind(this.object);

    this._handleRendererChange = this._handleRendererChange.bind(this);
    this._handleToneMapperChange = this._handleToneMapperChange.bind(this);
    this._handleRecordAnimation = this._handleRecordAnimation.bind(this);
    this._handleNeuralPlay = this._handleNeuralPlay.bind(this);
    this._handleNeuralPause = this._handleNeuralPause.bind(this);
    this._handleNeuralStop = this._handleNeuralStop.bind(this);

    this.binds.rendererSelect.addEventListener('change', this._handleRendererChange);
    this.binds.toneMapperSelect.addEventListener('change', this._handleToneMapperChange);

    const about = DOMUtils.instantiate(aboutTemplate);
    this.binds.about.appendChild(about);

    this.binds.record.addEventListener('click', this._handleRecordAnimation);
    this.binds.neuralPlay.addEventListener('click', this._handleNeuralPlay);
    this.binds.neuralPause.addEventListener('click', this._handleNeuralPause);
    this.binds.neuralStop.addEventListener('click', this._handleNeuralStop);
}

getVolumeLoadContainer() {
    return this.binds.volumeLoadContainer;
}

getEnvmapLoadContainer() {
    return this.binds.envmapLoadContainer;
}

getRendererSettingsContainer() {
    return this.binds.rendererSettingsContainer;
}

getToneMapperSettingsContainer() {
    return this.binds.toneMapperSettingsContainer;
}

getRenderingContextSettingsContainer() {
    return this.binds.renderingContextSettingsContainer;
}

getSelectedRenderer() {
    return this.binds.rendererSelect.value;
}

getSelectedToneMapper() {
    return this.binds.toneMapperSelect.value;
}

_handleRendererChange() {
    this.dispatchEvent(new Event('rendererchange'));
}

_handleToneMapperChange() {
    this.dispatchEvent(new Event('tonemapperchange'));
}

_handleRecordAnimation() {
    this.dispatchEvent(new CustomEvent('recordanimation', {
        detail: {
            type: this.binds.type.value,
            startTime: Number(this.binds.startTime.value),
            endTime: Number(this.binds.endTime.value),
            frameTime: Number(this.binds.frameTime.value),
            fps: Number(this.binds.fps.value),
        }
    }));
}

_handleNeuralPlay() {
    this.dispatchEvent(new Event('neuralplay'));
}

_handleNeuralPause() {
    this.dispatchEvent(new Event('neuralpause'));
}

_handleNeuralStop() {
    this.dispatchEvent(new Event('neuralstop'));
}

}
