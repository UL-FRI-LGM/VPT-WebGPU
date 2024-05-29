import { TweakDialog } from './dialogs/TweakPaneDialog/TweakDialog.js';


export class SettingsMidlayer extends EventTarget {

    constructor (tweakpaneDialog) {
        super();

        this._handleEvent = this._handleEvent.bind(this);
        this._updateTweakpaneUI = this._updateTweakpaneUI.bind(this);


        this.TweakDialog = tweakpaneDialog;
        this._addEventListeners();
    }

    _addEventListeners() {
        this.TweakDialog.addEventListener('settingsChange', this._handleEvent);
    }


    _handleEvent(e) {
        //too many events, optimize by adding function to application.js and calling those instead
        switch (e.detail.type) {
            case 'rendererChange':
                if (e.detail.parameterName == null) {
                    this.dispatchEvent(new CustomEvent('changeRenderer', {
                        detail: {
                            type        : 'renderer',
                            value       : e.detail.value,
                        }
                    }));
                } else {
                    this.dispatchEvent(new CustomEvent('changeRendererProperty', {
                        detail: {
                            type : e.detail.parameterName,
                            value : e.detail.value,
                        }
                    }));
                }
                break;
            case 'toneMapperChange':
                 if (e.detail.parameterName == null) {
                    this.dispatchEvent(new CustomEvent('changeToneMapper', {
                        detail: {
                            type        : 'toneMapper',
                            value       : e.detail.value,
                        }
                    }));
                } else {
                    this.dispatchEvent(new CustomEvent('changeToneMapperProperty', {
                        detail: {
                            type : e.detail.parameterName,
                            value : e.detail.value,
                        }
                    }));
                }
                break;
            case 'fullscreen':
                this.dispatchEvent(new CustomEvent('fullscreen', {
                    detail: {
                        type : 'fullscreen',
                        value : e.detail.value,
                    }
                }));
                break;
            case 'resolution':
                this.dispatchEvent(new CustomEvent('resolution', {
                    detail: {
                        type : 'resolution',
                        value : e.detail.value,
                    }
                }));
                break;
            case 'filter':
                this.dispatchEvent(new CustomEvent('filter', {
                    detail: {
                        type : 'filter',
                        value : e.detail.value,
                    }
                }));
                break;
            case 'context_trs':
                const params = this.TweakDialog._returnPARAMS();

                this.dispatchEvent(new CustomEvent('trs', {
                    detail: {
                        type : 'trs',
                        translation : params["translation"], 
                        rotation : params["rotation"], 
                        scale : params["scale"], 
                    }
                }));
                break;
        }
    }



    _updateTweakpaneUI(folder, properties) {
        switch (folder) {
            case 'renderer':
                return this.TweakDialog._updateRendererFolder(properties);
            case 'toneMapper':
                this.TweakDialog._updateToneMapperFolder(properties);
        }
    }

}