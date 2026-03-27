import { DOMUtils } from '../../utils/DOMUtils.js';
import { CommonUtils } from '../../utils/CommonUtils.js';
import { WebGL } from '../../WebGL.js';
import { Draggable } from '../../Draggable.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders.json',
    'mixins.json',
].map(url => fetch(url).then(response => response.json())));

const [ templateElement, templateBump ] = await Promise.all([
    new URL('./TransferFunction1D.html', import.meta.url),
    new URL('./TransferFunction1DBump.html', import.meta.url),
].map(url => fetch(url).then(response => response.text())));

const template = document.createElement('template');
template.innerHTML = templateElement;

export class TransferFunction1D extends HTMLElement {

constructor() {
    super();

    this.changeListener = this.changeListener.bind(this);

    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.appendChild(template.content.cloneNode(true));
    this.binds = DOMUtils.bind(this.shadow);

    Object.assign(this, {
        width                  : 256,
        height                 : 48,
        transferFunctionWidth  : 256,
        transferFunctionHeight : 1,
        scaleSpeed             : 0.003
    });

    this.canvas = this.shadow.querySelector('canvas');
    this.canvas.width = this.transferFunctionWidth;
    this.canvas.height = this.transferFunctionHeight;
    this.resize(this.width, this.height);
    this.canvas.addEventListener('generateHistogram', e => {
        console.log("test");
        this._handleHistogram(e);
    });

    this._gl = this.canvas.getContext('webgl2', {
        depth                 : false,
        stencil               : false,
        antialias             : false,
        preserveDrawingBuffer : true
    });
    const gl = this._gl;

    // console.log(this.canvas.getContext('2d', {willReadFrequently: true}));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this._program = WebGL.buildPrograms(gl, {
        TransferFunction: SHADERS.TransferFunction
    }, MIXINS).TransferFunction;
    const { program } = this._program;
    gl.useProgram(program);

    this.bumps = [];
    this.binds.addBump.addEventListener('click', e => {
        this.addBump();
    });
    this.binds.removeSelectedBump.addEventListener('click', e => {
        this.removeSelectedBump();
    });
    this.binds.removeAllBumps.addEventListener('click', e => {
        this.removeAllBumps();
    });

    this.binds.color.addEventListener('change', this.changeListener);
    this.binds.alpha.addEventListener('change', this.changeListener);

    this.binds.load.addEventListener('click', e => {
        CommonUtils.readTextFile(data => {
            this.bumps = JSON.parse(data);
            this.render();
            this._rebuildHandles();
            this.dispatchEvent(new Event('change'));
        });
    });

    this.addEventListener('computed', e => {
        // console.log(e);
        // console.log(e.detail);
        // console.log(typeof e.detail);
        this.bumps = e.detail;
        this.render();
        this._rebuildHandles();
        this.dispatchEvent(new Event('change'));
    });

    this.binds.save.addEventListener('click', e => {
        CommonUtils.downloadJSON(this.bumps, 'TransferFunction.json');
    });

    // this.isImage = false;
    // this.reader = new FileReader();
    // this.addImageTexture();
}

destroy() {
    const gl = this._gl;
    gl.deleteBuffer(this._clipQuad);
    gl.deleteProgram(this._program.program);
}

resize(width, height) {
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.width = width;
    this.height = height;
}

