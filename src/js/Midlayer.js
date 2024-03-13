import { DOMUtils } from './utils/DOMUtils.js';

import { TweakDialog } from './dialogs/TweakPaneDialog/TweakDialog.js';


export class Midlayer extends EventTarget {

    constructor () {
        super();

        this._handleLoadFile = this._handleLoadFile.bind(this);

        this.TweakDialog = new TweakDialog();

        this._addEventListeners();
    }

    _addEventListeners() {
        this.TweakDialog.addEventListener('volumeFileChosen', this._handleLoadFile);
    }

    _handleLoadFile(e) {
        const file = this.TweakDialog._returnPARAMS().volumeFile;
        console.log(e);
        //check if empty

        //else load
    }
}