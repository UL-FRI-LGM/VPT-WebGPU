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

    _getVolumeTypeFromURL(filename) {
        const exn = filename.split('.').pop().toLowerCase();
        const exnToType = {
            'bvp'  : 'bvp',
            'json' : 'json',
            'zip'  : 'zip',
        };
        return exnToType[exn] || 'raw';
    }

    _handleLoadFile(e) {
        const params = this.TweakDialog._returnPARAMS();
        const file = params.volumeFile;
        console.log(e);
        //check if empty
        if (file == null) {
            console.log("null file");
            // undefined and null loosely equal!
            return;
        }
        const filetype = this._getVolumeTypeFromURL(file.name);
        const dimensions = params.dimensions;
        const precision = params.precision;

        this.dispatchEvent(new CustomEvent('loadVolume', {
            detail: {
                type       : 'file',
                file       : file,
                filetype   : filetype,
                dimensions : dimensions,
                precision  : precision,
            }
        }));
    }
}