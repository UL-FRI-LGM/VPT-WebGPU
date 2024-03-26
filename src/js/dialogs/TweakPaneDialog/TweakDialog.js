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
    //this._initPaneVolumeFolder = this._initPaneVolumeFolder.bind(this);

    //this.object = template.content.cloneNode(true);
    //this.binds = DOMUtils.bind(this.object);

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
        //volumeURLText: 'https://',
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

_initPaneVolumeFolder() {

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
    this.urlInputVolume = volumeFolder.addBinding(this.PARAMS, 'volumeURL', {
        label: 'URL',        
        hidden: true,
        value: "https://",

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

_initPaneEnvFolder() {
    //create folder
    const environmentFolder = this.tabs.pages[0].addFolder({title: 'Environment'});

    //set up ui list
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

    //listener for input source change
    environmentFolderImport.on('change', (value) => {this._environmentDropdownChange(value)})

    //upload file widget
    this.fileInputEnv = environmentFolder.addBinding(this.PARAMS,  'envmapFile', {
        view: 'file-input',
        lineCount: 3,
        //TODO, WHICH FILETYPES?
        filetypes: ['.bvp', '.json', '.zip'],
        hidden: true,
    });

    //upload file event
    this.fileInputEnv
        .on('change', (value) => {
        this._environmentFileInputChange(value);
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

_initPaneMain() {

    this.mainfolder = this.pane.addFolder({title: ""});
    this.tabs = this.mainfolder.addTab({
        pages: [
            {title: 'Data'},
            {title: 'Settings'},
            {title: 'About'}
        ],
    });

    this._initPaneVolumeFolder();
    this._initPaneEnvFolder();

    //folder 1
    const rendererFolder = this.tabs.pages[1].addFolder({title: 'Renderer'});
    const rendererFolderList = rendererFolder.addBlade({
        view: 'list',
        label: 'Type',
        options: [
            {text: 'Maximum intensity projection', value: 'renderer_mip'},
            {text: 'Isosurface extraction', value: 'renderer_ie'},
            {text: 'Emission-absorption model', value: 'renderer_eam'},
            {text: 'Directional occlusion shading', value: 'renderer_doa'},
            {text: 'Local ambient occlusion', value: 'renderer_lao'},
            {text: 'Single scattering ', value: 'renderer_ss'},
            {text: 'Multiple scattering', value: 'renderer_ms'},
            {text: 'Multiple scattering (compute)', value: 'renderer_msc'},
            {text: 'Depth image', value: 'renderer_di'},
        ],
        value: '',
    });
    //folder
    rendererFolderList.on('change', (value) => {this._changeRendererUI(value)});
    const toneMapperFolder = this.tabs.pages[1].addFolder({title: 'Tone Mapper'});
    const contextFolder = this.tabs.pages[1].addFolder({title: 'Context'});
    const animationFolder = this.tabs.pages[1].addFolder({title: 'Record Animation'});
    
    //const folder4 = this.tabs.pages[1].addFolder({title: 'Renderer2'});
    //const folder5 = folder1.addFolder({title: 'Renderer2'});
    //const folder1 = this.tabs.pages[1].addFolder({title: 'Renderer'});
    //const folder6 = folder1.addFolder({title: 'Renderer2'});
    //const folder2 = folder1.addFolder({title: 'Subrenderer'});
    
    
    
}

_changeRendererUI(rendererType) {
    console.log(rendererType.value);
    this.dispatchEvent(new CustomEvent('rendererChange', {
        detail: {
            type        : 'UI',
            renderer    : rendererType.value,
        }
    }));
}


}