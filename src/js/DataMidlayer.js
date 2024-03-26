import { TweakDialog } from './dialogs/TweakPaneDialog/TweakDialog.js';


export class DataMidlayer extends EventTarget {

    constructor (tweakpaneDialog) {
        super();

        this._handleLoadVolumeFile = this._handleLoadVolumeFile.bind(this);
        this._handleLoadEnvFile = this._handleLoadEnvFile.bind(this);

        this.TweakDialog = tweakpaneDialog;
        
        this._addEventListeners();
    }

    _addEventListeners() {
        this.TweakDialog.addEventListener('volumeFileChosen', this._handleLoadVolumeFile);
        this.TweakDialog.addEventListener('envFileChosen', this._handleLoadEnvFile)
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

    _handleLoadVolumeFile(e) {
        const params = this.TweakDialog._returnPARAMS();
        const file = params.volumeFile;
        //check if empty
        if (file == null) {
            //console.log("null file");
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

    _handleLoadEnvFile(e) {
        const params = this.TweakDialog._returnPARAMS();
        const file = params.envFile;
        //check if empty
        if (file == null) {
            //console.log("null file");
            // undefined and null loosely equal!
            return;
        }

        this.dispatchEvent(new CustomEvent('loadEnv', {
            detail: {
                type       : 'file',
                file       : file,
            }
        }));
    }

}