resizeTransferFunction(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.transferFunctionWidth = width;
    this.transferFunctionHeight = height;
    const gl = this._gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

render() {
    const gl = this._gl;
    const { uniforms } = this._program;
    
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.isImage && this.imageTexture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
        gl.uniform1i(gl.getUniformLocation(this._program.program, "uImage"), 0);
        gl.uniform1i(gl.getUniformLocation(this._program.program, "uUseTexture"), true);
        gl.uniform1f(gl.getUniformLocation(this._program.program, "uMixFactor"), 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
        gl.uniform1i(gl.getUniformLocation(this._program.program, "uUseTexture"), false);
        for (const bump of this.bumps) {
            gl.uniform2f(uniforms.uPosition, bump.position.x, bump.position.y);
            gl.uniform2f(uniforms.uSize, bump.size.x, bump.size.y);
            gl.uniform4f(uniforms.uColor, bump.color.r, bump.color.g, bump.color.b, bump.color.a);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
    }
}

get value() {
    return this.canvas;
}

set histogram(imgData) {
    this.canvas.style.backgroundImage = 'url('+imgData+')';
}

addBump(options = {}) {
    const bumpIndex = this.bumps.length;
    let x = 0;
    if (bumpIndex == 0)
        x = 0.0;
    else if (bumpIndex == 1)
        x = 1.0;
    else
        x = 0.5;
    const newBump = {
        position: {
            x: x,
            y: 0.5,
        },
        size: {
            x: 0.35,
            y: 0.25,
        },
        color: {
            r: 1,
            g: 0,
            b: 0,
            a: 1,
        },
    };
    this.bumps.push(newBump);
    this._addHandle(bumpIndex);
    this.selectBump(bumpIndex);
    this.render();
    this.dispatchEvent(new Event('change'));
}

removeSelectedBump() {
    this._removeHandle(this.getSelectedBumpIndex());
}

removeAllBumps() {
    this.bumps = [];
    this._rebuildHandles();
    this.render();
    this.dispatchEvent(new Event('change'));
}

_removeHandle(index) {
    const handles = this.shadow.querySelectorAll('.bump');
    for (const handle of handles) {
        const handleIndex = parseInt(handle.dataset.index);
        if (handleIndex === index) {
            this.bumps.splice(handleIndex, 1);
        }
    }
    this._rebuildHandles();
    this.render();
    this.dispatchEvent(new Event('change'));
}

_addHandle(index) {
    const handle = DOMUtils.instantiate(templateBump);
    this.shadow.querySelector('.widget').appendChild(handle);
    handle.dataset.index = index;

    const left = this.bumps[index].position.x * this.width;
    const top = (1 - this.bumps[index].position.y) * this.height;
    handle.style.left = Math.round(left) + 'px';
    handle.style.top = Math.round(top) + 'px';

    new Draggable(handle, handle.querySelector('.bump-handle1D'));
    handle.addEventListener('draggable', e => {
        // console.log("dragging");
        const x = e.currentTarget.offsetLeft / this.width;
        const y = 0.5;
        const i = parseInt(e.currentTarget.dataset.index);
        this.bumps[i].position.x = x;
        this.bumps[i].position.y = y;
        this.render();
        this.dispatchEvent(new Event('change'));
    });
    handle.addEventListener('pointerdown', e => {
        const i = parseInt(e.currentTarget.dataset.index);
        this.selectBump(i);
    });
    handle.addEventListener('wheel', e => {
        e.preventDefault();
        const amount = e.deltaY * this.scaleSpeed;
        const scale = Math.exp(-amount);
        const i = parseInt(e.currentTarget.dataset.index);
        this.selectBump(i);
        if (e.shiftKey) {
            this.bumps[i].size.y *= scale;
        } else {
            this.bumps[i].size.x *= scale;
        }
        this.render();
        this.dispatchEvent(new Event('change'));
    });
}

_rebuildHandles() {
    const handles = this.shadow.querySelectorAll('.bump');
    for (const handle of handles) {
        handle.remove();
    }
    for (let i = 0; i < this.bumps.length; i++) {
        this._addHandle(i);
    }
}

selectBump(index) {
    const handles = this.shadow.querySelectorAll('.bump');
    for (const handle of handles) {
        const handleIndex = parseInt(handle.dataset.index);
        if (handleIndex === index) {
            handle.classList.add('selected');
        } else {
            handle.classList.remove('selected');
        }
    }

    const color = this.bumps[index].color;
    this.binds.color.value = CommonUtils.rgb2hex([color.r, color.g, color.b]);
    this.binds.alpha.value = color.a;
}

getSelectedBumpIndex() {
    const selectedBump = this.shadow.querySelector('.bump.selected');
    if (selectedBump) {
        return parseInt(selectedBump.dataset.index);
    } else {
        return -1;
    }
}

changeListener() {
    const selectedBump = this.shadow.querySelector('.bump.selected');
    const index = parseInt(selectedBump.dataset.index);
    const color = CommonUtils.hex2rgb(this.binds.color.value);
    const alpha = parseFloat(this.binds.alpha.value);
    this.bumps[index].color.r = color[0];
    this.bumps[index].color.g = color[1];
    this.bumps[index].color.b = color[2];
    this.bumps[index].color.a = alpha;
    this.render();
    this.dispatchEvent(new Event('change'));
}

// addImageTexture() {
//     this.canvas.addEventListener('dragover', e => {
//         e.preventDefault();
//     }, false);
//     const self = this;
//     // console.log(self._gl);
//     this.canvas.addEventListener('drop', e => {
//         e.preventDefault();

//         const file = e.dataTransfer.files[0];
//         if (!file) return;

//         const reader = new FileReader();

//         reader.onload = async (event) => {
//             const dataURL = event.target.result;

//             const blob = await (await fetch(dataURL)).blob();
//             const imageBitmap = await createImageBitmap(blob);
           
//             const gl = self._gl;
//             const texture = gl.createTexture();
//             gl.bindTexture(gl.TEXTURE_2D, texture);
//             gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
//             gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
//             gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
//             gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

//             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);
//             gl.generateMipmap(gl.TEXTURE_2D);

//             this.imageTexture = texture;
//             this.isImage = true;

//             console.log("Image texture loaded");
//             self.render();
//             self.dispatchEvent(new Event('change'));
//         };

//         reader.readAsDataURL(file);
//     }, false);
// }

_handleHistogram(e) {
    console.log(e.detail.imgData);
    this.canvas.style.backgroundImage = "none";
    this.canvas.style.backgroundImage = 'url('+e.detail.imgData+')';
}

}

customElements.define('ui-transfer-function-1d', TransferFunction1D);
