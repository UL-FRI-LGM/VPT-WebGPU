import { DOMUtils } from '../../utils/DOMUtils.js';
import {Pane} from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.3/dist/tweakpane.min.js';
import * as TweakpaneFileImportPlugin from 'https://unpkg.com/tweakpane-plugin-file-import@1.0.1/dist/tweakpane-plugin-file-import.js';


const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./TweakDialog.html', import.meta.url))
    .then(response => response.text());

export class TweakDialog extends EventTarget {

constructor () {
    super()

    //this._initPaneMain = this._initPaneMain.bind(this);
    //this._initPaneVolumeTab = this._initPaneVolumeTab.bind(this);

    this.object = template.content.cloneNode(true);
    this.binds = DOMUtils.bind(this.object);

    this.pane = new Pane({
        container: document.getElementById('pane-container'),
    });

    this.pane.registerPlugin(TweakpaneFileImportPlugin);

    this.PARAMS = {
        volumeURL: 'http://',
        volumeFile: '',
        envmapFile: '',
        precision: 8,
        dimensions: [128,128,128],
    }
    this._initPaneMain();

}

_returnPARAMS() {
    return this.PARAMS;
}
//Update options based on dropdown
_environmentDropdownChange(e) {
    //hide all
    this.fileInputEnv.hidden = true;
    this.urlInputEnv.hidden = true;
    this.demoInputEnv.hidden = true;
    //show only one
    if (e.value === 'file') {
        this.fileInputEnv.hidden = false;
    }
    else if (e.value === 'url') {
        this.urlInputEnv.hidden = false;
    }
    else if (e.value === 'demo') {
        this.demoInputEnv.hidden = false;
    }
}

//Update options based on dropdown
_volumeDropdownChange(e) {
    //hide all
    this.fileInputVolume.hidden = true;
    this.urlInputVolume.hidden = true;
    this.demoInputVolume.hidden = true;
    //show only one
    if (e.value === 'file') {
        this.fileInputVolume.hidden = false;
    }
    else if (e.value === 'url') {
        this.urlInputVolume.hidden = false;
    }
    else if (e.value === 'demo') {
        this.demoInputVolume.hidden = false;
    }
}


_volumeFileInputChange(e) {
    console.log('Selected file:', e.value);
    console.log('PARAMS status', this.PARAMS);
    this.dispatchEvent(new CustomEvent('volumeFileChosen', {
        detail: {
            type        : 'file',
            file        : this.PARAMS.volumeFile,
        }
    }));
}

_environmentFileInputChange(e) {
    console.log('Selected file:', e.value);
}

_volumeURLFieldChange(e) {
    console.log('Selected URL:', e.value);
}
_environmentURLFieldChange(e) {
    console.log('Selected URL:', e.value);
}

_initPaneVolumeTab() {

    //create folder
    const volumeFolder = this.tabs.pages[0].addFolder({title: 'Volume'});

    //set up ui list
    const volumeFolderImport = volumeFolder.addBlade({
        view: 'list',
        label: 'Type',
        options: [
            {text: 'Load from: ', value: 'init'},
            {text: 'File', value: 'file'},
            {text: 'URL', value: 'url'},
            {text: 'Demo', value: 'demo'},
        ],
        value: 'init',
    });

    //listener for input source change
    volumeFolderImport.on('change', (value) => {this._volumeDropdownChange(value)});

    //upload file widget
    this.fileInputVolume = volumeFolder.addBinding(this.PARAMS,  'volumeFile', {
        view: 'file-input',
        lineCount: 3,
        filetypes: ['.bvp', '.json', '.zip'],
        hidden: true,        
    });

    //upload file event
    this.fileInputVolume
        .on('change', (value) => {
        this._volumeFileInputChange(value);
    });

    //from url
    this.urlInputVolume = volumeFolder.addBlade({
        view: 'text',
        parse: (v) => String(v),
        label: 'URL',        
        hidden: true,
        value: "//",
        onChange: (value) => {
            //TODO: handle url load
            this._volumeFileUploadChange(value);
        }
    });

    //from demo
    this.demoInputVolume = volumeFolder.addButton({
        title: '...',
        label: 'Demo',
        hidden: true,

        onChange: (value) => {
            //TODO: handle demo load
            console.log("No demos available");
        }
    });
}

_initPaneMain() {

    this.tabs = this.pane.addTab({
        pages: [
            {title: 'Data'},
            {title: 'Settings'},
            {title: 'About'}
        ],
    });
    
    this._initPaneVolumeTab();

    //create folder
    const environmentFolder = this.tabs.pages[0].addFolder({title: 'Environment'});

    
    //set up ui and listener for volume importing
    const environmentFolderImport = environmentFolder.addBlade({
        view: 'list',
        label: 'Type',
        options: [
            {text: 'Load from: ', value: 'init'},
            {text: 'File', value: 'file'},
            {text: 'URL', value: 'url'},
            {text: 'Demo', value: 'demo'},
        ],
        value: 'init',
    });
    environmentFolderImport.on('change', (value) => {this._environmentDropdownChange(value)})

    //upload file
    this.fileInputEnv = environmentFolder.addBinding(this.PARAMS,  'envmapFile', {
        view: 'file-input',
        lineCount: 3,
        filetypes: ['.bvp', '.json', '.zip'],
        hidden: true,
        onChange: (value) => {
            this._environmentFileInputChange(value);
        }
    });
    //select url
    this.urlInputEnv = environmentFolder.addButton({
        title: '...',
        label: 'URL',
        hidden: true,

        onChange: (value) => {
            //TODO: 
            this._environmentURLFieldChange(value);
        }
    });
    //select demo
    this.demoInputEnv = environmentFolder.addButton({
        title: '...',
        label: 'Demo',
        hidden: true,

        onChange: (value) => {
            //TODO: connect with demo load
            console.log("No demos available");
        }
    });
}

}