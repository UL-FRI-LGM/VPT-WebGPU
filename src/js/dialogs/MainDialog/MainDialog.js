import { DOMUtils } from '../../utils/DOMUtils.js';

const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./MainDialog.html', import.meta.url))
    .then(response => response.text());

const aboutTemplate = await fetch(new URL('./AboutText.html', import.meta.url))
    .then(response => response.text());

export class MainDialog extends EventTarget {

constructor() {
    super();

    // console.log(template.content.cloneNode(true));
    this.object = template.content.cloneNode(true);
    this.binds = DOMUtils.bind(this.object);
    // console.log(this.binds);

    this._handleRendererChange = this._handleRendererChange.bind(this);
    // console.log(this._handleRendererChange);
    this._handleToneMapperChange = this._handleToneMapperChange.bind(this);
    this._handleVisualizationChange = this._handleVisualizationChange.bind(this);
    this._handleCutPlaneChange = this._handleCutPlaneChange.bind(this);
    this._handleRecordAnimation = this._handleRecordAnimation.bind(this);
    this._handleComputeClick = this._handleComputeClick.bind(this);

    this.binds.rendererSelect.addEventListener('change', this._handleRendererChange);
    this.binds.toneMapperSelect.addEventListener('change', this._handleToneMapperChange);
    this.binds.visselect.addEventListener('change', this._handleVisualizationChange);
    this.binds.minX.addEventListener('change', this._handleCutPlaneChange);
    this.binds.minY.addEventListener('change', this._handleCutPlaneChange);
    this.binds.minZ.addEventListener('change', this._handleCutPlaneChange);
    this.binds.maxX.addEventListener('change', this._handleCutPlaneChange);
    this.binds.maxY.addEventListener('change', this._handleCutPlaneChange);
    this.binds.maxZ.addEventListener('change', this._handleCutPlaneChange);
    this.binds.cutDistance.addEventListener('change', this._handleCutPlaneChange);

    const about = DOMUtils.instantiate(aboutTemplate);
    this.binds.about.appendChild(about);

    this.binds.record.addEventListener('click', this._handleRecordAnimation);
    this.binds.compute.addEventListener('click', this._handleComputeClick);
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

getSelectedVisualization() {
    return this.binds.visselect.value;
}

getMinCutPlane() {
    return [this.binds.minX.value, this.binds.minY.value, this.binds.minZ.value];
}

getMaxCutPlane() {
    return [this.binds.maxX.value, this.binds.maxY.value, this.binds.maxZ.value];
}

getViewCutDistance() {
    return this.binds.cutDistance.value;
}

setVisualizationParameters(value) {
    switch (value) {
        case "tsne":
            this.binds.tsnePerp.closest('ui-field').style.display = ''
            this.binds.tsneExag.closest('ui-field').style.display = ''
            this.binds.tsneLearn.closest('ui-field').style.display = ''
            this.binds.tsneNum.closest('ui-field').style.display = ''
            this.binds.umapNeighbor.closest('ui-field').style.display = 'none'
            this.binds.umapDist.closest('ui-field').style.display = 'none'
            this.binds.sampleSize.closest('ui-field').style.display = ''
            this.binds.sigmaValue.closest('ui-field').style.display = ''
            this.binds.hdbsCluster.closest('ui-field').style.display = ''
            this.binds.hdbsSample.closest('ui-field').style.display = ''
            this.binds.compute.closest('ui-field').style.display = ''
            break;
        case "umap":
            this.binds.tsnePerp.closest('ui-field').style.display = 'none'
            this.binds.tsneExag.closest('ui-field').style.display = 'none'
            this.binds.tsneLearn.closest('ui-field').style.display = 'none'
            this.binds.tsneNum.closest('ui-field').style.display = 'none'
            this.binds.umapNeighbor.closest('ui-field').style.display = ''
            this.binds.umapDist.closest('ui-field').style.display = ''
            this.binds.sampleSize.closest('ui-field').style.display = ''
            this.binds.sigmaValue.closest('ui-field').style.display = ''
            this.binds.hdbsCluster.closest('ui-field').style.display = ''
            this.binds.hdbsSample.closest('ui-field').style.display = ''
            this.binds.compute.closest('ui-field').style.display = ''
            break;
        default:
            this.binds.tsnePerp.closest('ui-field').style.display = 'none'
            this.binds.tsneExag.closest('ui-field').style.display = 'none'
            this.binds.tsneLearn.closest('ui-field').style.display = 'none'
            this.binds.tsneNum.closest('ui-field').style.display = 'none'
            this.binds.umapNeighbor.closest('ui-field').style.display = 'none'
            this.binds.umapDist.closest('ui-field').style.display = 'none'
            this.binds.sampleSize.closest('ui-field').style.display = 'none'
            this.binds.sigmaValue.closest('ui-field').style.display = 'none'
            this.binds.hdbsCluster.closest('ui-field').style.display = 'none'
            this.binds.hdbsSample.closest('ui-field').style.display = 'none'
            this.binds.compute.closest('ui-field').style.display = 'none'
            break;
    }
}

setVisibleTFs(value) {
    const headers = this.binds.rendererSettingsContainer.querySelectorAll('div[slot="header"]');
    // console.log(headers);
    switch (value) {
        case 2:
            // console.log("show all")
            for (let index = 0; index < headers.length; index++) {
                if (index == 0)
                    headers[index].classList.toggle('invisible', true);
                else if(index == headers.length-1)
                    continue;
                else
                    headers[index].classList.toggle('invisible', false);
            }
            break;
        default:
            // console.log("hide")
            for (let index = 0; index < headers.length; index++) {
                if (index == 0)
                    headers[index].classList.toggle('invisible', false);
                else if(index == headers.length-1)
                    continue;
                else
                    headers[index].classList.toggle('invisible', true);
            }
            break;
    }
}

_handleComputeClick() {
    switch (this.binds.visselect.value) {
        case "tsne":
            this.dispatchEvent(new CustomEvent('computeclusters', {
                detail: {
                    visualizer: "tsne",
                    tsnePerp: Number(this.binds.tsnePerp.value),
                    tsneExag: Number(this.binds.tsneExag.value),
                    tsneLearn: Number(this.binds.tsneLearn.value),
                    tsneNum: Number(this.binds.tsneNum.value),
                    sampleSize: Number(this.binds.sampleSize.value),
                    sigmaValue: Number(this.binds.sigmaValue.value),
                    hdbsCluster: Number(this.binds.hdbsCluster.value),
                    hdbsSample: Number(this.binds.hdbsSample.value)
                }
            }));
            break;
        case "umap":
            this.dispatchEvent(new CustomEvent('computeclusters', {
                detail: {
                    visualizer: "umap",
                    umapNeighbors: Number(this.binds.umapNeighbor.value),
                    umapDistance: Number(this.binds.umapDist.value),
                    sampleSize: Number(this.binds.sampleSize.value),
                    sigmaValue: Number(this.binds.sigmaValue.value),
                    hdbsCluster: Number(this.binds.hdbsCluster.value),
                    hdbsSample: Number(this.binds.hdbsSample.value)
                }
            }));
            break;
        default:
            break;
    }
}

_handleVisualizationChange() {
    this.dispatchEvent(new Event('visualizationchange'));
}

_handleCutPlaneChange() {
    this.dispatchEvent(new Event('cutplanechange'));
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

}
