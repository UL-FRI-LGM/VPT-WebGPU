import { TweakDialog } from './dialogs/TweakPaneDialog/TweakDialog.js';


export class SettingsMidlayer extends EventTarget {

    constructor (tweakpaneDialog) {
        super();

        this._changeRenderer = this._changeRenderer.bind(this);

        this.TweakDialog = tweakpaneDialog;
        this._addEventListeners();
    }

    _addEventListeners() {
        this.TweakDialog.addEventListener('rendererChange', this._handleChangeRenderer);
    }


    _handleChangeRenderer() {

    }

}