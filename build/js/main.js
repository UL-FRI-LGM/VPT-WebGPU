class CommonUtils {

static noop() {
}

static clamp(x, a, b) {
    return Math.min(Math.max(x, a), b);
}

static lerp(a, b, x) {
    return a + x * (b - a);
}

static downloadJSON(json, filename) {
    const str = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(json));
    let a = document.createElement('a');
    a.setAttribute('href', str);
    a.setAttribute('download', filename);
    a.click();
    a = null;
}

static readTextFile(onLoad, onError) {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.addEventListener('change', function() {
        const reader = new FileReader();
        if (onLoad) {
            reader.addEventListener('load', function() {
                onLoad(reader.result);
            });
        }
        if (onError) {
            reader.addEventListener('error', onError);
        }
        reader.readAsText(input.files[0]);
    });
    input.click();
}

static trigger(event, element) {
    element.dispatchEvent(new Event(event));
}

static bind(object, { prefix = '', suffix = 'Listener'} = {}) {
    const methods = Object.getOwnPropertyNames(object.constructor.prototype);
    for (const method of methods) {
        if (method.startsWith(prefix) && method.endsWith(suffix)) {
            object[method] = object[method].bind(object);
        }
    }
}

static hex2rgb(str) {
    return {
        r: parseInt(str.substring(1, 3), 16) / 255,
        g: parseInt(str.substring(3, 5), 16) / 255,
        b: parseInt(str.substring(5, 7), 16) / 255
    };
}

static rgb2hex(r, g, b) {
    r = Number(Math.floor(r * 255)).toString(16);
    g = Number(Math.floor(g * 255)).toString(16);
    b = Number(Math.floor(b * 255)).toString(16);
    r = r.length < 2 ? "0" + r : r;
    g = g.length < 2 ? "0" + g : g;
    b = b.length < 2 ? "0" + b : b;
    return "#" + r + g + b;
}

static get noimpl() {
    return new Error('Not implemented!');
}

}
class DOMUtils {

static template(tmpl) {
    let div = document.createElement('div');
    div.innerHTML = tmpl;
    const element = div.querySelector('.instantiate');
    div.removeChild(element);
    return element;
}

static instantiate(tmpl) {
    if (typeof tmpl === 'string') {
        return DOMUtils.template(tmpl);
    } else {
        return tmpl.cloneNode(true);
    }
}

static bind(element) {
    const binds = {};
    const elements = element.querySelectorAll('[data-bind]');
    for (const element of elements) {
        binds[element.dataset.bind] = element;
    }
    return binds;
}

static remove(element) {
    if (element.parentNode) {
        element.parentNode.removeChild(element);
    }
}

static data(element, key, value) {
    if (typeof value !== 'undefined') {
        element.setAttribute('data-' + key, value);
    } else {
        return element.getAttribute('data-' + key);
    }
}

static show(element) {
    element.classList.remove('invisible');
}

static hide(element) {
    element.classList.add('invisible');
}

static toggle(element) {
    element.classList.toggle('invisible');
}

}
class AbstractReader {

constructor(loader) {
    this._loader = loader;
}

readMetadata(handlers) {
    // IMPLEMENT
}

readBlock(block, handlers) {
    // IMPLEMENT
}

}
// #link AbstractReader

class ZIPReader extends AbstractReader {

constructor(loader) {
    super(loader);

    this._length = null;
    this._eocd = null;
    this._cd = null;
}

getFiles(handlers) {
    function getFiles() {
        handlers.onData && handlers.onData(this._cd.map(e => e.name));
    }

    if (!this._cd) {
        this._readCD({
            onData: () => {
                getFiles();
            }
        });
    } else {
        getFiles();
    }
}

readFile(fileName, handlers) {
    const readFile = function() {
        const entry = this._cd.find(entry => entry.name === fileName);
        if (entry) {
            this._loader.readData(entry.headerOffset, entry.headerOffset + 30, {
                onData: header => {
                    header = new DataView(header);
                    const fileNameLength = header.getUint16(26, true);
                    const extraFieldLength = header.getUint16(28, true);
                    const dataOffset = entry.headerOffset + 30 + fileNameLength + extraFieldLength;
                    this._loader.readData(dataOffset, dataOffset + entry.compressedSize, {
                        onData: data => {
                            handlers.onData && handlers.onData(data);
                        }
                    });
                }
            });
        }
    }.bind(this);

    if (!this._cd) {
        this._readCD({
            onData: () => {
                readFile();
            }
        });
    } else {
        readFile();
    }
}

_readString(data, index, length) {
    const decoder = new TextDecoder('utf-8');
    const encoded = data.buffer.slice(index, index + length);
    return decoder.decode(encoded);
}

_readEOCD(handlers) {
    if (this._eocd) {
        return;
    }

    const readEOCD = function() {
        const EOCD_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);
        const MIN_EOCD_SIZE = 22;
        const offset = Math.max(this._length - MIN_EOCD_SIZE, 0);
        const length = Math.min(this._length, MIN_EOCD_SIZE);

        this._loader.readData(offset, offset + length, {
            onData: data => {
                data = new DataView(data);
                this._eocd = {
                    entries: data.getUint16(10, true),
                    size   : data.getUint32(12, true),
                    offset : data.getUint32(16, true),
                };
                handlers.onData && handlers.onData();
            }
        });
    }.bind(this);

    if (!this._length) {
        this._loader.readLength({
            onData: length => {
                this._length = length;
                readEOCD();
            }
        });
    } else {
        readEOCD();
    }
}

_readCD(handlers) {
    if (this._cd) {
        return;
    }

    const readCD = function() {
        this._loader.readData(this._eocd.offset, this._eocd.offset + this._eocd.size, {
            onData: data => {
                data = new DataView(data);
                let offset = 0;
                let entries = [];
                for (let i = 0; i < this._eocd.entries; i++) {
                    const gpflag = data.getUint16(offset + 8, true);
                    const method = data.getUint16(offset + 10, true);
                    const compressedSize = data.getUint32(offset + 20, true);
                    const uncompressedSize = data.getUint32(offset + 24, true);
                    const fileNameLength = data.getUint16(offset + 28, true);
                    const extraFieldLength = data.getUint16(offset + 30, true);
                    const fileCommentLength = data.getUint16(offset + 32, true);
                    const cdEntrySize = 46 + fileNameLength + extraFieldLength + fileCommentLength;
                    const name = this._readString(data, offset + 46, fileNameLength);
                    const headerOffset = data.getUint32(offset + 42, true);
                    entries[i] = {
                        gpflag           : gpflag,
                        method           : method,
                        compressedSize   : compressedSize,
                        uncompressedSize : uncompressedSize,
                        name             : name,
                        headerOffset     : headerOffset
                    };
                    offset += cdEntrySize;
                }
                this._cd = entries;
                handlers.onData && handlers.onData();
            }
        });
    }.bind(this);

    if (!this._eocd) {
        this._readEOCD({
            onData: () => {
                readCD();
            }
        });
    } else {
        readCD();
    }
}

}
// #link AbstractReader
// #link ZIPReader

class BVPReader extends AbstractReader {

constructor(loader) {
    super(loader);

    this._metadata = null;
    this._zipReader = new ZIPReader(this._loader);
}

readMetadata(handlers) {
    this._zipReader.readFile('manifest.json', {
        onData: data => {
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(data);
            const json = JSON.parse(jsonString);
            this._metadata = json;
            handlers.onData && handlers.onData(json);
        }
    });
}

readBlock(block, handlers) {
    if (!this._metadata) {
        return;
    }

    const blockMeta = this._metadata.blocks[block];
    this._zipReader.readFile(blockMeta.url, {
        onData: data => {
            handlers.onData && handlers.onData(data);
        }
    });
}

}
// #link AbstractReader

class RAWReader extends AbstractReader {

constructor(loader, options) {
    super(loader);

    Object.assign(this, {
        width  : 0,
        height : 0,
        depth  : 0,
    }, options);
}

readMetadata(handlers) {
    let metadata = {
        meta: {
            version: 1
        },
        modalities: [
            {
                name: 'default',
                dimensions: {
                    width  : this.width,
                    height : this.height,
                    depth  : this.depth
                },
                transform: {
                    matrix: [
                        1, 0, 0, 0,
                        0, 1, 0, 0,
                        0, 0, 1, 0,
                        0, 0, 0, 1
                    ]
                },
                format: 6403, // RED
                internalFormat: 33321, // R8
                type: 5121, // UNSIGNED_BYTE
                placements: []
            }
        ],
        blocks: []
    };

    for (let i = 0; i < this.depth; i++) {
        metadata.modalities[0].placements.push({
            index: i,
            position: { x: 0, y: 0, z: i }
        });

        metadata.blocks.push({
            url: 'default',
            format: 'raw',
            dimensions: {
                width  : this.width,
                height : this.height,
                depth  : 1
            }
        });
    }

    handlers.onData && handlers.onData(metadata);
}

readBlock(block, handlers) {
    const sliceBytes = this.width * this.height;
    const start = block * sliceBytes;
    const end = (block + 1) * sliceBytes;
    this._loader.readData(start, end, {
        onData: data => {
            handlers.onData && handlers.onData(data);
        }
    });
}

}
class AbstractLoader {

readLength(handlers) {
    // IMPLEMENT
}

readData(start, end, handlers) {
    // IMPLEMENT
}

}
// #link AbstractLoader

class AjaxLoader extends AbstractLoader {

constructor(url) {
    super();

    this.url = url;
}

readLength(handlers) {
    let xhr = new XMLHttpRequest();
    xhr.addEventListener('load', e => {
        const contentLength = e.target.getResponseHeader('Content-Length');
        handlers.onData && handlers.onData(parseInt(contentLength, 10));
    });
    xhr.open('HEAD', this.url);
    xhr.responseType = 'arraybuffer';
    xhr.send();
}

readData(start, end, handlers) {
    let xhr = new XMLHttpRequest();
    xhr.addEventListener('load', e => {
        handlers.onData && handlers.onData(e.target.response);
    });
    xhr.open('GET', this.url);
    xhr.setRequestHeader('Range', 'bytes=' + start + '-' + (end - 1));
    xhr.responseType = 'arraybuffer';
    xhr.send();
}

}
// #link AbstractLoader

class BlobLoader extends AbstractLoader {

constructor(blob) {
    super();

    this.blob = blob;
}

readLength(handlers) {
    handlers.onData && handlers.onData(this.blob.size);
}

readData(start, end, handlers) {
    const fileReader = new FileReader();
    fileReader.addEventListener('load', e => {
        handlers.onData && handlers.onData(e.target.result);
    });
    fileReader.readAsArrayBuffer(this.blob.slice(start, end));
}

}
// #link ../utils

class UIObject {

constructor(template, options) {
    Object.assign(this, {
        enabled: true,
        visible: true
    }, options);

    this._template = template;

    this._element = DOMUtils.instantiate(this._template);
    this._binds = DOMUtils.bind(this._element);

    this._element.classList.toggle('disabled', !this.enabled);
    this._element.classList.toggle('invisible', !this.visible);
}

destroy() {
    DOMUtils.remove(this._element);
}

isEnabled() {
    return this.enabled;
}

setEnabled(enabled) {
    if (this.enabled !== enabled) {
        this.enabled = enabled;
        this._element.classList.toggle('disabled', !enabled);
        this.trigger('enabledchange');
        this.trigger(enabled ? 'enable' : 'disable');
    }
}

enable() {
    this.setEnabled(true);
}

disable() {
    this.setEnabled(false);
}

isVisible() {
    return this.visible;
}

setVisible(visible) {
    if (this.visible !== visible) {
        this.visible = visible;
        this._element.classList.toggle('invisible', !visible);
        this.trigger('visiblechange');
        this.trigger(visible ? 'show' : 'hide');
    }
}

show() {
    this.setVisible(true);
}

hide() {
    this.setVisible(false);
}

appendTo(container) {
    container.appendChild(this._element);
}

detach() {
    DOMUtils.remove(this._element);
}

addEventListener(event, listener, options) {
    this._element.addEventListener(event, listener, options);
}

removeEventListener(event, listener, options) {
    this._element.removeEventListener(event, listener, options);
}

trigger(name, detail) {
    if (!detail) {
        detail = this;
    }
    const event = new CustomEvent(name, {
        detail: detail
    });
    this._element.dispatchEvent(event);
}

}
// #link UIObject

// #link /html/ui/Accordion

class Accordion extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Accordion, options);

    Object.assign(this, {
        label      : '',
        contracted : false
    }, options);

    this._handleClick = this._handleClick.bind(this);

    this._binds.handle.textContent = this.label;
    this._binds.handle.addEventListener('click', this._handleClick);
    this.setContracted(this.contracted);
}

add(object) {
    object.appendTo(this._binds.container);
}

setContracted(contracted) {
    this.contracted = contracted;
    this._element.classList.toggle('contracted', contracted);
}

expand() {
    if (!this.contracted) {
        return;
    }

    this.setContracted(false);
}

contract() {
    if (this.contracted) {
        return;
    }

    this.setContracted(true);
}

toggleContracted() {
    this.setContracted(!this.contracted);
}

_handleClick() {
    if (this.enabled) {
        this.toggleContracted();
    }
}

}
// #link UIObject

class Button extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Button, options);

    Object.assign(this, {
        label: ''
    }, options);

    this._binds.input.value = this.label;
}

setEnabled(enabled) {
    this._binds.input.disabled = !enabled;
    super.setEnabled(enabled);
}

}
// #link UIObject

class Checkbox extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Checkbox, options);

    Object.assign(this, {
        checked : true
    }, options);

    this._handleClick = this._handleClick.bind(this);

    this._element.addEventListener('click', this._handleClick);
    this._element.classList.toggle('checked', this.checked);
}

isChecked() {
    return this.checked;
}

setChecked(checked) {
    if (this.checked !== checked) {
        this.checked = checked;
        this._element.classList.toggle('checked', checked);
        this.trigger('change');
    }
}

toggleChecked() {
    this.setChecked(!this.checked);
}

_handleClick() {
    if (this.enabled) {
        this.toggleChecked();
    }
}

}
// #link UIObject

class ColorChooser extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.ColorChooser, options);

    Object.assign(this, {
        value: null
    }, options);

    this._handleInput = this._handleInput.bind(this);
    this._handleClick = this._handleClick.bind(this);

    const input = this._binds.input;
    input.addEventListener('input', this._handleInput);

    if (this.value !== null) {
        input.value = this.value;
    }
    this._binds.color.style.backgroundColor = input.value /* + alpha */;
    this._element.addEventListener('click', this._handleClick);
}

setEnabled(enabled) {
    this._binds.input.disabled = !enabled;
    super.setEnabled(enabled);
}

_handleInput(e) {
    this._binds.color.style.backgroundColor = this._binds.input.value /* + alpha */;
}

_handleClick() {
    this._binds.input.click();
}

getValue() {
    return this._binds.input.value;
}

setValue(value) {
    this._binds.input.value = value;
}

}
// #link ../utils
// #link UIObject

class Dropdown extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Dropdown, options);

    Object.assign(this, {
        options: []
    }, options);

    for (let option of this.options) {
        this.addOption(option.value, option.label, option.selected);
    }
}

addOption(value, label, selected) {
    let option = document.createElement('option');
    option.value = value;
    option.text = label;
    this._binds.input.add(option);
    if (selected) {
        this._binds.input.value = value;
    }
}

removeOption(value) {
    const selector = 'option[value="' + value + '"]';
    const option = this._binds.input.querySelector(selector);
    if (option) {
        DOMUtils.remove(option);
    }
}

setValue(value) {
    this._binds.input.value = value;
}

getValue() {
    return this._binds.input.value;
}

}
// #link UIObject

class Field extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Field, options);

    Object.assign(this, {
        label: ''
    }, options);

    this._content = null;
    this._binds.label.textContent = this.label;
}

destroy() {
    if (this._content) {
        this._content.detach();
    }

    super.destroy();
}

setEnabled(enabled) {
    if (this._content) {
        this._content.setEnabled(enabled);
    }

    super.setEnabled(enabled);
}

add(object) {
    if (!this._content) {
        this._content = object;
        object.appendTo(this._binds.container);
        object.setEnabled(this.enabled);
    }
}

}
// #link UIObject

class FileChooser extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.FileChooser, options);

    this._handleChange = this._handleChange.bind(this);
    this._handleClick = this._handleClick.bind(this);

    this._element.addEventListener('click', this._handleClick);
    this._binds.input.addEventListener('change', this._handleChange);
}

_handleChange() {
    if (this._binds.input.files.length > 0) {
        const fileName = this._binds.input.files[0].name;
        this._binds.label.textContent = fileName;
    } else {
        this._binds.label.textContent = '';
    }
}

_handleClick() {
    this._binds.input.click();
}

getFiles() {
    return this._binds.input.files;
}

}
// #link UIObject

class Panel extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Panel, options);

    Object.assign(this, {
        scrollable: false
    }, options);

    this.setScrollable(this.scrollable);
}

setScrollable(scrollable) {
    this.scrollable = scrollable;
    this._element.classList.toggle('scrollable', scrollable);
}

add(object) {
    object.appendTo(this._element);
}

}
// #link ../utils
// #link UIObject

class ProgressBar extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.ProgressBar, options);

    Object.assign(this, {
        progress: 0
    }, options);

    this.setProgress(this.progress);
}

setProgress(progress) {
    this.progress = Math.round(CommonUtils.clamp(progress, 0, 100));
    this._binds.progress.style.width = this.progress + '%';
    this._binds.label.textContent = this.progress + '%';
}

getProgress() {
    return this.progress;
}

}
// #link ../utils
// #link UIObject

class Radio extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Radio, options);

    Object.assign(this, {
        options  : [],
        vertical : false
    }, options);

    this._handleClick = this._handleClick.bind(this);

    this._radioName = 'radio' + Radio._nextId++;
    this._element.classList.toggle('vertical', this.vertical);
    for (let option of this.options) {
        this.addOption(option.value, option.label, option.selected);
    }
}

addOption(value, label, selected) {
    const option = DOMUtils.instantiate(TEMPLATES.ui.RadioOption);
    let binds = DOMUtils.bind(option);
    binds.input.name = this._radioName;
    binds.input.value = value;
    if (selected) {
        binds.input.checked = true;
    }
    binds.label.textContent = label;
    binds.label.addEventListener('click', this._handleClick);
    this._element.appendChild(option);
}

getValue() {
    const selector = '.radio-option > input:checked';
    const input = this._element.querySelector(selector);
    return input ? input.value : null;
}

setValue(value) {
    const selector = '.radio-option > input[value="' + value + '"]';
    const input = this._element.querySelector(selector);
    if (input) {
        input.select();
    }
}

_handleClick(e) {
    e.currentTarget.parentNode.querySelector('input').checked = true;
}

}

Radio._nextId = 0;
// #link UIObject

class Sidebar extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Sidebar, options);

    Object.assign(this, {
        contracted: false
    }, options);

    this._handleClick = this._handleClick.bind(this);

    this._binds.handle.addEventListener('click', this._handleClick);
    this.setContracted(this.contracted);
}

add(object) {
    object.appendTo(this._binds.container);
}

setContracted(contracted) {
    this.contracted = contracted;
    this._element.classList.toggle('contracted', contracted);
}

expand() {
    if (!this.contracted) {
        return;
    }

    this.setContracted(false);
}

contract() {
    if (this.contracted) {
        return;
    }

    this.setContracted(true);
}

toggleContracted() {
    this.setContracted(!this.contracted);
}

_handleClick() {
    if (this.enabled) {
        this.toggleContracted();
    }
}

}
// #link ../utils
// #link UIObject

class Slider extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Slider, options);

    Object.assign(this, {
        value       : 0,
        min         : 0,
        max         : 100,
        step        : 1,
        logarithmic : false
    }, options);

    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseUp   = this._handleMouseUp.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleWheel     = this._handleWheel.bind(this);

    this._updateUI();

    this._element.addEventListener('mousedown', this._handleMouseDown);
    this._element.addEventListener('wheel', this._handleWheel);
}

destroy() {
    document.removeEventListener('mouseup', this._handleMouseUp);
    document.removeEventListener('mousemove', this._handleMouseMove);

    super.destroy();
}

setValue(value) {
    this.value = CommonUtils.clamp(value, this.min, this.max);
    this._updateUI();
    this.trigger('change');
}

_updateUI() {
    if (this.logarithmic) {
        const logmin = Math.log(this.min);
        const logmax = Math.log(this.max);
        const ratio = (Math.log(this.value) - logmin) / (logmax - logmin) * 100;
        this._binds.button.style.marginLeft = ratio + '%';
    } else {
        const ratio = (this.value - this.min) / (this.max - this.min) * 100;
        this._binds.button.style.marginLeft = ratio + '%';
    }
}

getValue() {
    return this.value;
}

_setValueByEvent(e) {
    const rect = this._binds.container.getBoundingClientRect();
    const ratio = (e.pageX - rect.left) / (rect.right - rect.left);
    if (this.logarithmic) {
        const logmin = Math.log(this.min);
        const logmax = Math.log(this.max);
        const value = Math.exp(logmin + ratio * (logmax - logmin));
        this.setValue(value);
    } else {
        const value = this.min + ratio * (this.max - this.min);
        this.setValue(value);
    }
}

_handleMouseDown(e) {
    document.addEventListener('mouseup', this._handleMouseUp);
    document.addEventListener('mousemove', this._handleMouseMove);
    this._setValueByEvent(e);
}

_handleMouseUp(e) {
    document.removeEventListener('mouseup', this._handleMouseUp);
    document.removeEventListener('mousemove', this._handleMouseMove);
    this._setValueByEvent(e);
}

_handleMouseMove(e) {
    this._setValueByEvent(e);
}

_handleWheel(e) {
    let wheel = e.deltaY;
    if (wheel < 0) {
        wheel = 1;
    } else if (wheel > 0) {
        wheel = -1;
    } else {
        wheel = 0;
    }

    const delta = this.logarithmic ? this.value * this.step * wheel : this.step * wheel;
    this.setValue(this.value + delta);
}

}
// #link UIObject

class Spacer extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Spacer, options);

    Object.assign(this, {
        width  : null,
        height : null
    }, options);

    if (this.width) {
        this._element.style.width = this.width;
    }
    if (this.height) {
        this._element.style.height = this.height;
    }
}

}
// #link UIObject

class Spinner extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Spinner, options);

    Object.assign(this, {
        value : 0,
        min   : null,
        max   : null,
        step  : 1,
        unit  : null, // TODO: add a label with units at the end of input
        // If logarithmic, step size is proportional to value * this.step
        logarithmic : false
    }, options);

    this._handleInput = this._handleInput.bind(this);
    this._handleChange = this._handleChange.bind(this);

    let input = this._binds.input;
    if (this.value !== null) {
        input.value = this.value;
    }
    if (this.min !== null) {
        input.min = this.min;
    }
    if (this.max !== null) {
        input.max = this.max;
    }
    if (this.step !== null) {
        input.step = this.step;
    }

    input.addEventListener('input', this._handleInput);
    input.addEventListener('change', this._handleChange);
}

setEnabled(enabled) {
    this._binds.input.disabled = !enabled;
    super.setEnabled(enabled);
}

setValue(value) {
    this.value = value;
    if (this.min !== null) {
        this.value = Math.max(this.value, this.min);
    }
    if (this.max !== null) {
        this.value = Math.min(this.value, this.max);
    }
    if (this.logarithmic) {
        this._binds.input.step = this.value * this.step;
    }
}

getValue() {
    return this.value;
}

_handleInput(e) {
    e.stopPropagation();

    if (this._binds.input.value === '') {
        return;
    }

    const parsedValue = parseFloat(this._binds.input.value);
    if (!isNaN(parsedValue)) {
        this.setValue(parsedValue);
        this.trigger('input');
    } else {
        this._binds.input.value = parsedValue;
    }
}

_handleChange(e) {
    e.stopPropagation();

    const parsedValue = parseFloat(this._binds.input.value);
    if (!isNaN(parsedValue)) {
        this.setValue(parsedValue);
        if (this._binds.input.value !== this.value) {
            this._binds.input.value = this.value;
            this.trigger('change');
        }
    } else {
        this._binds.input.value = this.value;
    }
}

}
// #link ../utils
// #link UIObject

class StatusBar extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.StatusBar, options);
}

_log(text, level) {
    const newLog = DOMUtils.instantiate(TEMPLATES.StatusBarLog);
    const binds = DOMUtils.bind(newLog);
    binds.timestamp.textContent = new Date().toISOString();
    binds.content.textContent = text;
    if (level) {
        newLog.classList.add(level);
    }
    this._element.appendChild(newLog);
    this._element.scrollTop = this._element.scrollHeight;
}

log(text) {
    this._log(text);
}

info(text) {
    this._log(text, 'info');
}

warning(text) {
    this._log(text, 'warning');
}

error(text) {
    this._log(text, 'error');
}

}
// #link UIObject

class Tabs extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Tabs, options);

    this._handleClick = this._handleClick.bind(this);

    this._tabs = [];
    this._index = 0;
}

add(name, object) {
    let panel = document.createElement('div');
    let header = document.createElement('div');
    const index = this._tabs.length;

    header.textContent = name || ('Tab ' + (index + 1));
    this._tabs.push({
        object : object,
        header : header,
        panel  : panel
    });
    this._binds.container.appendChild(panel);
    this._binds.headers.appendChild(header);
    object.appendTo(panel);

    panel.style.order = index;
    header.style.order = index;

    header.classList.add('header');
    header.addEventListener('click', this._handleClick);

    this._updateStyle();
}

_indexOfTab(tab) {
    for (let i = 0; i < this._tabs.length; i++) {
        if (this._tabs[i].header === tab ||
            this._tabs[i].panel === tab ||
            this._tabs[i].object === tab)
        {
            return i;
        }
    }
    return -1;
}

selectTab(objectOrIndex) {
    const len = this._tabs.length;
    if (len === 0) {
        return;
    }

    let index;
    if (typeof objectOrIndex === 'number') {
        index = ((objectOrIndex % len) + len) % len;
    } else {
        index = this._indexOfTab(objectOrIndex);
    }

    if (index >= 0 && index <= len) {
        this._index = index;
        this._updateStyle();
    }
}

_updateStyle() {
    for (let i = 0; i < this._tabs.length; i++) {
        const tab = this._tabs[i];
        const offset = -this._index * 100;
        tab.panel.style.left = offset + '%';
        if (i === this._index) {
            tab.header.classList.add('selected');
            tab.panel.classList.add('selected');
        } else {
            tab.header.classList.remove('selected');
            tab.panel.classList.remove('selected');
        }
    }
}

_handleClick(e) {
    const index = this._indexOfTab(e.target);
    if (index >= 0) {
        this.selectTab(index);
    }
}

}
// #link UIObject

class Textbox extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.Textbox, options);

    Object.assign(this, {
        value       : null,
        pattern     : null,
        placeholder : null
    }, options);

    if (this.value !== null) {
        this._binds.input.value = this.value;
    }
    if (this.pattern !== null) {
        this._binds.input.pattern = this.pattern;
    }
    if (this.placeholder !== null) {
        this._binds.input.placeholder = this.placeholder;
    }

    this._regex = new RegExp(this.pattern);
}

setEnabled(enabled) {
    this._binds.input.disabled = !enabled;
    super.setEnabled(enabled);
}

isValid() {
    return this._regex.test(this._binds.input.value);
}

getValue() {
    return this._binds.input.value;
}

getMatch() {
    return this._binds.input.value.match(this._regex);
}

}
// #link UIObject
// #link Spinner

class VectorSpinner extends UIObject {

constructor(options) {
    super(TEMPLATES.ui.VectorSpinner, options);

    Object.assign(this, {
        value : 0,
        min   : null,
        max   : null,
        step  : 1
    }, options);

    this._handleChange = this._handleChange.bind(this);
    this._handleInput = this._handleInput.bind(this);

    const opts = {
        value : this.value,
        min   : this.min,
        max   : this.max,
        step  : this.step
    };

    this._spinnerX = new Spinner(opts);
    this._spinnerY = new Spinner(opts);
    this._spinnerZ = new Spinner(opts);

    this._spinnerX.appendTo(this._binds.vectorX);
    this._spinnerY.appendTo(this._binds.vectorY);
    this._spinnerZ.appendTo(this._binds.vectorZ);

    this._spinnerX.addEventListener('change', this._handleChange);
    this._spinnerY.addEventListener('change', this._handleChange);
    this._spinnerZ.addEventListener('change', this._handleChange);
    this._spinnerX.addEventListener('input', this._handleInput);
    this._spinnerY.addEventListener('input', this._handleInput);
    this._spinnerZ.addEventListener('input', this._handleInput);
}

destroy() {
    this._spinnerX.destroy();
    this._spinnerY.destroy();
    this._spinnerZ.destroy();

    super.destroy();
}

setEnabled(enabled) {
    this._spinnerX.setEnabled(enabled);
    this._spinnerY.setEnabled(enabled);
    this._spinnerZ.setEnabled(enabled);
    super.setEnabled(enabled);
}

setVisible(visible) {
    this._spinnerX.setVisible(visible);
    this._spinnerY.setVisible(visible);
    this._spinnerZ.setVisible(visible);
    super.setVisible(visible);
}

setValue(value) {
    this._spinnerX.setValue(value.x);
    this._spinnerY.setValue(value.y);
    this._spinnerZ.setValue(value.z);
}

getValue() {
    return {
        x: this._spinnerX.getValue(),
        y: this._spinnerY.getValue(),
        z: this._spinnerZ.getValue(),
    };
}

_handleChange() {
    this.trigger('change');
}

_handleInput() {
    this.trigger('input');
}

}
// #link Accordion
// #link Button
// #link Checkbox
// #link ColorChooser
// #link Dropdown
// #link Field
// #link FileChooser
// #link Panel
// #link ProgressBar
// #link Radio
// #link Sidebar
// #link Slider
// #link Spacer
// #link Spinner
// #link StatusBar
// #link Tabs
// #link Textbox
// #link VectorSpinner

class UI {

static get CLASS_FROM_TYPE() {
    return {
        'accordion'     : Accordion,
        'button'        : Button,
        'checkbox'      : Checkbox,
        'color-chooser' : ColorChooser,
        'dropdown'      : Dropdown,
        'field'         : Field,
        'file-chooser'  : FileChooser,
        'panel'         : Panel,
        'progress-bar'  : ProgressBar,
        'radio'         : Radio,
        'sidebar'       : Sidebar,
        'slider'        : Slider,
        'spacer'        : Spacer,
        'spinner'       : Spinner,
        'status-bar'    : StatusBar,
        'tabs'          : Tabs,
        'textbox'       : Textbox,
        'vector'        : VectorSpinner,
    };
}

static create(spec) {
    // I know, no error checking whatsoever... this is for me, not users.
    // TODO: maybe decouple UI creation spec from object creation spec
    //       by adding an 'options' field to this UI creation spec
    if (!(spec.type in UI.CLASS_FROM_TYPE)) {
        throw new Error('Cannot instantiate: ' + spec.type);
    }
    const Class = UI.CLASS_FROM_TYPE[spec.type];
    const object = new Class(spec);
    let binds = {};
    if (spec.bind) {
        binds[spec.bind] = object;
    }

    if (spec.children) {
        for (let childKey in spec.children) {
            const childSpec = spec.children[childKey];
            const returnValue = UI.create(childSpec);
            const childObject = returnValue.object;
            const childBinds = returnValue.binds;
            for (let bind in childBinds) {
                if (bind in binds) {
                    throw new Error('Already bound: ' + bind);
                }
            }
            Object.assign(binds, childBinds);

            // TODO: maybe refactor .add()?
            switch (spec.type) {
                case 'tabs':
                    object.add(childKey, childObject);
                    break;
                case 'accordion':
                case 'field':
                case 'panel':
                case 'sidebar':
                    object.add(childObject);
                    break;
            }
        }
    }

    return { object, binds };
}

}
class EventEmitter {

constructor() {
    this._eventHandlers = {};
}

addEventListener(event, handler) {
    if (!this._eventHandlers[event]) {
        this._eventHandlers[event] = [];
    }
    this._eventHandlers[event].push(handler);
}

removeEventListener(event, handler) {
    let handlers = this._eventHandlers[event];
    if (!handlers) {
        return;
    }

    for (let i = 0; i < handlers.length; i++) {
        if (handlers[i] === handler) {
            handlers.splice(i--, 1);
        }
    }
}

trigger(event) {
    let handlers = this._eventHandlers[event];
    if (!handlers) {
        return;
    }

    for (let i = 0; i < handlers.length; i++) {
        handlers[i].apply(this, Array.prototype.slice.call(arguments, 1));
    }
}

}
// #link ../ui
// #link ../EventEmitter

class AbstractDialog extends EventEmitter {

constructor(spec, options) {
    super();

    Object.assign(this, {
        visible: true
    }, options);

    this._spec = spec;

    const creation = UI.create(JSON.parse(this._spec));
    this._object = creation.object;
    this._binds = creation.binds;
}

destroy() {
    this._object.destroy();
}

isVisible() {
    return this._object.isVisible();
}

setVisible(visible) {
    this._object.setVisible(visible);
}

show() {
    this._object.show();
}

hide() {
    this._object.hide();
}

appendTo(object) {
    object.add(this._object);
}

detach() {
    this._object.detach();
}

}
// #link AbstractDialog

// #link /uispecs/EnvmapLoadDialog

class EnvmapLoadDialog extends AbstractDialog {

constructor(options) {
    super(UISPECS.EnvmapLoadDialog, options);

    this._handleTypeChange = this._handleTypeChange.bind(this);
    this._handleLoadClick = this._handleLoadClick.bind(this);
    this._handleFileChange = this._handleFileChange.bind(this);
    this._handleURLChange = this._handleURLChange.bind(this);
    this._handleDemoChange = this._handleDemoChange.bind(this);

    this._demos = [];

    this._addEventListeners();
    this._loadDemoJson();
}

_addEventListeners() {
    this._binds.type.addEventListener('change', this._handleTypeChange);
    this._binds.loadButton.addEventListener('click', this._handleLoadClick);
    this._binds.file.addEventListener('change', this._handleFileChange);
    this._binds.url.addEventListener('input', this._handleURLChange);
    this._binds.demo.addEventListener('change', this._handleDemoChange);
}

_loadDemoJson() {
    // TODO: rewrite with fetch
    const xhr = new XMLHttpRequest();
    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            this._demos = JSON.parse(xhr.responseText);
            this._demos.forEach(demo => {
                this._binds.demo.addOption(demo.value, demo.label);
            });
        }
    });
    xhr.open('GET', 'demo-envmaps.json');
    xhr.send();
}

_handleLoadClick() {
    switch (this._binds.type.getValue()) {
        case 'file' : this._handleLoadFile(); break;
        case 'url'  : this._handleLoadURL();  break;
        case 'demo' : this._handleLoadDemo(); break;
    }
}

_handleLoadFile() {
    const files = this._binds.file.getFiles();
    if (files.length === 0) {
        // update status bar?
        return;
    }
    const file = files[0];

    this.trigger('load', {
        type : 'file',
        file : file
    });
}

_handleLoadURL() {
    const url = this._binds.url.getValue();
    this.trigger('load', {
        type : 'url',
        url  : url
    });
}

_handleLoadDemo() {
    const demo = this._binds.demo.getValue();
    const found = this._demos.find(d => d.value === demo);
    this.trigger('load', {
        type : 'url',
        url  : found.url
    });
}

_handleTypeChange() {
    // TODO: switching panel
    switch (this._binds.type.getValue()) {
        case 'file':
            this._binds.filePanel.show();
            this._binds.urlPanel.hide();
            this._binds.demoPanel.hide();
            break;
        case 'url':
            this._binds.filePanel.hide();
            this._binds.urlPanel.show();
            this._binds.demoPanel.hide();
            break;
        case 'demo':
            this._binds.filePanel.hide();
            this._binds.urlPanel.hide();
            this._binds.demoPanel.show();
            break;
    }
    this._updateLoadButtonAndProgressVisibility();
}

_handleFileChange() {
    this._updateLoadButtonAndProgressVisibility();
}

_handleURLChange() {
    this._updateLoadButtonAndProgressVisibility();
}

_handleDemoChange() {
    this._updateLoadButtonAndProgressVisibility();
}

_updateLoadButtonAndProgressVisibility() {
    switch (this._binds.type.getValue()) {
        case 'file':
            const files = this._binds.file.getFiles();
            this._binds.loadButtonAndProgress.setVisible(files.length > 0);
            break;
        case 'url':
            const urlEmpty = this._binds.url.getValue() === '';
            this._binds.loadButtonAndProgress.setVisible(!urlEmpty);
            break;
        case 'demo':
            const demo = this._binds.demo.getValue();
            this._binds.loadButtonAndProgress.setVisible(!!demo);
            break;
    }
}

}
// #link ../utils
// #link AbstractDialog

// #link /uispecs/MainDialog
// #link /html/AboutText

class MainDialog extends AbstractDialog {

constructor(options) {
    super(UISPECS.MainDialog, options);

    this._handleRendererChange = this._handleRendererChange.bind(this);
    this._handleToneMapperChange = this._handleToneMapperChange.bind(this);

    this._binds.sidebar.appendTo(document.body);
    this._binds.rendererSelect.addEventListener('change', this._handleRendererChange);
    this._binds.toneMapperSelect.addEventListener('change', this._handleToneMapperChange);

    const about = DOMUtils.instantiate(TEMPLATES.AboutText);
    this._binds.about._element.appendChild(about);
}

getVolumeLoadContainer() {
    return this._binds.volumeLoadContainer;
}

getEnvmapLoadContainer() {
    return this._binds.envmapLoadContainer;
}

getRendererSettingsContainer() {
    return this._binds.rendererSettingsContainer;
}

getToneMapperSettingsContainer() {
    return this._binds.toneMapperSettingsContainer;
}

getRenderingContextSettingsContainer() {
    return this._binds.renderingContextSettingsContainer;
}

getSelectedRenderer() {
    return this._binds.rendererSelect.getValue();
}

getSelectedToneMapper() {
    return this._binds.toneMapperSelect.getValue();
}

_handleRendererChange() {
    const renderer = this._binds.rendererSelect.getValue();
    this.trigger('rendererchange', renderer);
}

_handleToneMapperChange() {
    const toneMapper = this._binds.toneMapperSelect.getValue();
    this.trigger('tonemapperchange', toneMapper);
}

disableMCC() {
    this._binds.rendererSelect.removeOption('mcc');
}

}
class WebGL {

static createShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const status = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!status) {
        const log = gl.getShaderInfoLog(shader);
        throw new Error('Cannot compile shader\nInfo log:\n' + log);
    }
    return shader;
}

static createProgram(gl, shaders) {
    const program = gl.createProgram();
    for (let shader of shaders) {
        gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    const status = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!status) {
        const log = gl.getProgramInfoLog(program);
        throw new Error('Cannot link program\nInfo log:\n' + log);
    }

    let attributes = {};
    const activeAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < activeAttributes; i++) {
        const info = gl.getActiveAttrib(program, i);
        attributes[info.name] = gl.getAttribLocation(program, info.name);
    }

    let uniforms = {};
    const activeUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < activeUniforms; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }

    return { program, attributes, uniforms };
}

static buildPrograms(gl, shaders, mixins) {
    let cooked = {};
    Object.keys(shaders).forEach(function(name) {
        cooked[name] = {};
        const types = shaders[name];
        Object.keys(types).forEach(function(type) {
            cooked[name][type] = types[type].replace(/@([a-zA-Z0-9]+)/g, function(_, mixin) {
                return mixins[mixin];
            });
        });
    });

    let programs = {};
    Object.keys(cooked).forEach(function(name) {
        try {
            const program = cooked[name];
            if (program.vertex && program.fragment) {
                programs[name] = WebGL.createProgram(gl, [
                    WebGL.createShader(gl, program.vertex, gl.VERTEX_SHADER),
                    WebGL.createShader(gl, program.fragment, gl.FRAGMENT_SHADER)
                ]);
            } else if (program.compute) {
                programs[name] = WebGL.createProgram(gl, [
                    WebGL.createShader(gl, program.compute, gl.COMPUTE_SHADER)
                ]);
            }
        } catch (e) {
            throw new Error('Error compiling ' + name + '\n' + e);
        }
    });

    return programs;
}

static createTexture(gl, options) {
    const target = options.target || gl.TEXTURE_2D;
    const internalFormat = options.internalFormat || gl.RGBA;
    const format = options.format || gl.RGBA;
    const type = options.type || gl.UNSIGNED_BYTE;
    const texture = options.texture || gl.createTexture();

    if (options.unit) {
        gl.activeTexture(gl.TEXTURE0 + options.unit);
    }
    gl.bindTexture(target, texture);
    if (options.image) {
        gl.texImage2D(target, 0, internalFormat, format, type, options.image);
    } else { // if options.data == null, just allocate
        if (target === gl.TEXTURE_3D) {
            gl.texImage3D(target, 0, internalFormat, options.width, options.height, options.depth, 0, format, type, options.data);
        } else {
            gl.texImage2D(target, 0, internalFormat, options.width, options.height, 0, format, type, options.data);
        }
    }
    if (options.wrapS) { gl.texParameteri(target, gl.TEXTURE_WRAP_S, options.wrapS); }
    if (options.wrapT) { gl.texParameteri(target, gl.TEXTURE_WRAP_T, options.wrapT); }
    if (options.wrapR) { gl.texParameteri(target, gl.TEXTURE_WRAP_R, options.wrapR); }
    if (options.min) { gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, options.min); }
    if (options.mag) { gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, options.mag); }
    if (options.mip) { gl.generateMipmap(target); }

    return texture;
}

static createFramebuffer(gl, attachments) {
    function attach(attachmentPoint, object) {
        if (object instanceof WebGLTexture) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, object, 0);
        } else if (object instanceof WebGLRenderbuffer) {
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachmentPoint, gl.RENDERBUFFER, object);
        }
    }

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    if (attachments.color) {
        for (let i = 0; i < attachments.color.length; i++) {
            attach(gl.COLOR_ATTACHMENT0 + i, attachments.color[i]);
        }
    }
    if (attachments.depth) {
        attach(gl.DEPTH_ATTACHMENT, attachments.depth);
    }
    if (attachments.stencil) {
        attach(gl.STENCIL_ATTACHMENT, attachments.stencil);
    }

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Cannot create framebuffer: ' + status);
    }

    return framebuffer;
}

static createBuffer(gl, options) {
    const target = options.target || gl.ARRAY_BUFFER;
    const hint = options.hint || gl.STATIC_DRAW;
    const buffer = options.buffer || gl.createBuffer();

    gl.bindBuffer(target, buffer);
    gl.bufferData(target, options.data, hint);
    gl.bindBuffer(target, null);

    return buffer;
}

static createUnitQuad(gl) {
    return WebGL.createBuffer(gl, {
        data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])
    });
}

static createClipQuad(gl) {
    return WebGL.createBuffer(gl, {
        data: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1])
    });
}

}
class Draggable {

constructor(element, handle) {
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);

    this._element = element;
    this._handle = handle;
    this._startX = 0;
    this._startY = 0;

    this._handle.addEventListener('mousedown', this._handleMouseDown);
}

_handleMouseDown(e) {
    this._startX = e.pageX;
    this._startY = e.pageY;

    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
    this._handle.removeEventListener('mousedown', this._handleMouseDown);

    const event = new CustomEvent('draggablestart', {
        detail: {
            x: this._startX,
            y: this._startY
        }
    });
    this._element.dispatchEvent(event);
}

_handleMouseUp(e) {
    document.removeEventListener('mousemove', this._handleMouseMove);
    document.removeEventListener('mouseup', this._handleMouseUp);
    this._handle.addEventListener('mousedown', this._handleMouseDown);

    const event = new CustomEvent('draggableend', {
        detail: {
            x: this._startX,
            y: this._startY
        }
    });
    this._element.dispatchEvent(event);
}

_handleMouseMove(e) {
    const dx = e.pageX - this._startX;
    const dy = e.pageY - this._startY;
    const x = this._element.offsetLeft;
    const y = this._element.offsetTop;
    const pw = this._element.parentNode.offsetWidth;
    const ph = this._element.parentNode.offsetHeight;
    const newx = Math.min(Math.max(x + dx, 0), pw);
    const newy = Math.min(Math.max(y + dy, 0), ph);
    this._element.style.left = newx + 'px';
    this._element.style.top = newy + 'px';
    this._startX = e.pageX;
    this._startY = e.pageY;

    const event = new CustomEvent('draggable', {
        detail: {
            x: this._startX,
            y: this._startY
        }
    });
    this._element.dispatchEvent(event);
}

}
// #link utils
// #link EventEmitter
// #link WebGL
// #link Draggable

// #link /html/TransferFunctionWidget
// #link /html/TransferFunctionWidgetBumpHandle
// #link /css/TransferFunctionWidget

class TransferFunctionWidget extends EventEmitter {

constructor(options) {
    super();

    this._onColorChange = this._onColorChange.bind(this);

    Object.assign(this, {
        _width                  : 256,
        _height                 : 256,
        _transferFunctionWidth  : 256,
        _transferFunctionHeight : 256,
        scaleSpeed              : 0.003
    }, options);

    this._$html = DOMUtils.instantiate(TEMPLATES.TransferFunctionWidget);
    this._$colorPicker   = this._$html.querySelector('[name="color"]');
    this._$alphaPicker   = this._$html.querySelector('[name="alpha"]');
    this._$addBumpButton = this._$html.querySelector('[name="add-bump"]');
    this._$removeSelectedBump   = this._$html.querySelector('[name=remove-selected-bump]');
    this._$removeAllBumps       = this._$html.querySelector('[name=remove-all-bumps]');
    this._$loadButton    = this._$html.querySelector('[name="load"]');
    this._$saveButton    = this._$html.querySelector('[name="save"]');

    this._canvas = this._$html.querySelector('canvas');
    this._canvas.width = this._transferFunctionWidth;
    this._canvas.height = this._transferFunctionHeight;
    this.resize(this._width, this._height);

    this._gl = this._canvas.getContext('webgl2', {
        depth                 : false,
        stencil               : false,
        antialias             : false,
        preserveDrawingBuffer : true
    });
    const gl = this._gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this._clipQuad = WebGL.createClipQuad(gl);
    this._program = WebGL.buildPrograms(gl, {
        drawTransferFunction: SHADERS.drawTransferFunction
    }, MIXINS).drawTransferFunction;
    const program = this._program;
    gl.useProgram(program.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    gl.enableVertexAttribArray(program.attributes.aPosition);
    gl.vertexAttribPointer(program.attributes.aPosition, 2, gl.FLOAT, false, 0, 0);

    this._bumps = [];
    this._$addBumpButton.addEventListener('click', () => {
        this.addBump();
    });
    this._$removeSelectedBump.addEventListener('click', () => {
        this.removeSelectedBump();
    });
    this._$removeAllBumps.addEventListener('click', () => {
        this.removeAllBumps();
    });

    this._$colorPicker.addEventListener('change', this._onColorChange);
    this._$alphaPicker.addEventListener('change', this._onColorChange);

    this._$loadButton.addEventListener('click', () => {
        CommonUtils.readTextFile(data => {
            this._bumps = JSON.parse(data);
            this.render();
            this._rebuildHandles();
            this.trigger('change');
        });
    });

    this._$saveButton.addEventListener('click', () => {
        CommonUtils.downloadJSON(this._bumps, 'TransferFunction.json');
    });
}

destroy() {
    const gl = this._gl;
    gl.deleteBuffer(this._clipQuad);
    gl.deleteProgram(this._program.program);
    DOMUtils.remove(this._$html);
}

resize(width, height) {
    this._canvas.style.width = width + 'px';
    this._canvas.style.height = height + 'px';
    this._width = width;
    this._height = height;
}

resizeTransferFunction(width, height) {
    this._canvas.width = width;
    this._canvas.height = height;
    this._transferFunctionWidth = width;
    this._transferFunctionHeight = height;
    const gl = this._gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

render() {
    const gl = this._gl;
    const program = this._program;

    gl.clear(gl.COLOR_BUFFER_BIT);
    this._bumps.forEach(bump => {
        gl.uniform2f(program.uniforms['uPosition'], bump.position.x, bump.position.y);
        gl.uniform2f(program.uniforms['uSize'], bump.size.x, bump.size.y);
        gl.uniform4f(program.uniforms['uColor'], bump.color.r, bump.color.g, bump.color.b, bump.color.a);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    });
}

addBump(options) {
    const bumpIndex = this._bumps.length;
    const newBump = {
        position: {
            x: 0.5,
            y: 0.5
        },
        size: {
            x: 0.2,
            y: 0.2
        },
        color: {
            r: 1,
            g: 0,
            b: 0,
            a: 1
        }
    };
    this._bumps.push(newBump);
    this._addHandle(bumpIndex);
    this.selectBump(bumpIndex);
    this.render();
    this.trigger('change');
}

removeSelectedBump() {
    this._removeHandle(this.getSelectedBumpIndex());
}

removeAllBumps() {
    this._bumps = [];
    this._rebuildHandles();
    this.render();
    this.trigger('change');
}

_removeHandle(index) {
    const handles = this._$html.querySelectorAll('.bump');
    handles.forEach(handle => {
        const i = parseInt(DOMUtils.data(handle, 'index'));
        if (i === index) {
            this._bumps.splice(i, 1);
        }
    });
    this._rebuildHandles();
    this.render();
    this.trigger('change');
}

_addHandle(index) {
    const $handle = DOMUtils.instantiate(TEMPLATES.TransferFunctionWidgetBump);
    this._$html.querySelector('.widget').appendChild($handle);
    DOMUtils.data($handle, 'index', index);

    const left = this._bumps[index].position.x * this._width;
    const top = (1 - this._bumps[index].position.y) * this._height;
    $handle.style.left = Math.round(left) + 'px';
    $handle.style.top = Math.round(top) + 'px';

    new Draggable($handle, $handle.querySelector('.bump-handle'));
    $handle.addEventListener('draggable', e => {
        const x = e.currentTarget.offsetLeft / this._width;
        const y = 1 - (e.currentTarget.offsetTop / this._height);
        const i = parseInt(DOMUtils.data(e.currentTarget, 'index'));
        this._bumps[i].position.x = x;
        this._bumps[i].position.y = y;
        this.render();
        this.trigger('change');
    });
    $handle.addEventListener('mousedown', e => {
        const i = parseInt(DOMUtils.data(e.currentTarget, 'index'));
        this.selectBump(i);
    });
    $handle.addEventListener('mousewheel', e => {
        const amount = e.deltaY * this.scaleSpeed;
        const scale = Math.exp(-amount);
        const i = parseInt(DOMUtils.data(e.currentTarget, 'index'));
        this.selectBump(i);
        if (e.shiftKey) {
            this._bumps[i].size.y *= scale;
        } else {
            this._bumps[i].size.x *= scale;
        }
        this.render();
        this.trigger('change');
    });
}

_rebuildHandles() {
    const handles = this._$html.querySelectorAll('.bump');
    handles.forEach(handle => {
        DOMUtils.remove(handle);
    });
    for (let i = 0; i < this._bumps.length; i++) {
        this._addHandle(i);
    }
}

selectBump(index) {
    const handles = this._$html.querySelectorAll('.bump');
    handles.forEach(handle => {
        const i = parseInt(DOMUtils.data(handle, 'index'));
        if (i === index) {
            handle.classList.add('selected');
        } else {
            handle.classList.remove('selected');
        }
    });

    const color = this._bumps[index].color;
    this._$colorPicker.value = CommonUtils.rgb2hex(color.r, color.g, color.b);
    this._$alphaPicker.value = color.a;
}

getSelectedBumpIndex() {
    const handles = this._$html.querySelectorAll('.bump');
    let idx = -1;
    handles.forEach(handle => {
        let i = parseInt(DOMUtils.data(handle, 'index'));
        if (handle.classList.contains('selected')) {
            idx = i;
        }
    });
    return idx;
}

getTransferFunction() {
    return this._canvas;
}

_onColorChange() {
    const $selectedBump = this._$html.querySelector('.bump.selected');
    const i = parseInt(DOMUtils.data($selectedBump, 'index'));
    const color = CommonUtils.hex2rgb(this._$colorPicker.value);
    const alpha = parseFloat(this._$alphaPicker.value);
    this._bumps[i].color.r = color.r;
    this._bumps[i].color.g = color.g;
    this._bumps[i].color.b = color.b;
    this._bumps[i].color.a = alpha;
    this.render();
    this.trigger('change');
}

appendTo(object) {
    object.appendChild(this._$html);
}

}
// #link ../AbstractDialog
// #link ../../TransferFunctionWidget

// #link /uispecs/renderers/DOSRendererDialog

class DOSRendererDialog extends AbstractDialog {

constructor(renderer, options) {
    super(UISPECS.renderers.DOSRendererDialog, options);

    this._renderer = renderer;

    this._handleChange = this._handleChange.bind(this);
    this._handleSamplesChange = this._handleSamplesChange.bind(this);
    this._handleTFChange = this._handleTFChange.bind(this);

    this._binds.steps.addEventListener('input', this._handleChange);
    this._binds.slices.addEventListener('input', this._handleChange);
    this._binds.extinction.addEventListener('input', this._handleChange);
    this._binds.aperture.addEventListener('input', this._handleChange);
    this._binds.samples.addEventListener('input', this._handleSamplesChange);

    this._tfwidget = new TransferFunctionWidget();
    this._binds.tfcontainer.add(this._tfwidget);
    this._tfwidget.addEventListener('change', this._handleTFChange);
}

destroy() {
    this._tfwidget.destroy();
    super.destroy();
}

_handleChange() {
    this._renderer.steps = this._binds.steps.getValue();
    this._renderer.slices = this._binds.slices.getValue();
    this._renderer.extinction = this._binds.extinction.getValue();
    this._renderer.aperture = this._binds.aperture.getValue();
    this._renderer.reset();
}

_handleSamplesChange() {
    this._renderer.samples = this._binds.samples.getValue();
    this._renderer.generateOcclusionSamples();
    this._renderer.reset();
}

_handleTFChange() {
    this._renderer.setTransferFunction(this._tfwidget.getTransferFunction());
    this._renderer.reset();
}

}
// #link ../AbstractDialog
// #link ../../TransferFunctionWidget

// #link /uispecs/renderers/EAMRendererDialog

class EAMRendererDialog extends AbstractDialog {

constructor(renderer, options) {
    super(UISPECS.renderers.EAMRendererDialog, options);

    this._renderer = renderer;

    this._handleChange = this._handleChange.bind(this);
    this._handleTFChange = this._handleTFChange.bind(this);

    this._binds.slices.addEventListener('input', this._handleChange);
    this._binds.extinction.addEventListener('input', this._handleChange);

    this._tfwidget = new TransferFunctionWidget();
    this._binds.tfcontainer.add(this._tfwidget);
    this._tfwidget.addEventListener('change', this._handleTFChange);
}

destroy() {
    this._tfwidget.destroy();
    super.destroy();
}

_handleChange() {
    this._renderer.slices = this._binds.slices.getValue();
    this._renderer.extinction = this._binds.extinction.getValue();
    this._renderer.reset();
}

_handleTFChange() {
    this._renderer.setTransferFunction(this._tfwidget.getTransferFunction());
    this._renderer.reset();
}

}
// #link ../../utils
// #link ../AbstractDialog

// #link /uispecs/renderers/ISORendererDialog

class ISORendererDialog extends AbstractDialog {

constructor(renderer, options) {
    super(UISPECS.renderers.ISORendererDialog, options);

    this._renderer = renderer;

    this._handleChange = this._handleChange.bind(this);

    this._binds.steps.addEventListener('input', this._handleChange);
    this._binds.isovalue.addEventListener('change', this._handleChange);
    this._binds.color.addEventListener('change', this._handleChange);
    this._binds.direction.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._renderer._stepSize = 1 / this._binds.steps.getValue();
    this._renderer._isovalue = this._binds.isovalue.getValue();

    const color = CommonUtils.hex2rgb(this._binds.color.getValue());
    this._renderer._diffuse[0] = color.r;
    this._renderer._diffuse[1] = color.g;
    this._renderer._diffuse[2] = color.b;

    const direction = this._binds.direction.getValue();
    this._renderer._light[0] = direction.x;
    this._renderer._light[1] = direction.y;
    this._renderer._light[2] = direction.z;

    this._renderer.reset();
}

}
// #link ../AbstractDialog
// #link ../../TransferFunctionWidget

// #link /uispecs/renderers/MCMRendererDialog

class MCMRendererDialog extends AbstractDialog {

constructor(renderer, options) {
    super(UISPECS.renderers.MCMRendererDialog, options);

    this._renderer = renderer;

    this._handleChange = this._handleChange.bind(this);
    this._handleTFChange = this._handleTFChange.bind(this);

    this._binds.extinction.addEventListener('input', this._handleChange);
    this._binds.albedo.addEventListener('change', this._handleChange);
    this._binds.bias.addEventListener('change', this._handleChange);
    this._binds.ratio.addEventListener('change', this._handleChange);
    this._binds.bounces.addEventListener('input', this._handleChange);
    this._binds.steps.addEventListener('input', this._handleChange);

    this._tfwidget = new TransferFunctionWidget();
    this._binds.tfcontainer.add(this._tfwidget);
    this._tfwidget.addEventListener('change', this._handleTFChange);
}

destroy() {
    this._tfwidget.destroy();
    super.destroy();
}

_handleChange() {
    const extinction = this._binds.extinction.getValue();
    const albedo     = this._binds.albedo.getValue();
    const bias       = this._binds.bias.getValue();
    const ratio      = this._binds.ratio.getValue();
    const bounces    = this._binds.bounces.getValue();
    const steps      = this._binds.steps.getValue();

    this._renderer.absorptionCoefficient = extinction * (1 - albedo);
    this._renderer.scatteringCoefficient = extinction * albedo;
    this._renderer.scatteringBias = bias;
    this._renderer.majorant = extinction * ratio;
    this._renderer.maxBounces = bounces;
    this._renderer.steps = steps;

    this._renderer.reset();
}

_handleTFChange() {
    this._renderer.setTransferFunction(this._tfwidget.getTransferFunction());
    this._renderer.reset();
}

}
// #link ../AbstractDialog
// #link ../../TransferFunctionWidget

// #link /uispecs/renderers/MCSRendererDialog

class MCSRendererDialog extends AbstractDialog {

constructor(renderer, options) {
    super(UISPECS.renderers.MCSRendererDialog, options);

    this._renderer = renderer;

    this._handleChange = this._handleChange.bind(this);
    this._handleTFChange = this._handleTFChange.bind(this);

    this._binds.extinction.addEventListener('input', this._handleChange);

    this._tfwidget = new TransferFunctionWidget();
    this._binds.tfcontainer.add(this._tfwidget);
    this._tfwidget.addEventListener('change', this._handleTFChange);
}

destroy() {
    this._tfwidget.destroy();
    super.destroy();
}

_handleChange() {
    this._renderer._sigmaMax = this._binds.extinction.getValue();
    this._renderer._alphaCorrection = this._binds.extinction.getValue();

    this._renderer.reset();
}

_handleTFChange() {
    this._renderer.setTransferFunction(this._tfwidget.getTransferFunction());
    this._renderer.reset();
}

}
// #link ../AbstractDialog

// #link /uispecs/renderers/MIPRendererDialog

class MIPRendererDialog extends AbstractDialog {

constructor(renderer, options) {
    super(UISPECS.renderers.MIPRendererDialog, options);

    this._renderer = renderer;

    this._handleChange = this._handleChange.bind(this);

    this._binds.steps.addEventListener('change', this._handleChange);
}

_handleChange() {
    this._renderer.steps = this._binds.steps.getValue();
}

}
// #link AbstractDialog

// #link /uispecs/RenderingContextDialog

class RenderingContextDialog extends AbstractDialog {

constructor(options) {
    super(UISPECS.RenderingContextDialog, options);

    this._handleResolutionChange = this._handleResolutionChange.bind(this);
    this._handleTransformationChange = this._handleTransformationChange.bind(this);
    this._handleFilterChange = this._handleFilterChange.bind(this);

    this._binds.resolution.addEventListener('change', this._handleResolutionChange);
    this._binds.scale.addEventListener('input', this._handleTransformationChange);
    this._binds.translation.addEventListener('input', this._handleTransformationChange);
    this._binds.filter.addEventListener('change', this._handleFilterChange);
}

_handleResolutionChange() {
    this.trigger('resolution', {
        resolution: this._binds.resolution.getValue()
    });
}

_handleTransformationChange() {
    this.trigger('transformation', {
        scale       : this._binds.scale.getValue(),
        translation : this._binds.translation.getValue()
    });
}

_handleFilterChange() {
    this.trigger('filter', {
        filter: this._binds.filter.isChecked() ? 'linear' : 'nearest'
    });
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/AcesToneMapperDialog

class AcesToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.AcesToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.exposure.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper.exposure = this._binds.exposure.getValue();
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/ArtisticToneMapperDialog

class ArtisticToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.ArtisticToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.low.addEventListener('input', this._handleChange);
    this._binds.high.addEventListener('input', this._handleChange);
    this._binds.saturation.addEventListener('input', this._handleChange);
    this._binds.midtones.addEventListener('change', this._handleChange);
}

_handleChange() {
    const low = this._binds.low.getValue();
    const high = this._binds.high.getValue();
    const midtones = this._binds.midtones.getValue();
    const saturation = this._binds.saturation.getValue();

    this._toneMapper.low = low;
    this._toneMapper.mid = low + (1 - midtones) * (high - low);
    this._toneMapper.high = high;
    this._toneMapper.saturation = saturation;
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/FilmicToneMapperDialog

class FilmicToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.FilmicToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.exposure.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper.exposure = this._binds.exposure.getValue();
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/LottesToneMapperDialog

class LottesToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.LottesToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.exposure.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper.exposure = this._binds.exposure.getValue();
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/RangeToneMapperDialog

class RangeToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.RangeToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.low.addEventListener('input', this._handleChange);
    this._binds.high.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper._min = this._binds.low.getValue();
    this._toneMapper._max = this._binds.high.getValue();
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/Reinhard2ToneMapperDialog

class Reinhard2ToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.Reinhard2ToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.exposure.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper.exposure = this._binds.exposure.getValue();
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/ReinhardToneMapperDialog

class ReinhardToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.ReinhardToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.exposure.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper.exposure = this._binds.exposure.getValue();
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/UchimuraToneMapperDialog

class UchimuraToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.UchimuraToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.exposure.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper.exposure = this._binds.exposure.getValue();
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/Uncharted2ToneMapperDialog

class Uncharted2ToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.Uncharted2ToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.exposure.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper.exposure = this._binds.exposure.getValue();
}

}
// #link ../AbstractDialog

// #link /uispecs/tonemappers/UnrealToneMapperDialog

class UnrealToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.UnrealToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.exposure.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper.exposure = this._binds.exposure.getValue();
}

}
// #link AbstractDialog

// #link /uispecs/VolumeLoadDialog

class VolumeLoadDialog extends AbstractDialog {

constructor(options) {
    super(UISPECS.VolumeLoadDialog, options);

    this._handleTypeChange = this._handleTypeChange.bind(this);
    this._handleLoadClick = this._handleLoadClick.bind(this);
    this._handleFileChange = this._handleFileChange.bind(this);
    this._handleURLChange = this._handleURLChange.bind(this);
    this._handleDemoChange = this._handleDemoChange.bind(this);

    this._demos = [];

    this._addEventListeners();
    this._loadDemoJson();
}

_addEventListeners() {
    this._binds.type.addEventListener('change', this._handleTypeChange);
    this._binds.loadButton.addEventListener('click', this._handleLoadClick);
    this._binds.file.addEventListener('change', this._handleFileChange);
    this._binds.url.addEventListener('input', this._handleURLChange);
    this._binds.demo.addEventListener('change', this._handleDemoChange);
}

_loadDemoJson() {
    const xhr = new XMLHttpRequest();
    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            this._demos = JSON.parse(xhr.responseText);
            this._demos.forEach(demo => {
                this._binds.demo.addOption(demo.value, demo.label);
            });
        }
    });
    xhr.open('GET', 'demo-volumes.json');
    xhr.send();
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

_handleLoadClick() {
    switch (this._binds.type.getValue()) {
        case 'file' : this._handleLoadFile(); break;
        case 'url'  : this._handleLoadURL();  break;
        case 'demo' : this._handleLoadDemo(); break;
    }
}

_handleLoadFile() {
    const files = this._binds.file.getFiles();
    if (files.length === 0) {
        // update status bar?
        return;
    }

    const file = files[0];
    const filetype = this._getVolumeTypeFromURL(file.name);
    const dimensions = this._binds.dimensions.getValue();
    const precision = parseInt(this._binds.precision.getValue(), 10);

    this.trigger('load', {
        type       : 'file',
        file       : file,
        filetype   : filetype,
        dimensions : dimensions,
        precision  : precision,
    });
}

_handleLoadURL() {
    const url = this._binds.url.getValue();
    const filetype = this._getVolumeTypeFromURL(url);
    this.trigger('load', {
        type     : 'url',
        url      : url,
        filetype : filetype
    });
}

_handleLoadDemo() {
    const demo = this._binds.demo.getValue();
    const found = this._demos.find(d => d.value === demo);
    const filetype = this._getVolumeTypeFromURL(found.url);
    this.trigger('load', {
        type     : 'url',
        url      : found.url,
        filetype : filetype
    });
}

_handleTypeChange() {
    // TODO: switching panel
    switch (this._binds.type.getValue()) {
        case 'file':
            this._binds.filePanel.show();
            this._binds.urlPanel.hide();
            this._binds.demoPanel.hide();
            break;
        case 'url':
            this._binds.filePanel.hide();
            this._binds.urlPanel.show();
            this._binds.demoPanel.hide();
            break;
        case 'demo':
            this._binds.filePanel.hide();
            this._binds.urlPanel.hide();
            this._binds.demoPanel.show();
            break;
    }
    this._updateLoadButtonAndProgressVisibility();
}

_handleFileChange() {
    const files = this._binds.file.getFiles();
    if (files.length === 0) {
        this._binds.rawSettingsPanel.hide();
    } else {
        const file = files[0];
        const type = this._getVolumeTypeFromURL(file.name);
        this._binds.rawSettingsPanel.setVisible(type === 'raw');
    }
    this._updateLoadButtonAndProgressVisibility();
}

_handleURLChange() {
    this._updateLoadButtonAndProgressVisibility();
}

_handleDemoChange() {
    this._updateLoadButtonAndProgressVisibility();
}

_updateLoadButtonAndProgressVisibility() {
    switch (this._binds.type.getValue()) {
        case 'file':
            const files = this._binds.file.getFiles();
            this._binds.loadButtonAndProgress.setVisible(files.length > 0);
            break;
        case 'url':
            const urlEmpty = this._binds.url.getValue() === '';
            this._binds.loadButtonAndProgress.setVisible(!urlEmpty);
            break;
        case 'demo':
            const demo = this._binds.demo.getValue();
            this._binds.loadButtonAndProgress.setVisible(!!demo);
            break;
    }
}

}
class Quaternion {

constructor(x, y, z, w) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.w = (w !== undefined) ? w : 1;
}

clone() {
    return new Quaternion(this.x, this.y, this.z, this.w);
}

copy(q) {
    this.x = q.x;
    this.y = q.y;
    this.z = q.z;
    this.w = q.w;
    return this;
}

set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
}

identity() {
    this.x = this.y = this.z = 0;
    this.w = 1;
    return this;
}

inverse() {
    this.x *= -1;
    this.y *= -1;
    this.z *= -1;
    return this;
}

multiply(a, b) {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w;
    const bx = b.x, by = b.y, bz = b.z, bw = b.w;

    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;

    return this;
}

length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
}

normalize() {
    const length = this.length();

    this.x /= length;
    this.y /= length;
    this.z /= length;
    this.w /= length;

    return this;
}

fromAxisAngle() {
    const s = Math.sin(this.w / 2);
    const c = Math.cos(this.w / 2);

    this.x *= s;
    this.y *= s;
    this.z *= s;
    this.w = c;

    return this;
}

fromDevice(alpha, beta, gamma) {
    const degtorad = Math.PI / 180;
    const x = beta * degtorad / 2;
    const y = gamma * degtorad / 2;
    const z = alpha * degtorad / 2;

    const cx = Math.cos(x);
    const sx = Math.sin(x);
    const cy = Math.cos(y);
    const sy = Math.sin(y);
    const cz = Math.cos(z);
    const sz = Math.sin(z);

    this.x = sx * cy * cz - cx * sy * sz;
    this.y = cx * sy * cz + sx * cy * sz;
    this.z = cx * cy * sz + sx * sy * cz;
    this.w = cx * cy * cz - sx * sy * sz;

    return this;
}

toRotationMatrix(m) {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    m[0] = 1 - (yy + zz);
    m[4] = xy - wz;
    m[8] = xz + wy;

    m[1] = xy + wz;
    m[5] = 1 - (xx + zz);
    m[9] = yz - wx;

    m[2] = xz - wy;
    m[6] = yz + wx;
    m[10] = 1 - (xx + yy);

    m[3] = m[7] = m[11] = m[12] = m[13] = m[14] = 0;
    m[15] = 1;
}

}
// #link Quaternion

class Matrix {

constructor(data) {
    this.m = new Float32Array(16);
    if (data) {
        this.m.set(data);
    } else {
        this.identity();
    }
}

clone() {
    return new Matrix(this.m);
}

copy(m) {
    this.m.set(m.m);
    return this;
}

identity() {
    this.m.fill(0);
    this.m[0] = this.m[5] = this.m[10] = this.m[15] = 1;
}

transpose() {
    let T;
    let m = this.m;

    T = m[ 1]; m[ 1] = m[ 4]; m[ 4] = T;
    T = m[ 2]; m[ 2] = m[ 8]; m[ 8] = T;
    T = m[ 6]; m[ 6] = m[ 9]; m[ 9] = T;
    T = m[ 3]; m[ 3] = m[12]; m[12] = T;
    T = m[ 7]; m[ 7] = m[13]; m[13] = T;
    T = m[11]; m[11] = m[14]; m[14] = T;

    return this;
}

multiply(a, b) {
    const am = a.m;
    const bm = b.m;
    let m = this.m;

    const a11 = am[ 0], a12 = am[ 1], a13 = am[ 2], a14 = am[ 3];
    const a21 = am[ 4], a22 = am[ 5], a23 = am[ 6], a24 = am[ 7];
    const a31 = am[ 8], a32 = am[ 9], a33 = am[10], a34 = am[11];
    const a41 = am[12], a42 = am[13], a43 = am[14], a44 = am[15];

    const b11 = bm[ 0], b12 = bm[ 1], b13 = bm[ 2], b14 = bm[ 3];
    const b21 = bm[ 4], b22 = bm[ 5], b23 = bm[ 6], b24 = bm[ 7];
    const b31 = bm[ 8], b32 = bm[ 9], b33 = bm[10], b34 = bm[11];
    const b41 = bm[12], b42 = bm[13], b43 = bm[14], b44 = bm[15];

    m[ 0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    m[ 1] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    m[ 2] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    m[ 3] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    m[ 4] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    m[ 5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    m[ 6] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    m[ 7] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    m[ 8] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    m[ 9] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    m[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    m[11] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    m[12] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    m[13] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    m[14] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    m[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return this;
}

det() {
    let m = this.m;

    const m11 = m[ 0], m12 = m[ 1], m13 = m[ 2], m14 = m[ 3];
    const m21 = m[ 4], m22 = m[ 5], m23 = m[ 6], m24 = m[ 7];
    const m31 = m[ 8], m32 = m[ 9], m33 = m[10], m34 = m[11];
    const m41 = m[12], m42 = m[13], m43 = m[14], m44 = m[15];

    return (
        + m11 * m22 * m33 * m44 + m11 * m23 * m34 * m42 + m11 * m24 * m32 * m43
        + m12 * m21 * m34 * m43 + m12 * m23 * m31 * m44 + m12 * m24 * m33 * m41
        + m13 * m21 * m32 * m44 + m13 * m22 * m34 * m41 + m13 * m24 * m31 * m42
        + m14 * m21 * m33 * m42 + m14 * m22 * m31 * m43 + m14 * m23 * m32 * m41
        - m11 * m22 * m34 * m43 - m11 * m23 * m32 * m44 - m11 * m24 * m33 * m42
        - m12 * m21 * m33 * m44 - m12 * m23 * m34 * m41 - m12 * m24 * m31 * m43
        - m13 * m21 * m34 * m42 - m13 * m22 * m31 * m44 - m13 * m24 * m32 * m41
        - m14 * m21 * m32 * m43 - m14 * m22 * m33 * m41 - m14 * m23 * m31 * m42
    );
}

inverse() {
    let m = this.m;
    const detInv = 1 / this.det();

    const m11 = m[ 0], m12 = m[ 1], m13 = m[ 2], m14 = m[ 3];
    const m21 = m[ 4], m22 = m[ 5], m23 = m[ 6], m24 = m[ 7];
    const m31 = m[ 8], m32 = m[ 9], m33 = m[10], m34 = m[11];
    const m41 = m[12], m42 = m[13], m43 = m[14], m44 = m[15];

    m[ 0] = (m22 * m33 * m44 + m23 * m34 * m42 + m24 * m32 * m43 - m22 * m34 * m43 - m23 * m32 * m44 - m24 * m33 * m42) * detInv;
    m[ 1] = (m12 * m34 * m43 + m13 * m32 * m44 + m14 * m33 * m42 - m12 * m33 * m44 - m13 * m34 * m42 - m14 * m32 * m43) * detInv;
    m[ 2] = (m12 * m23 * m44 + m13 * m24 * m42 + m14 * m22 * m43 - m12 * m24 * m43 - m13 * m22 * m44 - m14 * m23 * m42) * detInv;
    m[ 3] = (m12 * m24 * m33 + m13 * m22 * m34 + m14 * m23 * m32 - m12 * m23 * m34 - m13 * m24 * m32 - m14 * m22 * m33) * detInv;

    m[ 4] = (m21 * m34 * m43 + m23 * m31 * m44 + m24 * m33 * m41 - m21 * m33 * m44 - m23 * m34 * m41 - m24 * m31 * m43) * detInv;
    m[ 5] = (m11 * m33 * m44 + m13 * m34 * m41 + m14 * m31 * m43 - m11 * m34 * m43 - m13 * m31 * m44 - m14 * m33 * m41) * detInv;
    m[ 6] = (m11 * m24 * m43 + m13 * m21 * m44 + m14 * m23 * m41 - m11 * m23 * m44 - m13 * m24 * m41 - m14 * m21 * m43) * detInv;
    m[ 7] = (m11 * m23 * m34 + m13 * m24 * m31 + m14 * m21 * m33 - m11 * m24 * m33 - m13 * m21 * m34 - m14 * m23 * m31) * detInv;

    m[ 8] = (m21 * m32 * m44 + m22 * m34 * m41 + m24 * m31 * m42 - m21 * m34 * m42 - m22 * m31 * m44 - m24 * m32 * m41) * detInv;
    m[ 9] = (m11 * m34 * m42 + m12 * m31 * m44 + m14 * m32 * m41 - m11 * m32 * m44 - m12 * m34 * m41 - m14 * m31 * m42) * detInv;
    m[10] = (m11 * m22 * m44 + m12 * m24 * m41 + m14 * m21 * m42 - m11 * m24 * m42 - m12 * m21 * m44 - m14 * m22 * m41) * detInv;
    m[11] = (m11 * m24 * m32 + m12 * m21 * m34 + m14 * m22 * m31 - m11 * m22 * m34 - m12 * m24 * m31 - m14 * m21 * m32) * detInv;

    m[12] = (m21 * m33 * m42 + m22 * m31 * m43 + m23 * m32 * m41 - m21 * m32 * m43 - m22 * m33 * m41 - m23 * m31 * m42) * detInv;
    m[13] = (m11 * m32 * m43 + m12 * m33 * m41 + m13 * m31 * m42 - m11 * m33 * m42 - m12 * m31 * m43 - m13 * m32 * m41) * detInv;
    m[14] = (m11 * m23 * m42 + m12 * m21 * m43 + m13 * m22 * m41 - m11 * m22 * m43 - m12 * m23 * m41 - m13 * m21 * m42) * detInv;
    m[15] = (m11 * m22 * m33 + m12 * m23 * m31 + m13 * m21 * m32 - m11 * m23 * m32 - m12 * m21 * m33 - m13 * m22 * m31) * detInv;

    return this;
}

transform(v) {
    const x = v.x;
    const y = v.y;
    const z = v.z;
    const w = v.w;

    let m = this.m;
    const m11 = m[ 0], m12 = m[ 1], m13 = m[ 2], m14 = m[ 3];
    const m21 = m[ 4], m22 = m[ 5], m23 = m[ 6], m24 = m[ 7];
    const m31 = m[ 8], m32 = m[ 9], m33 = m[10], m34 = m[11];
    const m41 = m[12], m42 = m[13], m43 = m[14], m44 = m[15];

    v.x = m11 * x + m12 * y + m13 * z + m14 * w;
    v.y = m21 * x + m22 * y + m23 * z + m24 * w;
    v.z = m31 * x + m32 * y + m33 * z + m34 * w;
    v.w = m41 * x + m42 * y + m43 * z + m44 * w;

    return v;
}

print() {
    let m = this.m;
    console.log(
        '[ ' + m[ 0] + ', ' + m[ 1] + ', ' + m[ 2] + ', ' + m[ 3] + ' ]\n' +
        '[ ' + m[ 4] + ', ' + m[ 5] + ', ' + m[ 6] + ', ' + m[ 7] + ' ]\n' +
        '[ ' + m[ 8] + ', ' + m[ 9] + ', ' + m[10] + ', ' + m[11] + ' ]\n' +
        '[ ' + m[12] + ', ' + m[13] + ', ' + m[14] + ', ' + m[15] + ' ]\n'
    );
}

fromFrustum(left, right, bottom, top, near, far) {
    let m = this.m;

    m[ 0] = 2 * near / (right - left);
    m[ 5] = 2 * near / (top - bottom);

    m[ 2] = (right + left) / (right - left);
    m[ 6] = (top + bottom) / (top - bottom);
    m[10] = -(far + near) / (far - near);

    m[11] = -2 * far * near / (far - near);
    m[14] = -1;

    m[1] = m[3] = m[4] = m[7] = m[8] = m[9] = m[12] = m[13] = m[15] = 0;

    return this;
}

fromTranslation(x, y, z) {
    this.identity();

    let m = this.m;
    m[ 3] = x;
    m[ 7] = y;
    m[11] = z;

    return this;
}

fromRotationX(angle) {
    this.identity();

    const s = Math.sin(angle);
    const c = Math.cos(angle);

    let m = this.m;
    m[ 5] = c;
    m[ 6] = s;
    m[ 9] = -s;
    m[10] = c;

    return this;
}

fromRotationY(angle) {
    this.identity();

    const s = Math.sin(angle);
    const c = Math.cos(angle);

    let m = this.m;
    m[ 0] = c;
    m[ 2] = -s;
    m[ 8] = s;
    m[10] = c;

    return this;
}

fromRotationZ(angle) {
    this.identity();

    const s = Math.sin(angle);
    const c = Math.cos(angle);

    let m = this.m;
    m[ 0] = c;
    m[ 1] = s;
    m[ 4] = -s;
    m[ 5] = c;

    return this;
}

fromScale(x, y, z) {
    this.identity();

    let m = this.m;
    m[ 0] = x;
    m[ 5] = y;
    m[10] = z;

    return this;
}

fromAxisAngle(x, y, z, w) {
    new Quaternion(x, y, z, w).fromAxisAngle().toRotationMatrix(this.m);
    return this;
}

}
class Vector {

constructor(x, y, z, w) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.w = (w !== undefined) ? w : 1;
}

clone() {
    return new Vector(this.x, this.y, this.z, this.w);
}

copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    this.w = v.w;
    return this;
}

set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
}

add(a, b) {
    if (!b) {
        b = this;
    }

    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    this.w = a.w + b.w;

    return this;
}

sub(a, b) {
    if (!b) {
        b = this;
    }

    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    this.w = a.w - b.w;

    return this;
}

mul(a, b) {
    if (!b) {
        b = this;
    }

    this.x = a.x * b.x;
    this.y = a.y * b.y;
    this.z = a.z * b.z;
    this.w = a.w * b.w;

    return this;
}

normalize() {
    const len = this.len();

    this.x /= len;
    this.y /= len;
    this.z /= len;

    return this;
}

homogenize() {
    this.x /= this.w;
    this.y /= this.w;
    this.z /= this.w;
    this.w /= this.w;

    return this;
}

setLength(len) {
    this.normalize();

    this.x *= len;
    this.y *= len;
    this.z *= len;

    return this;
}

dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
}

cross(a, b) {
    const ax = a.x, ay = a.y, az = a.z;
    const bx = b.x, by = b.y, bz = b.z;

    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    this.w = 1;

    return this;
}

lensq() {
    return this.dot(this);
}

len() {
    return Math.sqrt(this.lensq());
}

}
const Ticker = (() => {

let queue = [];

(function tick() {
    queue.forEach(f => f());
    requestAnimationFrame(tick);
})();

function add(f) {
    if (!queue.includes(f)) {
        queue.push(f);
    }
}

function remove(f) {
    const idx = queue.indexOf(f);
    if (idx >= 0) {
        queue.splice(idx, 1);
    }
}

return { add, remove };

})();
// #link math

class Camera {

constructor(options) {
    Object.assign(this, {
        fovX       : 1,
        fovY       : 1,
        near       : 0.1,
        far        : 5,
        zoomFactor : 0.001
    }, options);

    this.position = new Vector();
    this.rotation = new Quaternion();
    this.viewMatrix = new Matrix();
    this.projectionMatrix = new Matrix();
    this.transformationMatrix = new Matrix();
    this.isDirty = false;
}

updateViewMatrix() {
    this.rotation.toRotationMatrix(this.viewMatrix.m);
    this.viewMatrix.m[ 3] = this.position.x;
    this.viewMatrix.m[ 7] = this.position.y;
    this.viewMatrix.m[11] = this.position.z;
    this.viewMatrix.inverse();
}

updateProjectionMatrix() {
    const w = this.fovX * this.near;
    const h = this.fovY * this.near;
    this.projectionMatrix.fromFrustum(-w, w, -h, h, this.near, this.far);
}

updateMatrices() {
    this.updateViewMatrix();
    this.updateProjectionMatrix();
    this.transformationMatrix.multiply(this.projectionMatrix, this.viewMatrix);
}

resize(width, height) {
    this.fovX = width * this.zoomFactor;
    this.fovY = height * this.zoomFactor;
    this.isDirty = true;
}

zoom(amount) {
    const scale = Math.exp(amount);
    this.zoomFactor *= scale;
    this.fovX *= scale;
    this.fovY *= scale;
    this.isDirty = true;
}

}
// #link math
// #link Ticker

class OrbitCameraController {

constructor(camera, domElement, options) {
    this._update = this._update.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseWheel = this._handleMouseWheel.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);

    Object.assign(this, {
        rotationSpeed    : 2,
        translationSpeed : 2,
        moveSpeed        : 0.001,
        zoomSpeed        : 0.001
    }, options);

    this._camera = camera;
    this._domElement = domElement;

    this._focus = this._camera.position.len();

    this._forward = false;
    this._backward = false;
    this._left = false;
    this._right = false;

    this._isTranslating = false;
    this._isRotating = false;

    this._time = Date.now();

    this._addEventListeners();
    Ticker.add(this._update);
}

_addEventListeners() {
    this._domElement.addEventListener('mousedown', this._handleMouseDown);
    this._domElement.addEventListener('touchstart', this._handleMouseDown);
    document.addEventListener('mouseup', this._handleMouseUp);
    document.addEventListener('touchend', this._handleMouseUp);
    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('touchmove', this._handleMouseMove);
    this._domElement.addEventListener('mousewheel', this._handleMouseWheel);
    document.addEventListener('keydown', this._handleKeyDown);
    document.addEventListener('keyup', this._handleKeyUp);
}

_handleMouseDown(e) {
    e.preventDefault();
    if (typeof e.touches === 'object') {
        this._startX = e.touches[0].pageX;
        this._startY = e.touches[0].pageY;
        this._isRotating = true;
    } else if (e.button === 0) {
        this._startX = e.pageX;
        this._startY = e.pageY;
        this._isRotating = true;
    } else if (e.button === 1) {
        this._startX = e.pageX;
        this._startY = e.pageY;
        this._isTranslating = true;
    }
}

_handleMouseUp(e) {
    e.preventDefault();
    this._isTranslating = false;
    this._isRotating = false;
}

_handleMouseMove(e) {
    e.preventDefault();

    const x = typeof e.pageX !== 'undefined' ? e.pageX : e.touches[0].pageX;
    const y = typeof e.pageY !== 'undefined' ? e.pageY : e.touches[0].pageY;
    const dx = x - this._startX;
    const dy = y - this._startY;

    if (this._isRotating) {
        const angleX = dx * this.rotationSpeed * this._focus * this._camera.zoomFactor;
        const angleY = dy * this.rotationSpeed * this._focus * this._camera.zoomFactor;

        if (e.shiftKey) {
            this._rotateAroundSelf(angleX, angleY);
        } else {
            this._rotateAroundFocus(angleX, angleY);
        }
    }

    if (this._isTranslating) {
        const speedFactor = this.translationSpeed * this._focus * this._camera.zoomFactor;
        this._move(-dx * speedFactor, dy * speedFactor, 0);
    }

    this._startX = x;
    this._startY = y;
}

_handleMouseWheel(e) {
    e.preventDefault();
    const amount = e.deltaY * this.zoomSpeed;
    const keepScale = e.shiftKey;
    this._zoom(amount, keepScale);
}

_handleKeyDown(e) {
    switch (e.key.toLowerCase()) {
        case 'w': this._forward  = true; break;
        case 'a': this._left     = true; break;
        case 's': this._backward = true; break;
        case 'd': this._right    = true; break;
    }
}

_handleKeyUp(e) {
    switch (e.key.toLowerCase()) {
        case 'w': this._forward  = false; break;
        case 'a': this._left     = false; break;
        case 's': this._backward = false; break;
        case 'd': this._right    = false; break;
    }
}

_rotateAroundFocus(dx, dy) {
    const angle = Math.sqrt(dx * dx + dy * dy);
    const rotation = new Quaternion(dy / angle, dx / angle, 0, angle);
    rotation.fromAxisAngle();

    // get focus point
    // TODO: refactor this and positioning
    const cp = this._camera.position.clone();
    const cr = this._camera.rotation.clone();
    const f = new Quaternion(0, 0, -this._focus, 0);
    f.multiply(f, cr);
    f.multiply(cr.inverse(), f);

    // rotate camera around self
    this._camera.rotation.multiply(rotation, this._camera.rotation);
    this._camera.rotation.normalize();

    // position camera around focus
    // TODO: find out how this works
    const positionQuat = new Quaternion(0, 0, this._focus, 0);
    positionQuat.multiply(positionQuat, this._camera.rotation);
    positionQuat.multiply(this._camera.rotation.clone().inverse(), positionQuat);
    this._camera.position.set(positionQuat.x, positionQuat.y, positionQuat.z, 1);
    this._camera.position.add(new Vector(cp.x + f.x, cp.y + f.y, cp.z + f.z, 0));

    this._camera.isDirty = true;
}

_rotateAroundSelf(dx, dy) {
    const angle = Math.sqrt(dx * dx + dy * dy);
    const rotation = new Quaternion(dy / angle, dx / angle, 0, angle);
    rotation.fromAxisAngle();

    this._camera.rotation.multiply(rotation, this._camera.rotation);
    this._camera.rotation.normalize();

    this._camera.isDirty = true;
}

_move(dx, dy, dz) {
    const v = new Quaternion(dx, dy, dz, 0);
    const r = this._camera.rotation.clone();
    v.multiply(v, r);
    v.multiply(r.inverse(), v);
    this._camera.position.add(v);
    this._camera.isDirty = true;
}

_zoom(amount, keepScale) {
    this._camera.zoom(amount);
    if (keepScale) {
        const scale = Math.exp(-amount);
        this._camera.position.mul(new Vector(scale, scale, scale, 1));
        this._focus *= scale;
    }
    this._camera.isDirty = true;
}

_update() {
    const t = Date.now();
    const dt = t - this._time;
    this._time = t;

    let dx = 0;
    let dz = 0;

    if (this._forward) {
        dz -= this.moveSpeed * this._focus * dt;
    }
    if (this._backward) {
        dz += this.moveSpeed * this._focus * dt;
    }
    if (this._left) {
        dx -= this.moveSpeed * this._focus * dt;
    }
    if (this._right) {
        dx += this.moveSpeed * this._focus * dt;
    }

    if (dx !== 0 || dz !== 0) {
        this._move(dx, 0, dz);
    }
}

}
// #link WebGL

class Volume {

constructor(gl, reader, options) {
    Object.assign(this, {
        ready: false
    }, options);

    this._gl = gl;
    this._reader = reader;

    this.meta       = null;
    this.modalities = null;
    this.blocks     = null;
    this._texture   = null;
}

destroy() {
    const gl = this._gl;
    if (this._texture) {
        gl.deleteTexture(this._texture);
    }
}

readMetadata(handlers) {
    if (!this._reader) {
        return;
    }
    this.ready = false;
    this._reader.readMetadata({
        onData: data => {
            this.meta = data.meta;
            this.modalities = data.modalities;
            this.blocks = data.blocks;
            handlers.onData && handlers.onData();
        }
    });
}

readModality(modalityName, handlers) {
    if (!this._reader || !this.modalities) {
        return;
    }
    this.ready = false;
    const modality = this.modalities.find(modality => modality.name === modalityName);
    if (!modality) {
        return;
    }
    const dimensions = modality.dimensions;
    const components = modality.components;
    const blocks = this.blocks;

    const gl = this._gl;
    if (this._texture) {
        gl.deleteTexture(this._texture);
    }
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this._texture);

    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texStorage3D(gl.TEXTURE_3D, 1, modality.internalFormat,
        dimensions.width, dimensions.height, dimensions.depth);
    let remainingBlocks = modality.placements.length;
    modality.placements.forEach(placement => {
        this._reader.readBlock(placement.index, {
            onData: data => {
                const position = placement.position;
                const block = blocks[placement.index];
                const blockdim = block.dimensions;
                gl.bindTexture(gl.TEXTURE_3D, this._texture);
                gl.texSubImage3D(gl.TEXTURE_3D, 0,
                    position.x, position.y, position.z,
                    blockdim.width, blockdim.height, blockdim.depth,
                    modality.format, modality.type, this._typize(data, modality.type));
                remainingBlocks--;
                if (remainingBlocks === 0) {
                    this.ready = true;
                    handlers.onLoad && handlers.onLoad();
                }
            }
        });
    });
}

_typize(data, type) {
    const gl = this._gl;
    switch (type) {
        case gl.BYTE:                         return new Int8Array(data);
        case gl.UNSIGNED_BYTE:                return new Uint8Array(data);
        case gl.UNSIGNED_BYTE:                return new Uint8ClampedArray(data);
        case gl.SHORT:                        return new Int16Array(data);
        case gl.UNSIGNED_SHORT:               return new Uint16Array(data);
        case gl.UNSIGNED_SHORT_5_6_5:         return new Uint16Array(data);
        case gl.UNSIGNED_SHORT_5_5_5_1:       return new Uint16Array(data);
        case gl.UNSIGNED_SHORT_4_4_4_4:       return new Uint16Array(data);
        case gl.INT:                          return new Int32Array(data);
        case gl.UNSIGNED_INT:                 return new Uint32Array(data);
        case gl.UNSIGNED_INT_5_9_9_9_REV:     return new Uint32Array(data);
        case gl.UNSIGNED_INT_2_10_10_10_REV:  return new Uint32Array(data);
        case gl.UNSIGNED_INT_10F_11F_11F_REV: return new Uint32Array(data);
        case gl.UNSIGNED_INT_24_8:            return new Uint32Array(data);
        case gl.HALF_FLOAT:                   return new Uint16Array(data);
        case gl.FLOAT:                        return new Float32Array(data);
        default: throw new Error('Unknown volume datatype: ' + type);
    }
}

getTexture() {
    if (this.ready) {
        return this._texture;
    } else {
        return null;
    }
}

setFilter(filter) {
    if (!this._texture) {
        return;
    }

    const gl = this._gl;
    filter = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_3D, this._texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
}

}
// #link WebGL

class SingleBuffer {

constructor(gl, spec) {
    this._gl = gl;
    this._spec = spec;

    this._attachments = this._createAttachmentsFromSpec(gl, this._spec);
    this._framebuffer = WebGL.createFramebuffer(gl, this._attachments);

    this._width = this._spec[0].width;
    this._height = this._spec[0].height;
}

destroy() {
    const gl = this._gl;
    gl.deleteFramebuffer(this._framebuffer);
    for (let texture of this._attachments.color) {
        gl.deleteTexture(texture);
    }
}

_createAttachmentsFromSpec(gl, spec) {
    return { color: spec.map(s => WebGL.createTexture(gl, s)) };
}

use() {
    const gl = this._gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);
    gl.viewport(0, 0, this._width, this._height);
}

getAttachments() {
    return this._attachments;
}

}
// #link WebGL

class DoubleBuffer {

constructor(gl, spec) {
    this._gl = gl;
    this._spec = spec;

    this._readAttachments = this._createAttachmentsFromSpec(gl, this._spec);
    this._readFramebuffer = WebGL.createFramebuffer(gl, this._readAttachments);
    this._writeAttachments = this._createAttachmentsFromSpec(gl, this._spec);
    this._writeFramebuffer = WebGL.createFramebuffer(gl, this._writeAttachments);

    this._width = this._spec[0].width;
    this._height = this._spec[0].height;
}

destroy() {
    const gl = this._gl;
    gl.deleteFramebuffer(this._readFramebuffer);
    for (let texture of this._readAttachments.color) {
        gl.deleteTexture(texture);
    }
    gl.deleteFramebuffer(this._writeFramebuffer);
    for (let texture of this._writeAttachments.color) {
        gl.deleteTexture(texture);
    }
}

_createAttachmentsFromSpec(gl, spec) {
    return { color: spec.map(s => WebGL.createTexture(gl, s)) };
}

use() {
    const gl = this._gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._writeFramebuffer);
    gl.viewport(0, 0, this._width, this._height);
}

swap() {
    let tmp = this._readFramebuffer;
    this._readFramebuffer = this._writeFramebuffer;
    this._writeFramebuffer = tmp;

    tmp = this._readAttachments;
    this._readAttachments = this._writeAttachments;
    this._writeAttachments = tmp;
}

getAttachments() {
    return this._readAttachments;
}

getReadAttachments() {
    return this._readAttachments;
}

getWriteAttachments() {
    return this._writeAttachments;
}

}
// #link ../math
// #link ../WebGL
// #link ../SingleBuffer
// #link ../DoubleBuffer

class AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    Object.assign(this, {
        _bufferSize : 512
    }, options);

    this._gl = gl;
    this._volume = volume;
    this._environmentTexture = environmentTexture;

    this._rebuildBuffers();

    this._transferFunction = WebGL.createTexture(gl, {
        width  : 2,
        height : 1,
        data   : new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),
        wrapS  : gl.CLAMP_TO_EDGE,
        wrapT  : gl.CLAMP_TO_EDGE,
        min    : gl.LINEAR,
        mag    : gl.LINEAR
    });

    this.modelMatrix = new Matrix();
    this.viewMatrix = new Matrix();
    this.projectionMatrix = new Matrix();

    this._clipQuad = WebGL.createClipQuad(gl);
    this._clipQuadProgram = WebGL.buildPrograms(gl, {
        quad: SHADERS.quad
    }).quad;
}

destroy() {
    const gl = this._gl;
    this._frameBuffer.destroy();
    this._accumulationBuffer.destroy();
    this._renderBuffer.destroy();
    gl.deleteTexture(this._transferFunction);
    gl.deleteBuffer(this._clipQuad);
    gl.deleteProgram(this._clipQuadProgram.program);
}

render() {
    // TODO: put the following logic in VAO
    const gl = this._gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    gl.enableVertexAttribArray(0); // position always bound to attribute 0
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this._frameBuffer.use();
    this._generateFrame();

    this._accumulationBuffer.use();
    this._integrateFrame();
    this._accumulationBuffer.swap();

    this._renderBuffer.use();
    this._renderFrame();
}

reset() {
    // TODO: put the following logic in VAO
    const gl = this._gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    gl.enableVertexAttribArray(0); // position always bound to attribute 0
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this._accumulationBuffer.use();
    this._resetFrame();
    this._accumulationBuffer.swap();
}

_rebuildBuffers() {
    if (this._frameBuffer) {
        this._frameBuffer.destroy();
    }
    if (this._accumulationBuffer) {
        this._accumulationBuffer.destroy();
    }
    if (this._renderBuffer) {
        this._renderBuffer.destroy();
    }
    const gl = this._gl;
    this._frameBuffer = new SingleBuffer(gl, this._getFrameBufferSpec());
    this._accumulationBuffer = new DoubleBuffer(gl, this._getAccumulationBufferSpec());
    this._renderBuffer = new SingleBuffer(gl, this._getRenderBufferSpec());
}

setVolume(volume) {
    this._volume = volume;
    this.reset();
}

setTransferFunction(transferFunction) {
    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    gl.texImage2D(gl.TEXTURE_2D, 0,
        gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, transferFunction);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

setResolution(resolution) {
    if (resolution !== this._bufferSize) {
        this._bufferSize = resolution;
        this._rebuildBuffers();
        this.reset();
    }
}

calculateMVPInverseTranspose() {
    const mvpit = new Matrix();
    mvpit.multiply(this.viewMatrix, this.modelMatrix);
    mvpit.multiply(this.projectionMatrix, mvpit);
    return mvpit.inverse().transpose();
}

getTexture() {
    return this._renderBuffer.getAttachments().color[0];
}

_resetFrame() {
    // IMPLEMENT
}

_generateFrame() {
    // IMPLEMENT
}

_integrateFrame() {
    // IMPLEMENT
}

_renderFrame() {
    // IMPLEMENT
}

_getFrameBufferSpec() {
    // IMPLEMENT
}

_getAccumulationBufferSpec() {
    // IMPLEMENT
}

_getRenderBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        wrapS          : gl.CLAMP_TO_EDGE,
        wrapT          : gl.CLAMP_TO_EDGE,
        format         : gl.RGBA,
        internalFormat : gl.RGBA16F,
        type           : gl.FLOAT
    }];
}

}
// #link ../math
// #link ../WebGL
// #link AbstractRenderer

class DOSRenderer extends AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    super(gl, volume, environmentTexture, options);

    Object.assign(this, {
        steps      : 50,
        slices     : 200,
        extinction : 100,
        aperture   : 30,
        samples    : 8,
        _depth     : 0,
        _minDepth  : 0,
        _maxDepth  : 0,
    }, options);

    this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.DOS, MIXINS);

    this.generateOcclusionSamples();
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });

    super.destroy();
}

generateOcclusionSamples() {
    const data = new Float32Array(this.samples * 2);
    let averagex = 0;
    let averagey = 0;
    for (let i = 0; i < this.samples; i++) {
        const r = Math.sqrt(Math.random());
        const phi = Math.random() * 2 * Math.PI;
        const x = r * Math.cos(phi);
        const y = r * Math.sin(phi);
        averagex += x / this.samples;
        averagey += y / this.samples;
        data[2 * i + 0] = x;
        data[2 * i + 1] = y;
    }
    for (let i = 0; i < this.samples; i++) {
        data[2 * i + 0] -= averagex;
        data[2 * i + 1] -= averagey;
    }

    const gl = this._gl;
    this._occlusionSamples = WebGL.createTexture(gl, {
        texture        : this._occlusionSamples,
        width          : this.samples,
        height         : 1,
        format         : gl.RG,
        internalFormat : gl.RG32F,
        type           : gl.FLOAT,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        wrapS          : gl.CLAMP_TO_EDGE,
        wrapT          : gl.CLAMP_TO_EDGE,
        data           : data,
    });
}

calculateDepth() {
    const mvMatrix = new Matrix();
    mvMatrix.multiply(this.viewMatrix, this.modelMatrix);

    const corners = [
        new Vector(0, 0, 0),
        new Vector(0, 0, 1),
        new Vector(0, 1, 0),
        new Vector(0, 1, 1),
        new Vector(1, 0, 0),
        new Vector(1, 0, 1),
        new Vector(1, 1, 0),
        new Vector(1, 1, 1),
    ];
    const depths = corners.map(v => -mvMatrix.transform(v).homogenize().z);
    return [Math.min(...depths), Math.max(...depths)];
}

_resetFrame() {
    const gl = this._gl;

    [this._minDepth, this._maxDepth] = this.calculateDepth();
    this._minDepth = Math.max(this._minDepth, 0);
    this._depth = this._minDepth;

    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1
    ]);

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_integrateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.integrate;
    gl.useProgram(program);

    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1
    ]);

    gl.activeTexture(gl.TEXTURE2);
    gl.uniform1i(uniforms.uVolume, 2);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());

    gl.activeTexture(gl.TEXTURE3);
    gl.uniform1i(uniforms.uTransferFunction, 3);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    gl.activeTexture(gl.TEXTURE4);
    gl.uniform1i(uniforms.uOcclusionSamples, 4);
    gl.bindTexture(gl.TEXTURE_2D, this._occlusionSamples);

    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);
    // TODO: bias occlusion samples for "directional" light
    gl.uniform1ui(uniforms.uOcclusionSamplesCount, this.samples);
    gl.uniform1f(uniforms.uExtinction, this.extinction);

    const sliceDistance = (this._maxDepth - this._minDepth) / this.slices;
    gl.uniform1f(uniforms.uSliceDistance, sliceDistance);
    for (let step = 0; step < this.steps; step++) {
        if (this._depth > this._maxDepth) {
            break;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(uniforms.uColor, 0);
        gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

        gl.activeTexture(gl.TEXTURE1);
        gl.uniform1i(uniforms.uOcclusion, 1);
        gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[1]);

        const occlusionExtent = sliceDistance * Math.tan(this.aperture * Math.PI / 180);
        const correction = new Vector(1, 1, -this._depth, 1);
        this.projectionMatrix.transform(correction);
        correction.homogenize();
        correction.x *= occlusionExtent;
        correction.y *= occlusionExtent;

        gl.uniform2f(uniforms.uOcclusionScale, correction.x, correction.y);
        gl.uniform1f(uniforms.uDepth, correction.z);

        this._accumulationBuffer.use();
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
        this._accumulationBuffer.swap();

        this._depth += sliceDistance;
    }

    // Swap again to undo the last swap by AbstractRenderer
    this._accumulationBuffer.swap();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT
    }];
}

_getAccumulationBufferSpec() {
    const gl = this._gl;

    const colorBuffer = {
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT
    };

    const occlusionBuffer = {
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.LINEAR,
        mag            : gl.LINEAR,
        format         : gl.RED,
        internalFormat : gl.R32F,
        type           : gl.FLOAT
    };

    return [
        colorBuffer,
        occlusionBuffer
    ];
}

}
// #link ../WebGL
// #link AbstractRenderer

class EAMRenderer extends AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    super(gl, volume, environmentTexture, options);

    Object.assign(this, {
        extinction : 100,
        slices     : 64,
        steps      : 64,
    }, options);

    this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.EAM, MIXINS);
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });

    super.destroy();
}

_resetFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_generateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.generate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    gl.uniform1i(uniforms.uVolume, 0);
    gl.uniform1i(uniforms.uTransferFunction, 1);
    gl.uniform1f(uniforms.uStepSize, 1 / this.slices);
    gl.uniform1f(uniforms.uExtinction, this.extinction);
    gl.uniform1f(uniforms.uOffset, Math.random());
    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_integrateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.integrate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);
    gl.uniform1i(uniforms.uFrame, 1);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA,
        type           : gl.UNSIGNED_BYTE
    }];
}

_getAccumulationBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA,
        type           : gl.UNSIGNED_BYTE
    }];
}

}
// #link ../WebGL
// #link AbstractRenderer

class ISORenderer extends AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    super(gl, volume, environmentTexture, options);

    Object.assign(this, {
        _stepSize : 0.05,
        _isovalue : 0.4,
        _light    : [0.5, 0.5, 0.5],
        _diffuse  : [0.7, 0.8, 0.9]
    }, options);

    this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.ISO, MIXINS);
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });

    super.destroy();
}

_resetFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_generateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.generate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());

    gl.uniform1i(uniforms.uClosest, 0);
    gl.uniform1i(uniforms.uVolume, 1);
    gl.uniform1f(uniforms.uStepSize, this._stepSize);
    gl.uniform1f(uniforms.uOffset, Math.random());
    gl.uniform1f(uniforms.uIsovalue, this._isovalue);
    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_integrateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.integrate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);
    gl.uniform1i(uniforms.uFrame, 1);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());

    gl.uniform1i(uniforms.uClosest, 0);
    gl.uniform1i(uniforms.uVolume, 1);
    gl.uniform3fv(uniforms.uLight, this._light);
    gl.uniform3fv(uniforms.uDiffuse, this._diffuse);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA16F,
        type           : gl.FLOAT
    }];
}

_getAccumulationBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA16F,
        type           : gl.FLOAT
    }];
}

}
// #link ../WebGL

// MCC: Monte Carlo Compute renderer
class MCCRenderer {

constructor(gl, volume, environmentTexture, options) {
    Object.assign(this, {
        absorptionCoefficient : 1,
        scatteringCoefficient : 1,
        scatteringBias        : 0,
        majorant              : 2,
        maxBounces            : 8,
        steps                 : 1,
        _resolution           : 512,
        _workgroup            : 8
    }, options);

    this._gl = gl;
    this._volume = volume;
    this._envmap = environmentTexture;

    this.modelMatrix = new Matrix();
    this.viewMatrix = new Matrix();
    this.projectionMatrix = new Matrix();

    this.init();
}

_init() {
    const gl = this._gl;

    this._programs = WebGL.buildPrograms(gl, SHADERS.renderers.MCC, MIXINS);

    this._transferFunction = WebGL.createTexture(gl, {
        width  : 2,
        height : 1,
        data   : new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),
        wrapS  : gl.CLAMP_TO_EDGE,
        wrapT  : gl.CLAMP_TO_EDGE,
        min    : gl.LINEAR,
        mag    : gl.LINEAR
    });

    this._renderBuffer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._renderBuffer);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, this._resolution, this._resolution);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // struct Photon {     //
    //     vec3 position;  // 4 * 4B
    //     vec3 direction; // 4 * 4B
    //     vec3 radiance;  // 4 * 4B
    //     vec3 color;     // 4 * 4B
    //     uint bounces;   // 4B
    //     uint samples;   // 4B
    //          padding    // ??
    // };                  //
    const bufferSize = 20 * 4 * this._resolution * this._resolution;
    this._photonBuffer = gl.createBuffer();
    gl.bindBuffer(gl.SHADER_STORAGE_BUFFER, this._photonBuffer);
    gl.bindBufferBase(gl.SHADER_STORAGE_BUFFER, 0, this._photonBuffer);
    gl.bufferData(gl.SHADER_STORAGE_BUFFER, bufferSize, gl.STATIC_DRAW);
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });
}

getTexture() {
    return this._renderBuffer;
}

setVolume(volume) {
    this._volume = volume;
    this.reset();
}

setTransferFunction(transferFunction) {
    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    gl.texImage2D(gl.TEXTURE_2D, 0,
        gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, transferFunction);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

setResolution(resolution) {
    const gl = this._gl;

    this._resolution = resolution;

    gl.deleteTexture(this._renderBuffer);
    this._renderBuffer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._renderBuffer);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, this._resolution, this._resolution);
}

calculateMVPInverseTranspose() {
    const mvpit = new Matrix();
    mvpit.multiply(this.viewMatrix, this.modelMatrix);
    mvpit.multiply(this.projectionMatrix, mvpit);
    return mvpit.inverse().transpose();
}

reset() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);
    gl.uniform2f(uniforms.uInverseResolution, 1 / this._resolution, 1 / this._resolution);
    gl.uniform1f(uniforms.uRandSeed, Math.random());
    gl.uniform1f(uniforms.uBlur, 0);

    gl.bindBuffer(gl.SHADER_STORAGE_BUFFER, this._photonBuffer);
    gl.bindBufferBase(gl.SHADER_STORAGE_BUFFER, 0, this._photonBuffer);

    gl.bindImageTexture(0, this._renderBuffer, 0, false, 0, gl.WRITE_ONLY, gl.RGBA32F);

    const groups = this._resolution / this._workgroup;
    gl.dispatchCompute(groups, groups, 1);
}

render() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._envmap);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    gl.uniform1i(uniforms.uVolume, 0);
    gl.uniform1i(uniforms.uEnvironment, 1);
    gl.uniform1i(uniforms.uTransferFunction, 2);

    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);
    gl.uniform2f(uniforms.uInverseResolution, 1 / this._resolution, 1 / this._resolution);
    gl.uniform1f(uniforms.uRandSeed, Math.random());
    gl.uniform1f(uniforms.uBlur, 0);

    gl.uniform1f(uniforms.uAbsorptionCoefficient, this.absorptionCoefficient);
    gl.uniform1f(uniforms.uScatteringCoefficient, this.scatteringCoefficient);
    gl.uniform1f(uniforms.uScatteringBias, this.scatteringBias);
    gl.uniform1f(uniforms.uMajorant, this.majorant);
    gl.uniform1ui(uniforms.uMaxBounces, this.maxBounces);
    gl.uniform1ui(uniforms.uSteps, this.steps);

    gl.bindBuffer(gl.SHADER_STORAGE_BUFFER, this._photonBuffer);
    gl.bindBufferBase(gl.SHADER_STORAGE_BUFFER, 0, this._photonBuffer);

    gl.bindImageTexture(0, this._renderBuffer, 0, false, 0, gl.WRITE_ONLY, gl.RGBA32F);

    const groups = this._resolution / this._workgroup;
    gl.dispatchCompute(groups, groups, 1);
}

}
// #link ../WebGL
// #link AbstractRenderer

class MCMRenderer extends AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    super(gl, volume, environmentTexture, options);

    Object.assign(this, {
        absorptionCoefficient : 1,
        scatteringCoefficient : 1,
        scatteringBias        : 0,
        majorant              : 2,
        maxBounces            : 8,
        steps                 : 1
    }, options);

    this._programs = WebGL.buildPrograms(gl, SHADERS.renderers.MCM, MIXINS);
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });

    super.destroy();
}

_resetFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);
    gl.uniform2f(uniforms.uInverseResolution, 1 / this._bufferSize, 1 / this._bufferSize);
    gl.uniform1f(uniforms.uRandSeed, Math.random());
    gl.uniform1f(uniforms.uBlur, 0);

    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2,
        gl.COLOR_ATTACHMENT3
    ]);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_generateFrame() {
}

_integrateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.integrate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[1]);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[2]);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[3]);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this._environmentTexture);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    gl.uniform1i(uniforms.uPosition, 0);
    gl.uniform1i(uniforms.uDirection, 1);
    gl.uniform1i(uniforms.uTransmittance, 2);
    gl.uniform1i(uniforms.uRadiance, 3);

    gl.uniform1i(uniforms.uVolume, 4);
    gl.uniform1i(uniforms.uEnvironment, 5);
    gl.uniform1i(uniforms.uTransferFunction, 6);

    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);
    gl.uniform2f(uniforms.uInverseResolution, 1 / this._bufferSize, 1 / this._bufferSize);
    gl.uniform1f(uniforms.uRandSeed, Math.random());
    gl.uniform1f(uniforms.uBlur, 0);

    gl.uniform1f(uniforms.uAbsorptionCoefficient, this.absorptionCoefficient);
    gl.uniform1f(uniforms.uScatteringCoefficient, this.scatteringCoefficient);
    gl.uniform1f(uniforms.uScatteringBias, this.scatteringBias);
    gl.uniform1f(uniforms.uMajorant, this.majorant);
    gl.uniform1ui(uniforms.uMaxBounces, this.maxBounces);
    gl.uniform1ui(uniforms.uSteps, this.steps);

    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2,
        gl.COLOR_ATTACHMENT3
    ]);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[3]);

    gl.uniform1i(uniforms.uColor, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT
    }];
}

_getAccumulationBufferSpec() {
    const gl = this._gl;

    const positionBufferSpec = {
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT
    };

    const directionBufferSpec = {
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT
    };

    const transmittanceBufferSpec = {
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT
    };

    const radianceBufferSpec = {
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT
    };

    return [
        positionBufferSpec,
        directionBufferSpec,
        transmittanceBufferSpec,
        radianceBufferSpec
    ];
}

}
// #link ../WebGL
// #link AbstractRenderer

class MCSRenderer extends AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    super(gl, volume, environmentTexture, options);

    Object.assign(this, {
        _sigmaMax        : 1,
        _alphaCorrection : 1,
    }, options);

    this._programs = WebGL.buildPrograms(gl, SHADERS.renderers.MCS, MIXINS);

    this._frameNumber = 1;
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });

    super.destroy();
}

_resetFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    this._frameNumber = 1;
}

_generateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.generate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._environmentTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    gl.uniform1i(uniforms.uVolume, 0);
    gl.uniform1i(uniforms.uEnvironment, 1);
    gl.uniform1i(uniforms.uTransferFunction, 2);
    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);
    gl.uniform1f(uniforms.uOffset, Math.random());
    gl.uniform1f(uniforms.uSigmaMax, this._sigmaMax);
    gl.uniform1f(uniforms.uAlphaCorrection, this._alphaCorrection);

    // scattering direction
    let x, y, z, length;
    do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        length = Math.sqrt(x * x + y * y + z * z);
    } while (length > 1);
    x /= length;
    y /= length;
    z /= length;
    gl.uniform3f(uniforms.uScatteringDirection, x, y, z);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_integrateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.integrate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);
    gl.uniform1i(uniforms.uFrame, 1);
    gl.uniform1f(uniforms.uInvFrameNumber, 1 / this._frameNumber);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    this._frameNumber += 1;
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT
    }];
}

_getAccumulationBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT
    }];
}

}
// #link ../WebGL
// #link AbstractRenderer

class MIPRenderer extends AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    super(gl, volume, environmentTexture, options);

    Object.assign(this, {
        steps : 64
    }, options);

    this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.MIP, MIXINS);
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });

    super.destroy();
}

_resetFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_generateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.generate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());

    gl.uniform1i(uniforms.uVolume, 0);
    gl.uniform1f(uniforms.uStepSize, 1 / this.steps);
    gl.uniform1f(uniforms.uOffset, Math.random());

    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_integrateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.integrate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);
    gl.uniform1i(uniforms.uFrame, 1);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RED,
        internalFormat : gl.R8,
        type           : gl.UNSIGNED_BYTE
    }];
}

_getAccumulationBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RED,
        internalFormat : gl.R8,
        type           : gl.UNSIGNED_BYTE
    }];
}

}
class WebGPU {

// static createModule(device, source) {
//     return device.createShaderModule({ code: source });
// }


// static buildPrograms(gl, shaders, mixins) {
//     let cooked = {};
//     Object.keys(shaders).forEach(function(name) {
//         cooked[name] = {};
//         const types = shaders[name];
//         Object.keys(types).forEach(function(type) {
//             cooked[name][type] = types[type].replace(/@([a-zA-Z0-9]+)/g, function(_, mixin) {
//                 return mixins[mixin];
//             });
//         });
//     });

//     let programs = {};
//     Object.keys(cooked).forEach(function(name) {
//         try {
//             const program = cooked[name];
//             if (program.vertex && program.fragment) {
//                 programs[name] = WebGL.createProgram(gl, [
//                     WebGL.createShader(gl, program.vertex, gl.VERTEX_SHADER),
//                     WebGL.createShader(gl, program.fragment, gl.FRAGMENT_SHADER)
//                 ]);
//             } else if (program.compute) {
//                 programs[name] = WebGL.createProgram(gl, [
//                     WebGL.createShader(gl, program.compute, gl.COMPUTE_SHADER)
//                 ]);
//             }
//         } catch (e) {
//             throw new Error('Error compiling ' + name + '\n' + e);
//         }
//     });

//     return programs;
// }

// static createTexture(gl, options) {
//     const target = options.target || gl.TEXTURE_2D;
//     const internalFormat = options.internalFormat || gl.RGBA;
//     const format = options.format || gl.RGBA;
//     const type = options.type || gl.UNSIGNED_BYTE;
//     const texture = options.texture || gl.createTexture();

//     if (options.unit) {
//         gl.activeTexture(gl.TEXTURE0 + options.unit);
//     }
//     gl.bindTexture(target, texture);
//     if (options.image) {
//         gl.texImage2D(target, 0, internalFormat, format, type, options.image);
//     } else { // if options.data == null, just allocate
//         if (target === gl.TEXTURE_3D) {
//             gl.texImage3D(target, 0, internalFormat, options.width, options.height, options.depth, 0, format, type, options.data);
//         } else {
//             gl.texImage2D(target, 0, internalFormat, options.width, options.height, 0, format, type, options.data);
//         }
//     }
//     if (options.wrapS) { gl.texParameteri(target, gl.TEXTURE_WRAP_S, options.wrapS); }
//     if (options.wrapT) { gl.texParameteri(target, gl.TEXTURE_WRAP_T, options.wrapT); }
//     if (options.wrapR) { gl.texParameteri(target, gl.TEXTURE_WRAP_R, options.wrapR); }
//     if (options.min) { gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, options.min); }
//     if (options.mag) { gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, options.mag); }
//     if (options.mip) { gl.generateMipmap(target); }

//     return texture;
// }

// static createFramebuffer(gl, attachments) {
//     function attach(attachmentPoint, object) {
//         if (object instanceof WebGLTexture) {
//             gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, object, 0);
//         } else if (object instanceof WebGLRenderbuffer) {
//             gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachmentPoint, gl.RENDERBUFFER, object);
//         }
//     }

//     const framebuffer = gl.createFramebuffer();
//     gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

//     if (attachments.color) {
//         for (let i = 0; i < attachments.color.length; i++) {
//             attach(gl.COLOR_ATTACHMENT0 + i, attachments.color[i]);
//         }
//     }
//     if (attachments.depth) {
//         attach(gl.DEPTH_ATTACHMENT, attachments.depth);
//     }
//     if (attachments.stencil) {
//         attach(gl.STENCIL_ATTACHMENT, attachments.stencil);
//     }

//     const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
//     if (status !== gl.FRAMEBUFFER_COMPLETE) {
//         throw new Error('Cannot create framebuffer: ' + status);
//     }

//     return framebuffer;
// }

// static createBuffer(gl, options) {
//     const target = options.target || gl.ARRAY_BUFFER;
//     const hint = options.hint || gl.STATIC_DRAW;
//     const buffer = options.buffer || gl.createBuffer();

//     gl.bindBuffer(target, buffer);
//     gl.bufferData(target, options.data, hint);
//     gl.bindBuffer(target, null);

//     return buffer;
// }

// static createUnitQuad(gl) {
//     return WebGL.createBuffer(gl, {
//         data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])
//     });
// }

static createBuffer(device, data, usage) {
    if (!(data instanceof Float32Array))
        throw "Unsupported array type";

    let buffer = device.createBuffer({
        size: ((data.byteLength + 3) & ~3),
        usage: usage,
        mappedAtCreation: true
    });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
}

static createClipQuad(device) {
    return WebGPU.createBuffer(
        device,
        new Float32Array([-1, -1, 1, -1, 1, 1, 1, 1, -1, 1, -1, -1]), // new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
        GPUBufferUsage.VERTEX
    );
}

// https://toji.github.io/webgpu-best-practices/img-textures.html
static webGPUTextureFromImageBitmapOrCanvas(gpuDevice, source, usage) {
    const textureDescriptor = {
        // Unlike in WebGL, the size of our texture must be set at texture creation time.
        // This means we have to wait until the image is loaded to create the texture, since we won't
        // know the size until then.
        size: { width: source.width, height: source.height },
        format: 'rgba8unorm',
        usage: usage
    };
    const texture = gpuDevice.createTexture(textureDescriptor);
  
    gpuDevice.queue.copyExternalImageToTexture({ source }, { texture }, textureDescriptor.size);
  
    return texture;
}

}
// #link ../math
// #link ../WebGPU
// #link ../SingleBuffer
// #link ../DoubleBuffer

class WebGPUAbstractRenderer {

constructor(device, volume, environmentTexture, options) {
    Object.assign(this, {
        _bufferSize : 512
    }, options);

    this._device = device;
    this._volume = volume;
    this._environmentTexture = environmentTexture;

    this._rebuildBuffers();

    // this._transferFunction = WebGL.createTexture(gl, {
    //     width  : 2,
    //     height : 1,
    //     data   : new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),
    //     wrapS  : gl.CLAMP_TO_EDGE,
    //     wrapT  : gl.CLAMP_TO_EDGE,
    //     min    : gl.LINEAR,
    //     mag    : gl.LINEAR
    // });


    const texDesc = {
        size: { width: 2, height: 1 },
        format: "rgba8unorm", // TODO
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC // TODO: Remove DST
               // GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    };
    this._transferFunctionTexture = this._device.createTexture(texDesc);

    // TODO: Cleanup
    let tempTexData = new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 255]);
    let imageData = new ImageData(tempTexData, texDesc.size.width, texDesc.size.height);
    createImageBitmap(imageData).then((imageBitmap) => {
        this._device.queue.copyExternalImageToTexture({ source: imageBitmap }, { texture: this._transferFunctionTexture }, texDesc.size);
    });



    this.modelMatrix = new Matrix();
    this.viewMatrix = new Matrix();
    this.projectionMatrix = new Matrix();

    this._clipQuad = WebGPU.createClipQuad(this._device);

    // this._clipQuad = WebGL.createClipQuad(gl);
    // this._clipQuadProgram = WebGL.buildPrograms(gl, {
    //     quad: SHADERS.quad
    // }).quad;
}

destroy() {
    // const gl = this._gl;
    // this._frameBuffer.destroy();
    // this._accumulationBuffer.destroy();
    // this._renderBuffer.destroy();
    // gl.deleteTexture(this._transferFunction);
    // gl.deleteBuffer(this._clipQuad);
    // gl.deleteProgram(this._clipQuadProgram.program);

    this._transferFunctionTexture.destroy();
}

render() {
    // // TODO: put the following logic in VAO
    // const gl = this._gl;
    // gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    // gl.enableVertexAttribArray(0); // position always bound to attribute 0
    // gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // this._frameBuffer.use();
    // this._generateFrame();

    // this._accumulationBuffer.use();
    // this._integrateFrame();
    // this._accumulationBuffer.swap();

    // this._renderBuffer.use();
    // this._renderFrame();


    this._generateFrame();
}

reset() {
    // // TODO: put the following logic in VAO
    // const gl = this._gl;
    // gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    // gl.enableVertexAttribArray(0); // position always bound to attribute 0
    // gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // this._accumulationBuffer.use();
    // this._resetFrame();
    // this._accumulationBuffer.swap();
}

_rebuildBuffers() {
    // if (this._frameBuffer) {
    //     this._frameBuffer.destroy();
    // }
    // if (this._accumulationBuffer) {
    //     this._accumulationBuffer.destroy();
    // }
    // if (this._renderBuffer) {
    //     this._renderBuffer.destroy();
    // }
    // const gl = this._gl;
    // this._frameBuffer = new SingleBuffer(gl, this._getFrameBufferSpec());
    // this._accumulationBuffer = new DoubleBuffer(gl, this._getAccumulationBufferSpec());
    // this._renderBuffer = new SingleBuffer(gl, this._getRenderBufferSpec());

    if (this._frameBufferTex) {
        this._frameBufferTex.destroy();
        this._frameBufferDepthTex.destroy();
    }

    let fbSpec = this._getFrameBufferSpec()[0];
    this._frameBufferTex = this._device.createTexture({
        size: [fbSpec.width, fbSpec.height, 1],
        format: fbSpec.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC // TODO: Remove DST
    });

    this._frameBufferDepthTex = this._device.createTexture({
        size: [fbSpec.width, fbSpec.height, 1],
        format: "depth24plus-stencil8",
        usage: GPUTextureUsage.RENDER_ATTACHMENT // | GPUTextureUsage.COPY_SRC
    });


    let tempTexData = new Uint8Array(256 * 256 * 4)
    for (let i = 0; i < 256 * 256; ++i) {
        tempTexData[4*i] = 255
        tempTexData[4*i+1] = 0
        tempTexData[4*i+2] = 255
        tempTexData[4*i+3] = 255
    }
    let tempTexBuffer = this._device.createBuffer({
        size: ((tempTexData.byteLength + 3) & ~3),
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true
    });
    new Uint8Array(tempTexBuffer.getMappedRange()).set(tempTexData);
    tempTexBuffer.unmap();
    let ce = this._device.createCommandEncoder({});
    ce.copyBufferToTexture({ buffer: tempTexBuffer, bytesPerRow: 256 * 4 }, {texture: this._frameBufferTex}, { width: 256, height: 256});
    this._device.queue.submit([ce.finish()]);


    // if (!this._frameBufferTex) {
    //     let spec = this._getFrameBufferSpec()[0];
    //     this._frameBufferTex = this._device.createTexture({
    //         size: [spec.width, spec.height, 1],
    //         format: spec.format,
    //         usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC // TODO: Remove DST
    //     });

    //     this._frameBufferDepthTex = this._device.createTexture({
    //         size: [spec.width, spec.height, 1],
    //         format: "depth24plus-stencil8",
    //         usage: GPUTextureUsage.RENDER_ATTACHMENT // | GPUTextureUsage.COPY_SRC
    //     });


    //     let tempTexData = new Uint8Array(256 * 256 * 4)
    //     for (let i = 0; i < 256 * 256; ++i) {
    //         tempTexData[4*i] = 255
    //         tempTexData[4*i+1] = 0
    //         tempTexData[4*i+2] = 255
    //         tempTexData[4*i+3] = 255
    //     }
    //     let tempTexBuffer = this._device.createBuffer({
    //         size: ((tempTexData.byteLength + 3) & ~3),
    //         usage: GPUBufferUsage.COPY_SRC,
    //         mappedAtCreation: true
    //     });
    //     new Uint8Array(tempTexBuffer.getMappedRange()).set(tempTexData);
    //     tempTexBuffer.unmap();
    //     let ce = this._device.createCommandEncoder({});
    //     ce.copyBufferToTexture({ buffer: tempTexBuffer, bytesPerRow: 256 * 4 }, {texture: this._frameBufferTex}, { width: 256, height: 256});
    //     this._device.queue.submit([ce.finish()]);
    // }
}

setVolume(volume) {
    this._volume = volume;
    this.reset();
}

setTransferFunction(transferFunction) {
    // const gl = this._gl;
    // gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    // gl.texImage2D(gl.TEXTURE_2D, 0,
    //     gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, transferFunction);
    // gl.bindTexture(gl.TEXTURE_2D, null);

    if (this._transferFunctionTexture) {
        this._transferFunctionTexture.destroy();
    }
    this._transferFunctionTexture = WebGPU.webGPUTextureFromImageBitmapOrCanvas(
        this._device,
        transferFunction,
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC // TODO: Remove DST
    );
}

setResolution(resolution) {
    if (resolution !== this._bufferSize) {
        this._bufferSize = resolution;
        this._rebuildBuffers();
        this.reset();
    }
}

calculateMVPInverseTranspose() {
    const mvpit = new Matrix();
    mvpit.multiply(this.viewMatrix, this.modelMatrix);
    mvpit.multiply(this.projectionMatrix, mvpit);
    return mvpit.inverse().transpose();
}

getTexture() {
    // return this._renderBuffer.getAttachments().color[0];
    return this._frameBufferTex;
    // return this._transferFunctionTexture;
}

_resetFrame() {
    // IMPLEMENT
}

_generateFrame() {
    // IMPLEMENT
}

_integrateFrame() {
    // IMPLEMENT
}

_renderFrame() {
    // IMPLEMENT
}

_getFrameBufferSpec() {
    // IMPLEMENT
}

_getAccumulationBufferSpec() {
    // IMPLEMENT
}

_getRenderBufferSpec() {
    // const gl = this._gl;
    // return [{
    //     width          : this._bufferSize,
    //     height         : this._bufferSize,
    //     min            : gl.NEAREST,
    //     mag            : gl.NEAREST,
    //     wrapS          : gl.CLAMP_TO_EDGE,
    //     wrapT          : gl.CLAMP_TO_EDGE,
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA16F,
    //     type           : gl.FLOAT
    // }];

    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
    }];
}

}
// #link ../WebGPU
// #link WebGPUAbstractRenderer

class WebGPUEAMRenderer extends WebGPUAbstractRenderer {

constructor(device, volume, environmentTexture, options) {
    super(device, volume, environmentTexture, options);

    Object.assign(this, {
        extinction : 100,
        slices     : 64,
        steps      : 64,
    }, options);

    //this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.EAM, MIXINS);
    
    this._mvpInvMat = new Matrix();

    this._generateVSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.generate.vertex });
    this._generateFSModule = this._device.createShaderModule({ code: WGSL.renderers.EAM.generate.fragment });


    // let x = 0;
    // let y = 0;
    // let z = -1;
    // let vertices = new Float32Array([
    //     x-0.5, y-0.5, z, 1.0, 0.0, 0.0,
    //     x+0.5, y-0.5, z, 0.0, 1.0, 0.0,
    //     x,     y+0.5, z, 0.0, 0.0, 1.0
    // ])
    // this._vertexBuffer = WebGPU.createBuffer(this._device, vertices, GPUBufferUsage.VERTEX)

    //this._sceneBuffer = WebGPU.createBuffer(this._device, this._mvpInvMat.m, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this._sceneBuffer = this._device.createBuffer({
        size: 76,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: false
    });

    this._sampler = this._device.createSampler({
        minFilter: "linear",
        magFilter: "linear"
    });

    this._sceneBindGroupLayout = this._device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "3d" }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "2d" }
            }
        ]
    });
    this._sceneBindGroup = null;
    // this._sceneBindGroup = this._device.createBindGroup({
    //     layout: this._sceneBindGroupLayout,
    //     entries: [
    //         {
    //             binding: 0,
    //             resource: { buffer: this._sceneBuffer }
    //         },
    //         {
    //             binding: 1,
    //             resource: this._sampler
    //         },
    //         {
    //             binding: 2,
    //             resource: this._volume
    //         }
    //     ]
    // });
    this._scenePipeline = this._device.createRenderPipeline({
        layout: this._device.createPipelineLayout({
            bindGroupLayouts: [this._sceneBindGroupLayout]
        }),
        // Vertex shader
        vertex: {
            module: this._generateVSModule,
            entryPoint: "main",
            buffers: [
                { // vertexBuffer
                    attributes: [
                        { // Position
                            shaderLocation: 0, // [[location(0)]]
                            offset: 0,
                            format: "float32x2"
                        }
                    ],
                    arrayStride: 4 * 2, // sizeof(float) * 2
                    stepMode: "vertex"
                }
            ]
        },
        // Fragment shader
        fragment: {
            module: this._generateFSModule,
            entryPoint: "main",
            targets: [{
                format: "rgba8unorm"
            }],
        },
        // Rasterization
        primitive: {
            frontFace: "ccw",
            cullMode: "none",
            topology: "triangle-list"
        },
        // Depth test
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus-stencil8"
        }
    });
}

destroy() {
    // const gl = this._gl;
    // Object.keys(this._programs).forEach(programName => {
    //     gl.deleteProgram(this._programs[programName].program);
    // });

    super.destroy();
}

_resetFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.reset;
    // gl.useProgram(program);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_generateFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.generate;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    // gl.uniform1i(uniforms.uVolume, 0);
    // gl.uniform1i(uniforms.uTransferFunction, 1);
    // gl.uniform1f(uniforms.uStepSize, 1 / this.slices);
    // gl.uniform1f(uniforms.uExtinction, this.extinction);
    // gl.uniform1f(uniforms.uOffset, Math.random());
    // const mvpit = this.calculateMVPInverseTranspose();
    // gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    
    // this.pvmMat.multiply(this.viewMatrix, this.modelMatrix);
    // this.pvmMat.multiply(this.projectionMatrix, this.pvmMat);

    // this._device.queue.writeBuffer(this._sceneBuffer, 0, this.pvmMat.m);

    if (!this._volume.getTextureView()) { // TODO
        return;
    }

    this._mvpInvMat = this.calculateMVPInverseTranspose();
    this._device.queue.writeBuffer(this._sceneBuffer, 0, this._mvpInvMat.m);
    this._device.queue.writeBuffer(this._sceneBuffer, 64, new Float32Array([
        1.0 / this.slices,
        Math.random(),
        this.extinction
    ]));



    this._sceneBindGroup = this._device.createBindGroup({
        layout: this._sceneBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: { buffer: this._sceneBuffer }
            },
            {
                binding: 1,
                resource: this._sampler
            },
            {
                binding: 2,
                resource: this._volume.getTextureView()
            },
            {
                binding: 3,
                resource: this._transferFunctionTexture.createView()
            }
        ]
    });



    const commandEncoder = this._device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: this._frameBufferTex.createView(),
            loadOp: "clear",
            clearValue: [0, 0, 0, 1],
            storeOp: "store"
        }],
        depthStencilAttachment: {
            view: this._frameBufferDepthTex.createView(),
            depthClearValue: 1,
            depthLoadOp: "clear",
            depthStoreOp: "store",
            stencilClearValue: 0,
            stencilLoadOp: "clear",
            stencilStoreOp: "store"
        }
    });
    renderPass.setPipeline(this._scenePipeline);
    renderPass.setVertexBuffer(0, this._clipQuad);
    renderPass.setBindGroup(0, this._sceneBindGroup);
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();

    this._device.queue.submit([commandEncoder.finish()]);
}

_integrateFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.integrate;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    // gl.uniform1i(uniforms.uAccumulator, 0);
    // gl.uniform1i(uniforms.uFrame, 1);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_renderFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.render;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    // gl.uniform1i(uniforms.uAccumulator, 0);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    // const gl = this._gl;
    // return [{
    //     width          : this._bufferSize,
    //     height         : this._bufferSize,
    //     min            : gl.NEAREST,
    //     mag            : gl.NEAREST,
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA,
    //     type           : gl.UNSIGNED_BYTE
    // }];

    return [{ // TODO: Should this return an array?
        width:  this._bufferSize,
        height: this._bufferSize,
        format: "rgba8unorm"
    }];
}

_getAccumulationBufferSpec() {
    // const gl = this._gl;
    // return [{
    //     width          : this._bufferSize,
    //     height         : this._bufferSize,
    //     min            : gl.NEAREST,
    //     mag            : gl.NEAREST,
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA,
    //     type           : gl.UNSIGNED_BYTE
    // }];

    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
    }];
}

}
// #link ../WebGPU
// #link WebGPUAbstractRenderer

class WebGPUISORenderer extends WebGPUAbstractRenderer {

constructor(device, volume, environmentTexture, options) {
    super(device, volume, environmentTexture, options);

    Object.assign(this, {
        _stepSize : 0.05,
        _isovalue : 0.4,
        _light    : [0.5, 0.5, 0.5],
        _diffuse  : [0.7, 0.8, 0.9]
    }, options);

    //this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.ISO, MIXINS);

    this._mvpInvMat = new Matrix();

    this._generateVSModule = this._device.createShaderModule({ code: WGSL.renderers.ISO.generate.vertex });
    this._generateFSModule = this._device.createShaderModule({ code: WGSL.renderers.ISO.generate.fragment });

    //this._sceneBuffer = WebGPU.createBuffer(this._device, this._mvpInvMat.m, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this._sceneBuffer = this._device.createBuffer({
        size: 76,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: false
    });

    this._sampler = this._device.createSampler({
        minFilter: "linear",
        magFilter: "linear"
    });

    this._sceneBindGroupLayout = this._device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "3d" }
            }
        ]
    });
    this._sceneBindGroup = null;
    // this._sceneBindGroup = this._device.createBindGroup({
    //     layout: this._sceneBindGroupLayout,
    //     entries: [
    //         {
    //             binding: 0,
    //             resource: { buffer: this._sceneBuffer }
    //         },
    //         {
    //             binding: 1,
    //             resource: this._sampler
    //         },
    //         {
    //             binding: 2,
    //             resource: this._volume
    //         }
    //     ]
    // });
    this._scenePipeline = this._device.createRenderPipeline({
        layout: this._device.createPipelineLayout({
            bindGroupLayouts: [this._sceneBindGroupLayout]
        }),
        // Vertex shader
        vertex: {
            module: this._generateVSModule,
            entryPoint: "main",
            buffers: [
                { // vertexBuffer
                    attributes: [
                        { // Position
                            shaderLocation: 0, // [[location(0)]]
                            offset: 0,
                            format: "float32x2"
                        }
                    ],
                    arrayStride: 4 * 2, // sizeof(float) * 2
                    stepMode: "vertex"
                }
            ]
        },
        // Fragment shader
        fragment: {
            module: this._generateFSModule,
            entryPoint: "main",
            targets: [{
                format: "rgba8unorm"
            }],
        },
        // Rasterization
        primitive: {
            frontFace: "ccw",
            cullMode: "none",
            topology: "triangle-list"
        },
        // Depth test
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus-stencil8"
        }
    });
}

destroy() {
    // const gl = this._gl;
    // Object.keys(this._programs).forEach(programName => {
    //     gl.deleteProgram(this._programs[programName].program);
    // });

    super.destroy();
}

_resetFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.reset;
    // gl.useProgram(program);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_generateFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.generate;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());

    // gl.uniform1i(uniforms.uClosest, 0);
    // gl.uniform1i(uniforms.uVolume, 1);
    // gl.uniform1f(uniforms.uStepSize, this._stepSize);
    // gl.uniform1f(uniforms.uOffset, Math.random());
    // gl.uniform1f(uniforms.uIsovalue, this._isovalue);
    // const mvpit = this.calculateMVPInverseTranspose();
    // gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    if (!this._volume.getTextureView()) { // TODO
        return;
    }

    this._mvpInvMat = this.calculateMVPInverseTranspose();
    this._device.queue.writeBuffer(this._sceneBuffer, 0, this._mvpInvMat.m);
    this._device.queue.writeBuffer(this._sceneBuffer, 64, new Float32Array([
        this._stepSize,
        Math.random(),
        this._isovalue
    ]));



    this._sceneBindGroup = this._device.createBindGroup({
        layout: this._sceneBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: { buffer: this._sceneBuffer }
            },
            {
                binding: 1,
                resource: this._sampler
            },
            {
                binding: 2,
                resource: this._volume.getTextureView()
            }
        ]
    });



    const commandEncoder = this._device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: this._frameBufferTex.createView(),
            loadOp: "clear",
            clearValue: [0, 0, 0, 1],
            storeOp: "store"
        }],
        depthStencilAttachment: {
            view: this._frameBufferDepthTex.createView(),
            depthClearValue: 0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
            stencilClearValue: 0,
            stencilLoadOp: "clear",
            stencilStoreOp: "store"
        }
    });
    renderPass.setPipeline(this._scenePipeline);
    renderPass.setVertexBuffer(0, this._clipQuad);
    renderPass.setBindGroup(0, this._sceneBindGroup);
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();

    this._device.queue.submit([commandEncoder.finish()]);
}

_integrateFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.integrate;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    // gl.uniform1i(uniforms.uAccumulator, 0);
    // gl.uniform1i(uniforms.uFrame, 1);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_renderFrame() {
    // const gl = this._gl;

    // const { program, uniforms } = this._programs.render;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());

    // gl.uniform1i(uniforms.uClosest, 0);
    // gl.uniform1i(uniforms.uVolume, 1);
    // gl.uniform3fv(uniforms.uLight, this._light);
    // gl.uniform3fv(uniforms.uDiffuse, this._diffuse);

    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    // const gl = this._gl;
    // return [{
    //     width          : this._bufferSize,
    //     height         : this._bufferSize,
    //     min            : gl.NEAREST,
    //     mag            : gl.NEAREST,
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA16F,
    //     type           : gl.FLOAT
    // }];

    return [{ // TODO: Should this return an array?
        width:  this._bufferSize,
        height: this._bufferSize,
        format: "rgba8unorm"
    }];
}

_getAccumulationBufferSpec() {
    // const gl = this._gl;
    // return [{
    //     width          : this._bufferSize,
    //     height         : this._bufferSize,
    //     min            : gl.NEAREST,
    //     mag            : gl.NEAREST,
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA16F,
    //     type           : gl.FLOAT
    // }];

    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
    }];
}

}
// #link ../WebGL

class AbstractToneMapper {

constructor(gl, texture, options) {
    Object.assign(this, {
        _bufferSize : 512
    }, options);

    this._gl = gl;
    this._texture = texture;

    this._rebuildBuffers();

    this._clipQuad = WebGL.createClipQuad(gl);
    this._clipQuadProgram = WebGL.buildPrograms(gl, {
        quad: SHADERS.quad
    }).quad;
}

destroy() {
    const gl = this._gl;

    this._renderBuffer.destroy();
    gl.deleteBuffer(this._clipQuad);
    gl.deleteProgram(this._clipQuadProgram.program);
}

render() {
    // TODO: put the following logic in VAO
    const gl = this._gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    gl.enableVertexAttribArray(0); // position always bound to attribute 0
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this._renderBuffer.use();
    this._renderFrame();
}

setTexture(texture) {
    this._texture = texture;
}

getTexture() {
    return this._renderBuffer.getAttachments().color[0];
}

_rebuildBuffers() {
    if (this._renderBuffer) {
        this._renderBuffer.destroy();
    }
    const gl = this._gl;
    this._renderBuffer = new SingleBuffer(gl, this._getRenderBufferSpec());
}

setResolution(resolution) {
    if (resolution !== this._bufferSize) {
        this._bufferSize = resolution;
        this._rebuildBuffers();
    }
}

_renderFrame() {
    // IMPLEMENT
}

_getRenderBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.LINEAR,
        mag            : gl.LINEAR,
        wrapS          : gl.CLAMP_TO_EDGE,
        wrapT          : gl.CLAMP_TO_EDGE,
        format         : gl.RGBA,
        internalFormat : gl.RGBA,
        type           : gl.UNSIGNED_BYTE
    }];
}

}
// #link ../WebGL
// #link AbstractToneMapper

class AcesToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    this.exposure = 1;

    this._program = WebGL.buildPrograms(this._gl, {
        AcesToneMapper : SHADERS.AcesToneMapper
    }, MIXINS).AcesToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uExposure, this.exposure);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link ../WebGL
// #link AbstractToneMapper

class ArtisticToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    Object.assign(this, {
        low        : 0,
        mid        : 0.5,
        high       : 1,
        saturation : 1
    }, options);

    this._program = WebGL.buildPrograms(this._gl, {
        ArtisticToneMapper : SHADERS.ArtisticToneMapper
    }, MIXINS).ArtisticToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uLow, this.low);
    gl.uniform1f(uniforms.uMid, this.mid);
    gl.uniform1f(uniforms.uHigh, this.high);
    gl.uniform1f(uniforms.uSaturation, this.saturation);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link ../WebGL
// #link AbstractToneMapper

class FilmicToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    this.exposure = 1;

    this._program = WebGL.buildPrograms(this._gl, {
        FilmicToneMapper : SHADERS.FilmicToneMapper
    }, MIXINS).FilmicToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uExposure, this.exposure);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link ../WebGL
// #link AbstractToneMapper

class LottesToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    this.exposure = 1;

    this._program = WebGL.buildPrograms(this._gl, {
        LottesToneMapper : SHADERS.LottesToneMapper
    }, MIXINS).LottesToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uExposure, this.exposure);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link ../WebGL
// #link AbstractToneMapper

class RangeToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    Object.assign(this, {
        _min : 0,
        _max : 1
    }, options);

    this._program = WebGL.buildPrograms(this._gl, {
        RangeToneMapper : SHADERS.RangeToneMapper
    }, MIXINS).RangeToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uMin, this._min);
    gl.uniform1f(uniforms.uMax, this._max);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link ../WebGL
// #link AbstractToneMapper

class Reinhard2ToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    this.exposure = 1;

    this._program = WebGL.buildPrograms(this._gl, {
        Reinhard2ToneMapper : SHADERS.Reinhard2ToneMapper
    }, MIXINS).Reinhard2ToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uExposure, this.exposure);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link ../WebGL
// #link AbstractToneMapper

class ReinhardToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    this.exposure = 1;

    this._program = WebGL.buildPrograms(this._gl, {
        ReinhardToneMapper : SHADERS.ReinhardToneMapper
    }, MIXINS).ReinhardToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uExposure, this.exposure);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link ../WebGL
// #link AbstractToneMapper

class UchimuraToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    this.exposure = 1;

    this._program = WebGL.buildPrograms(this._gl, {
        UchimuraToneMapper : SHADERS.UchimuraToneMapper
    }, MIXINS).UchimuraToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uExposure, this.exposure);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link ../WebGL
// #link AbstractToneMapper

class Uncharted2ToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    this.exposure = 1;

    this._program = WebGL.buildPrograms(this._gl, {
        Uncharted2ToneMapper : SHADERS.Uncharted2ToneMapper
    }, MIXINS).Uncharted2ToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uExposure, this.exposure);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link ../WebGL
// #link AbstractToneMapper

class UnrealToneMapper extends AbstractToneMapper {

constructor(gl, texture, options) {
    super(gl, texture, options);

    this.exposure = 1;

    this._program = WebGL.buildPrograms(this._gl, {
        UnrealToneMapper : SHADERS.UnrealToneMapper
    }, MIXINS).UnrealToneMapper;
}

destroy() {
    const gl = this._gl;
    gl.deleteProgram(this._program.program);

    super.destroy();
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._program;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1f(uniforms.uExposure, this.exposure);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

}
// #link math
// #link WebGL
// #link Ticker
// #link Camera
// #link OrbitCameraController
// #link Volume
// #link renderers
// #link tonemappers

class RenderingContext {

constructor(options) {
    this._render = this._render.bind(this);
    this._webglcontextlostHandler = this._webglcontextlostHandler.bind(this);
    this._webglcontextrestoredHandler = this._webglcontextrestoredHandler.bind(this);

    Object.assign(this, {
        _resolution : 512,
        _filter     : 'linear'
    }, options);

    this._canvas = document.createElement('canvas');
    this._canvas.addEventListener('webglcontextlost', this._webglcontextlostHandler);
    this._canvas.addEventListener('webglcontextrestored', this._webglcontextrestoredHandler);

    this._initGL();

    this._camera = new Camera();
    this._camera.position.z = 1.5;
    this._camera.fovX = 0.3;
    this._camera.fovY = 0.3;
    this._camera.updateMatrices();

    this._cameraController = new OrbitCameraController(this._camera, this._canvas);

    this._volume = new Volume(this._gl);
    this._scale = new Vector(1, 1, 1);
    this._translation = new Vector(0, 0, 0);
    this._isTransformationDirty = true;
    this._updateMvpInverseMatrix();
}

// ============================ WEBGL SUBSYSTEM ============================ //

_initGL() {
    const contextSettings = {
        alpha                 : false,
        depth                 : false,
        stencil               : false,
        antialias             : false,
        preserveDrawingBuffer : true,
    };

    this._contextRestorable = true;

    this._gl = this._canvas.getContext('webgl2-compute', contextSettings);
    if (this._gl) {
        this._hasCompute = true;
    } else {
        this._hasCompute = false;
        this._gl = this._canvas.getContext('webgl2', contextSettings);
    }
    const gl = this._gl;
    this._extLoseContext = gl.getExtension('WEBGL_lose_context');
    this._extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    this._extTextureFloatLinear = gl.getExtension('OES_texture_float_linear');

    if (!this._extColorBufferFloat) {
        console.error('EXT_color_buffer_float not supported!');
    }

    if (!this._extTextureFloatLinear) {
        console.error('OES_texture_float_linear not supported!');
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this._environmentTexture = WebGL.createTexture(gl, {
        width          : 1,
        height         : 1,
        data           : new Uint8Array([255, 255, 255, 255]),
        format         : gl.RGBA,
        internalFormat : gl.RGBA, // TODO: HDRI & OpenEXR support
        type           : gl.UNSIGNED_BYTE,
        wrapS          : gl.CLAMP_TO_EDGE,
        wrapT          : gl.CLAMP_TO_EDGE,
        min            : gl.LINEAR,
        max            : gl.LINEAR
    });

    this._program = WebGL.buildPrograms(gl, {
        quad: SHADERS.quad
    }, MIXINS).quad;

    this._clipQuad = WebGL.createClipQuad(gl);
}

_webglcontextlostHandler(e) {
    if (this._contextRestorable) {
        e.preventDefault();
    }
}

_webglcontextrestoredHandler(e) {
    this._initGL();
}

resize(width, height) {
    this._canvas.width = width;
    this._canvas.height = height;
    this._camera.resize(width, height);
}

setVolume(reader) {
    this._volume = new Volume(this._gl, reader);
    this._volume.readMetadata({
        onData: () => {
            this._volume.readModality('default', {
                onLoad: () => {
                    this._volume.setFilter(this._filter);
                    if (this._renderer) {
                        this._renderer.setVolume(this._volume);
                        this.startRendering();
                    }
                }
            });
        }
    });
}

setEnvironmentMap(image) {
    WebGL.createTexture(this._gl, {
        texture : this._environmentTexture,
        image   : image
    });
}

setFilter(filter) {
    this._filter = filter;
    if (this._volume) {
        this._volume.setFilter(filter);
        if (this._renderer) {
            this._renderer.reset();
        }
    }
}

chooseRenderer(renderer) {
    if (this._renderer) {
        this._renderer.destroy();
    }
    const rendererClass = this._getRendererClass(renderer);
    this._renderer = new rendererClass(this._gl, this._volume, this._environmentTexture);
    if (this._toneMapper) {
        this._toneMapper.setTexture(this._renderer.getTexture());
    }
    this._isTransformationDirty = true;
}

chooseToneMapper(toneMapper) {
    if (this._toneMapper) {
        this._toneMapper.destroy();
    }
    const gl = this._gl;
    let texture;
    if (this._renderer) {
        texture = this._renderer.getTexture();
    } else {
        texture = WebGL.createTexture(gl, {
            width  : 1,
            height : 1,
            data   : new Uint8Array([255, 255, 255, 255]),
        });
    }
    const toneMapperClass = this._getToneMapperClass(toneMapper);
    this._toneMapper = new toneMapperClass(gl, texture);
}

getCanvas() {
    return this._canvas;
}

getRenderer() {
    return this._renderer;
}

getToneMapper() {
    return this._toneMapper;
}

_updateMvpInverseMatrix() {
    if (!this._camera.isDirty && !this._isTransformationDirty) {
        return;
    }

    this._camera.isDirty = false;
    this._isTransformationDirty = false;
    this._camera.updateMatrices();

    const centerTranslation = new Matrix().fromTranslation(-0.5, -0.5, -0.5);
    const volumeTranslation = new Matrix().fromTranslation(
        this._translation.x, this._translation.y, this._translation.z);
    const volumeScale = new Matrix().fromScale(
        this._scale.x, this._scale.y, this._scale.z);

    const modelMatrix = new Matrix();
    modelMatrix.multiply(volumeScale, centerTranslation);
    modelMatrix.multiply(volumeTranslation, modelMatrix);

    const viewMatrix = this._camera.viewMatrix;
    const projectionMatrix = this._camera.projectionMatrix;

    if (this._renderer) {
        this._renderer.modelMatrix.copy(modelMatrix);
        this._renderer.viewMatrix.copy(viewMatrix);
        this._renderer.projectionMatrix.copy(projectionMatrix);
        this._renderer.reset();
    }
}

_render() {
    const gl = this._gl;
    if (!gl || !this._renderer || !this._toneMapper) {
        return;
    }

    this._updateMvpInverseMatrix();

    this._renderer.render();
    this._toneMapper.render();

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    const program = this._program;
    gl.useProgram(program.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    const aPosition = program.attributes.aPosition;
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._toneMapper.getTexture());
    gl.uniform1i(program.uniforms.uTexture, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    gl.disableVertexAttribArray(aPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

getScale() {
    return this._scale;
}

setScale(x, y, z) {
    this._scale.set(x, y, z);
    this._isTransformationDirty = true;
}

getTranslation() {
    return this._translation;
}

setTranslation(x, y, z) {
    this._translation.set(x, y, z);
    this._isTransformationDirty = true;
}

getResolution() {
    return this._resolution;
}

setResolution(resolution) {
    if (this._renderer) {
        this._renderer.setResolution(resolution);
    }
    if (this._toneMapper) {
        this._toneMapper.setResolution(resolution);
        if (this._renderer) {
            this._toneMapper.setTexture(this._renderer.getTexture());
        }
    }
}

startRendering() {
    Ticker.add(this._render);
}

stopRendering() {
    Ticker.remove(this._render);
}

hasComputeCapabilities() {
    return this._hasCompute;
}

_getRendererClass(renderer) {
    switch (renderer) {
        case 'mip' : return MIPRenderer;
        case 'iso' : return ISORenderer;
        case 'eam' : return EAMRenderer;
        case 'mcs' : return MCSRenderer;
        case 'mcm' : return MCMRenderer;
        case 'mcc' : return MCCRenderer;
        case 'dos' : return DOSRenderer;
    }
}

_getToneMapperClass(toneMapper) {
    switch (toneMapper) {
        case 'artistic'   : return ArtisticToneMapper;
        case 'range'      : return RangeToneMapper;
        case 'reinhard'   : return ReinhardToneMapper;
        case 'reinhard2'  : return Reinhard2ToneMapper;
        case 'uncharted2' : return Uncharted2ToneMapper;
        case 'filmic'     : return FilmicToneMapper;
        case 'unreal'     : return UnrealToneMapper;
        case 'aces'       : return AcesToneMapper;
        case 'lottes'     : return LottesToneMapper;
        case 'uchimura'   : return UchimuraToneMapper;
    }
}

}
// #link WebGPU

class WebGPUVolume {

constructor(device, reader, options) {
    Object.assign(this, {
        ready: false
    }, options);

    this._device = device;
    this._reader = reader;

    this.meta       = null;
    this.modalities = null;
    this.blocks     = null;
    this._texture   = null;
}

destroy() {
    // const gl = this._gl;
    // if (this._texture) {
    //     gl.deleteTexture(this._texture);
    // }

    if (this._texture) {
        this._texture.destroy();
        this._texture = null;
    }
}

readMetadata(handlers) {
    if (!this._reader) {
        return;
    }
    this.ready = false;
    this._reader.readMetadata({
        onData: data => {
            this.meta = data.meta;
            this.modalities = data.modalities;
            this.blocks = data.blocks;
            handlers.onData && handlers.onData();
        }
    });
}

readModality(modalityName, handlers) {
    if (!this._reader || !this.modalities) {
        return;
    }
    this.ready = false;
    const modality = this.modalities.find(modality => modality.name === modalityName);
    if (!modality) {
        return;
    }
    const dimensions = modality.dimensions;
    const components = modality.components;
    const blocks = this.blocks;

    if (this._texture) {
        this._texture.destroy();
    }
    this._texture = this._device.createTexture({
        size: [dimensions.width, dimensions.height, dimensions.depth],
        dimension: "3d",
        format: "r8unorm", // TODO
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    // this._texture = this._device.createTexture({
    //     size: [256, 256, 256],
    //     dimension: "3d",
    //     format: "r8unorm", // TODO
    //     usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    // });

    // let ones = new Uint8Array(256 * 256 * 256);
    // for (let i = 0; i < 256 * 256 * 256; ++i) {
    //     ones[i] = 255;
    // }

    // this._device.queue.writeTexture(
    //     {
    //         texture: this._texture,
    //         origin: [0,0,0]
    //     },
    //     ones,
    //     {
    //         offset: 0,
    //         bytesPerRow: 256,
    //         rowsPerImage: 256
    //     },
    //     { width: 256, height: 256, depthOrArrayLayers: 256 }
    // );



    // gl.texStorage3D(gl.TEXTURE_3D, 1, modality.internalFormat,
    //     dimensions.width, dimensions.height, dimensions.depth);
    let remainingBlocks = modality.placements.length;
    modality.placements.forEach(placement => {
        this._reader.readBlock(placement.index, {
            onData: data => {
                const position = placement.position;
                const block = blocks[placement.index];
                const blockdim = block.dimensions;

                // format: 6403, // RED
                // internalFormat: 33321, // R8
                // type: 5121, // UNSIGNED_BYTE

                this._device.queue.writeTexture(
                    {
                        texture: this._texture,
                        origin: [position.x, position.y, position.z]
                    },
                    this._typize(data, modality.type),
                    {
                        offset: 0, // ((position.z * blockdim.height + position.y) * blockdim.width + position.x) * 1,
                        bytesPerRow: blockdim.width * 1,
                        rowsPerImage: blockdim.height
                    },
                    { width: blockdim.width, height: blockdim.height, depthOrArrayLayers: blockdim.depth }
                );

                remainingBlocks--;
                if (remainingBlocks === 0) {
                    this.ready = true;
                    handlers.onLoad && handlers.onLoad();
                }
            }
        });
    });
}

_typize(data, type) {
    // const gl = this._gl;
    // switch (type) {
    //     case gl.BYTE:                         return new Int8Array(data);
    //     case gl.UNSIGNED_BYTE:                return new Uint8Array(data);
    //     case gl.UNSIGNED_BYTE:                return new Uint8ClampedArray(data);
    //     case gl.SHORT:                        return new Int16Array(data);
    //     case gl.UNSIGNED_SHORT:               return new Uint16Array(data);
    //     case gl.UNSIGNED_SHORT_5_6_5:         return new Uint16Array(data);
    //     case gl.UNSIGNED_SHORT_5_5_5_1:       return new Uint16Array(data);
    //     case gl.UNSIGNED_SHORT_4_4_4_4:       return new Uint16Array(data);
    //     case gl.INT:                          return new Int32Array(data);
    //     case gl.UNSIGNED_INT:                 return new Uint32Array(data);
    //     case gl.UNSIGNED_INT_5_9_9_9_REV:     return new Uint32Array(data);
    //     case gl.UNSIGNED_INT_2_10_10_10_REV:  return new Uint32Array(data);
    //     case gl.UNSIGNED_INT_10F_11F_11F_REV: return new Uint32Array(data);
    //     case gl.UNSIGNED_INT_24_8:            return new Uint32Array(data);
    //     case gl.HALF_FLOAT:                   return new Uint16Array(data);
    //     case gl.FLOAT:                        return new Float32Array(data);
    //     default: throw new Error('Unknown volume datatype: ' + type);
    // }

    return new Uint8Array(data);
}

getTextureView() {
    if (this.ready) {
        return this._texture.createView({ dimension: "3d" });
    } else {
        return null;
    }
}

setFilter(filter) {
    if (!this._texture) {
        return;
    }

    // const gl = this._gl;
    // filter = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    // gl.bindTexture(gl.TEXTURE_3D, this._texture);
    // gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
    // gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
}

}
// #link math
// #link WebGL
// #link WebGPU
// #link Ticker
// #link Camera
// #link OrbitCameraController
// #link WebGPUVolume
// #link renderers
// #link tonemappers

class WebGPURenderingContext {

constructor(onReady, options) {
    this._render = this._render.bind(this);
    // this._webglcontextlostHandler = this._webglcontextlostHandler.bind(this);
    // this._webglcontextrestoredHandler = this._webglcontextrestoredHandler.bind(this);

    Object.assign(this, {
        _resolution : 512,
        _filter     : 'linear'
    }, options);

    this._canvas = document.createElement('canvas');
    // this._canvas.addEventListener('webglcontextlost', this._webglcontextlostHandler);
    // this._canvas.addEventListener('webglcontextrestored', this._webglcontextrestoredHandler);

    this._initWebGPU(() => {
        this._camera = new Camera();
        this._camera.position.z = 1.5;
        this._camera.fovX = 0.3;
        this._camera.fovY = 0.3;
        this._camera.updateMatrices();

        this._cameraController = new OrbitCameraController(this._camera, this._canvas);

        this._volume = new WebGPUVolume(this._device);
        this._scale = new Vector(1, 1, 1);
        this._translation = new Vector(0, 0, 0);
        this._isTransformationDirty = true;
        this._updateMvpInverseMatrix();

        onReady(); // TODO: Dirty hack, remove
    });

    
}

// ============================ WEBGPU SUBSYSTEM ============================ //

async _initWebGPU(onInit) {
    this._adapter = await window.navigator.gpu.requestAdapter();
    this._device = await this._adapter.requestDevice();
    this._context = this._canvas.getContext("webgpu");
    this._presentationFormat = this._context.getPreferredFormat(this._adapter);
    this._context.configure({
        device: this._device,
        format: this._presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    this._hasCompute = false; // TODO: Remove

    this._clipQuad = WebGPU.createClipQuad(this._device);

    this._sampler = this._device.createSampler({
        minFilter: "nearest",
        magFilter: "nearest"
    });



    let tempTexData = new Uint8Array(256 * 256 * 4)
    for (let i = 0; i < 256 * 256; ++i) {
        tempTexData[4*i] = 255
        tempTexData[4*i+1] = 0
        tempTexData[4*i+2] = 0
        tempTexData[4*i+3] = 255
    }
    let tempTexBuffer = this._device.createBuffer({
        size: ((tempTexData.byteLength + 3) & ~3),
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true
    });
    new Uint8Array(tempTexBuffer.getMappedRange()).set(tempTexData);
    tempTexBuffer.unmap();
    
    this._tempTex = this._device.createTexture({
        size: [256, 256, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    
    // TODO: Cleanup
    let ce = this._device.createCommandEncoder({});
    ce.copyBufferToTexture({ buffer: tempTexBuffer, bytesPerRow: 256 * 4 }, {texture: this._tempTex}, { width: 256, height: 256});
    this._device.queue.submit([ce.finish()]);

    this._quadVSModule = this._device.createShaderModule({ code: WGSL.quad.vertex });
    this._quadFSModule = this._device.createShaderModule({ code: WGSL.quad.fragment });

    this._quadBindGroupLayout = this._device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            }
        ]
    });
    this._quadBindGroup = this._device.createBindGroup({
        layout: this._quadBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: this._sampler
            },
            {
                binding: 1,
                resource: this._tempTex.createView()
            }
        ]
    });
    this._quadPipeline = this._device.createRenderPipeline({
        layout: this._device.createPipelineLayout({
            bindGroupLayouts: [this._quadBindGroupLayout]
        }),
        vertex: {
            module: this._quadVSModule,
            entryPoint: "main",
            buffers: [
                { // vertexBuffer
                    attributes: [
                        { // Position
                            shaderLocation: 0, // [[location(0)]]
                            offset: 0,
                            format: "float32x2"
                        }
                    ],
                    arrayStride: 4 * 2, // sizeof(float) * 6
                    stepMode: "vertex"
                }
            ]
        },
        fragment: {
            module: this._quadFSModule,
            entryPoint: "main",
            targets: [{
                format: this._presentationFormat
            }],
        },
        primitive: {
            // frontFace: "ccw",
            // cullMode: "back",
            topology: "triangle-list"
        },
        // depthStencil: {
        //     depthWriteEnabled: true,
        //     depthCompare: "less",
        //     format: "depth24plus-stencil8"
        // }
    });







    // const contextSettings = {
    //     alpha                 : false,
    //     depth                 : false,
    //     stencil               : false,
    //     antialias             : false,
    //     preserveDrawingBuffer : true,
    // };

    // this._contextRestorable = true;

    // this._gl = this._canvas.getContext('webgl2-compute', contextSettings);
    // if (this._gl) {
    //     this._hasCompute = true;
    // } else {
    //     this._hasCompute = false;
    //     this._gl = this._canvas.getContext('webgl2', contextSettings);
    // }
    // const gl = this._gl;
    // this._extLoseContext = gl.getExtension('WEBGL_lose_context');
    // this._extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    // this._extTextureFloatLinear = gl.getExtension('OES_texture_float_linear');

    // if (!this._extColorBufferFloat) {
    //     console.error('EXT_color_buffer_float not supported!');
    // }

    // if (!this._extTextureFloatLinear) {
    //     console.error('OES_texture_float_linear not supported!');
    // }

    // gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // this._environmentTexture = WebGL.createTexture(gl, {
    //     width          : 1,
    //     height         : 1,
    //     data           : new Uint8Array([255, 255, 255, 255]),
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA, // TODO: HDRI & OpenEXR support
    //     type           : gl.UNSIGNED_BYTE,
    //     wrapS          : gl.CLAMP_TO_EDGE,
    //     wrapT          : gl.CLAMP_TO_EDGE,
    //     min            : gl.LINEAR,
    //     max            : gl.LINEAR
    // });

    // this._program = WebGL.buildPrograms(gl, {
    //     quad: SHADERS.quad
    // }, MIXINS).quad;

    // this._clipQuad = WebGL.createClipQuad(gl);

    onInit(); // TODO: Dirty hack, remove
}

_webglcontextlostHandler(e) {
    if (this._contextRestorable) {
        e.preventDefault();
    }
}

_webglcontextrestoredHandler(e) {
    this._initWebGPU();
}

resize(width, height) {
    this._canvas.width = width;
    this._canvas.height = height;
    this._camera.resize(width, height);
}

setVolume(reader) {
    this._volume = new WebGPUVolume(this._device, reader);
    this._volume.readMetadata({
        onData: () => {
            this._volume.readModality('default', {
                onLoad: () => {
                    this._volume.setFilter(this._filter);
                    if (this._renderer) {
                        this._renderer.setVolume(this._volume);
                        this.startRendering();
                    }
                }
            });
        }
    });
}

setEnvironmentMap(image) {
    // WebGL.createTexture(this._gl, {
    //     texture : this._environmentTexture,
    //     image   : image
    // });
}

setFilter(filter) {
    this._filter = filter;
    if (this._volume) {
        this._volume.setFilter(filter);
        if (this._renderer) {
            this._renderer.reset();
        }
    }
}

chooseRenderer(renderer) {
    if (this._renderer) {
        this._renderer.destroy();
    }
    const rendererClass = this._getRendererClass(renderer);
    this._renderer = new rendererClass(this._device, this._volume, this._environmentTexture);
    if (this._toneMapper) {
        this._toneMapper.setTexture(this._renderer.getTexture());
    }
    this._isTransformationDirty = true;

    // TODO: Delete old bind group (memory leak?)
    this._quadBindGroup = this._device.createBindGroup({
        layout: this._quadBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: this._sampler
            },
            {
                binding: 1,
                resource: this._renderer.getTexture().createView()
            }
        ]
    });
}

chooseToneMapper(toneMapper) {
    // if (this._toneMapper) {
    //     this._toneMapper.destroy();
    // }
    // const gl = this._gl;
    // let texture;
    // if (this._renderer) {
    //     texture = this._renderer.getTexture();
    // } else {
    //     texture = WebGL.createTexture(gl, {
    //         width  : 1,
    //         height : 1,
    //         data   : new Uint8Array([255, 255, 255, 255]),
    //     });
    // }
    // const toneMapperClass = this._getToneMapperClass(toneMapper);
    // this._toneMapper = new toneMapperClass(gl, texture);
}

getCanvas() {
    return this._canvas;
}

getRenderer() {
    return this._renderer;
}

getToneMapper() {
    return this._toneMapper;
}

_updateMvpInverseMatrix() {
    if (!this._camera.isDirty && !this._isTransformationDirty) {
        return;
    }

    this._camera.isDirty = false;
    this._isTransformationDirty = false;
    this._camera.updateMatrices();

    const centerTranslation = new Matrix().fromTranslation(-0.5, -0.5, -0.5);
    const volumeTranslation = new Matrix().fromTranslation(
        this._translation.x, this._translation.y, this._translation.z);
    const volumeScale = new Matrix().fromScale(
        this._scale.x, this._scale.y, this._scale.z);

    const modelMatrix = new Matrix();
    modelMatrix.multiply(volumeScale, centerTranslation);
    modelMatrix.multiply(volumeTranslation, modelMatrix);

    const viewMatrix = this._camera.viewMatrix;
    const projectionMatrix = this._camera.projectionMatrix;

    if (this._renderer) {
        this._renderer.modelMatrix.copy(modelMatrix);
        this._renderer.viewMatrix.copy(viewMatrix);
        this._renderer.projectionMatrix.copy(projectionMatrix);
        this._renderer.reset();
    }
}

_render() {
    const device = this._device;
    if (!device) { // || !this._renderer || !this._toneMapper) {
        return;
    }

    this._updateMvpInverseMatrix();

    this._renderer.render();
    // this._toneMapper.render();

    const commandEncoder = device.createCommandEncoder();
    const quadPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: this._context.getCurrentTexture().createView(), // Swap framebuffer
            clearValue: [0, 0, 0, 1],
            loadOp: "clear",
            storeOp: "store"
        }]
    });

    quadPass.setPipeline(this._quadPipeline);
    quadPass.setVertexBuffer(0, this._clipQuad);
    quadPass.setBindGroup(0, this._quadBindGroup);
    quadPass.draw(6, 1, 0, 0);
    quadPass.end();

    device.queue.submit([commandEncoder.finish()]);




    // const gl = this._gl;
    // if (!gl || !this._renderer || !this._toneMapper) {
    //     return;
    // }

    // this._updateMvpInverseMatrix();

    // this._renderer.render();
    // this._toneMapper.render();

    // gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    // const program = this._program;
    // gl.useProgram(program.program);
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    // const aPosition = program.attributes.aPosition;
    // gl.enableVertexAttribArray(aPosition);
    // gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._toneMapper.getTexture());
    // gl.uniform1i(program.uniforms.uTexture, 0);
    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // gl.disableVertexAttribArray(aPosition);
    // gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // gl.bindTexture(gl.TEXTURE_2D, null);
}

getScale() {
    return this._scale;
}

setScale(x, y, z) {
    this._scale.set(x, y, z);
    this._isTransformationDirty = true;
}

getTranslation() {
    return this._translation;
}

setTranslation(x, y, z) {
    this._translation.set(x, y, z);
    this._isTransformationDirty = true;
}

getResolution() {
    return this._resolution;
}

setResolution(resolution) {
    if (this._renderer) {
        this._renderer.setResolution(resolution);

        // TODO: Delete old bind group (memory leak?)
        this._quadBindGroup = this._device.createBindGroup({
            layout: this._quadBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this._sampler
                },
                {
                    binding: 1,
                    resource: this._renderer.getTexture().createView()
                }
            ]
        });
    }
    if (this._toneMapper) {
        this._toneMapper.setResolution(resolution);
        if (this._renderer) {
            this._toneMapper.setTexture(this._renderer.getTexture());
        }
    }
}

startRendering() {
    Ticker.add(this._render);
}

stopRendering() {
    Ticker.remove(this._render);
}

hasComputeCapabilities() {
    return this._hasCompute;
}

_getRendererClass(renderer) {
    switch (renderer) {
        case 'iso': return WebGPUISORenderer;
        case 'eam': return WebGPUEAMRenderer;
    }
    return WebGPUEAMRenderer;
    
    switch (renderer) {
        case 'mip' : return MIPRenderer;
        case 'iso' : return ISORenderer;
        case 'eam' : return EAMRenderer;
        case 'mcs' : return MCSRenderer;
        case 'mcm' : return MCMRenderer;
        case 'mcc' : return MCCRenderer;
        case 'dos' : return DOSRenderer;
    }
}

_getToneMapperClass(toneMapper) {
    switch (toneMapper) {
        case 'artistic'   : return ArtisticToneMapper;
        case 'range'      : return RangeToneMapper;
        case 'reinhard'   : return ReinhardToneMapper;
        case 'reinhard2'  : return Reinhard2ToneMapper;
        case 'uncharted2' : return Uncharted2ToneMapper;
        case 'filmic'     : return FilmicToneMapper;
        case 'unreal'     : return UnrealToneMapper;
        case 'aces'       : return AcesToneMapper;
        case 'lottes'     : return LottesToneMapper;
        case 'uchimura'   : return UchimuraToneMapper;
    }
}

}
// #link utils
// #link readers
// #link loaders
// #link dialogs
// #link ui
// #link RenderingContext
// #link WebGPURenderingContext

class Application {

constructor() {
    this._handleFileDrop = this._handleFileDrop.bind(this);
    this._handleRendererChange = this._handleRendererChange.bind(this);
    this._handleToneMapperChange = this._handleToneMapperChange.bind(this);
    this._handleVolumeLoad = this._handleVolumeLoad.bind(this);
    this._handleEnvmapLoad = this._handleEnvmapLoad.bind(this);

    this._renderingContext = new WebGPURenderingContext(() => {
        this._canvas = this._renderingContext.getCanvas();
        this._canvas.className += 'renderer';
        document.body.appendChild(this._canvas);

        window.addEventListener('resize', () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            this._renderingContext.resize(width, height);
        });
        CommonUtils.trigger('resize', window);

        document.body.addEventListener('dragover', e => e.preventDefault());
        document.body.addEventListener('drop', this._handleFileDrop);

        this._mainDialog = new MainDialog();
        if (!this._renderingContext.hasComputeCapabilities()) {
            this._mainDialog.disableMCC();
        }

        this._statusBar = new StatusBar();
        this._statusBar.appendTo(document.body);

        this._volumeLoadDialog = new VolumeLoadDialog();
        this._volumeLoadDialog.appendTo(this._mainDialog.getVolumeLoadContainer());
        this._volumeLoadDialog.addEventListener('load', this._handleVolumeLoad);

        this._envmapLoadDialog = new EnvmapLoadDialog();
        this._envmapLoadDialog.appendTo(this._mainDialog.getEnvmapLoadContainer());
        this._envmapLoadDialog.addEventListener('load', this._handleEnvmapLoad);

        this._renderingContextDialog = new RenderingContextDialog();
        this._renderingContextDialog.appendTo(
            this._mainDialog.getRenderingContextSettingsContainer());
        this._renderingContextDialog.addEventListener('resolution', options => {
            this._renderingContext.setResolution(options.resolution);
        });
        this._renderingContextDialog.addEventListener('transformation', options => {
            const s = options.scale;
            const t = options.translation;
            this._renderingContext.setScale(s.x, s.y, s.z);
            this._renderingContext.setTranslation(t.x, t.y, t.z);
        });
        this._renderingContextDialog.addEventListener('filter', options => {
            this._renderingContext.setFilter(options.filter);
        });

        this._mainDialog.addEventListener('rendererchange', this._handleRendererChange);
        this._mainDialog.addEventListener('tonemapperchange', this._handleToneMapperChange);
        this._mainDialog.trigger('rendererchange', this._mainDialog.getSelectedRenderer());
        //this._mainDialog.trigger('tonemapperchange', this._mainDialog.getSelectedToneMapper());

        this._renderingContext.startRendering(); // TODO: Temporary
    });
}

_handleFileDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length === 0) {
        return;
    }
    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.bvp')) {
        return;
    }
    this._handleVolumeLoad({
        type       : 'file',
        file       : file,
        filetype   : 'bvp',
        dimensions : { x: 0, y: 0, z: 0 }, // doesn't matter
        precision  : 8 // doesn't matter
    });
}

_handleRendererChange(which) {
    if (this._rendererDialog) {
        this._rendererDialog.destroy();
    }
    this._renderingContext.chooseRenderer(which);
    const renderer = this._renderingContext.getRenderer();
    const container = this._mainDialog.getRendererSettingsContainer();
    const dialogClass = this._getDialogForRenderer(which);
    this._rendererDialog = new dialogClass(renderer);
    this._rendererDialog.appendTo(container);
}

_handleToneMapperChange(which) {
    if (this._toneMapperDialog) {
        this._toneMapperDialog.destroy();
    }
    this._renderingContext.chooseToneMapper(which);
    const toneMapper = this._renderingContext.getToneMapper();
    const container = this._mainDialog.getToneMapperSettingsContainer();
    const dialogClass = this._getDialogForToneMapper(which);
    this._toneMapperDialog = new dialogClass(toneMapper);
    this._toneMapperDialog.appendTo(container);
}

_handleVolumeLoad(options) {
    if (options.type === 'file') {
        const readerClass = this._getReaderForFileType(options.filetype);
        if (readerClass) {
            const loader = new BlobLoader(options.file);
            const reader = new readerClass(loader, {
                width  : options.dimensions.x,
                height : options.dimensions.y,
                depth  : options.dimensions.z,
                bits   : options.precision
            });
            this._renderingContext.stopRendering();
            this._renderingContext.setVolume(reader);
        }
    } else if (options.type === 'url') {
        const readerClass = this._getReaderForFileType(options.filetype);
        if (readerClass) {
            const loader = new AjaxLoader(options.url);
            const reader = new readerClass(loader);
            this._renderingContext.stopRendering();
            this._renderingContext.setVolume(reader);
        }
    }
}

_handleEnvmapLoad(options) {
    let image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => {
        this._renderingContext.setEnvironmentMap(image);
        this._renderingContext.getRenderer().reset();
    });

    if (options.type === 'file') {
        let reader = new FileReader();
        reader.addEventListener('load', () => {
            image.src = reader.result;
        });
        reader.readAsDataURL(options.file);
    } else if (options.type === 'url') {
        image.src = options.url;
    }
}

_getReaderForFileType(type) {
    switch (type) {
        case 'bvp'  : return BVPReader;
        case 'raw'  : return RAWReader;
        case 'zip'  : return ZIPReader;
    }
}

_getDialogForRenderer(renderer) {
    switch (renderer) {
        case 'mip' : return MIPRendererDialog;
        case 'iso' : return ISORendererDialog;
        case 'eam' : return EAMRendererDialog;
        case 'mcs' : return MCSRendererDialog;
        case 'mcm' : return MCMRendererDialog;
        case 'mcc' : return MCMRendererDialog; // yes, the same
        case 'dos' : return DOSRendererDialog;
    }
}

_getDialogForToneMapper(toneMapper) {
    switch (toneMapper) {
        case 'artistic'   : return ArtisticToneMapperDialog;
        case 'range'      : return RangeToneMapperDialog;
        case 'reinhard'   : return ReinhardToneMapperDialog;
        case 'reinhard2'  : return Reinhard2ToneMapperDialog;
        case 'uncharted2' : return Uncharted2ToneMapperDialog;
        case 'filmic'     : return FilmicToneMapperDialog;
        case 'unreal'     : return UnrealToneMapperDialog;
        case 'aces'       : return AcesToneMapperDialog;
        case 'lottes'     : return LottesToneMapperDialog;
        case 'uchimura'   : return UchimuraToneMapperDialog;
    }
}

}
class ResourceLoader {

constructor(resources) {
    this.resources = resources;
    for (const name in this.resources) {
        this.resources[name].dependencies = this.resources[name].dependencies || [];
    }

    let graph = {};
    for (const name in this.resources) {
        graph[name] = this.resources[name].dependencies;
    }
    this.sorted = this.toposort(graph);
}

toposort(graph) {
    let sorted = [];
    let visited = {};
    let processing = {};

    Object.keys(graph).forEach(function visit(next) {
        if (visited[next]) return;
        if (processing[next]) throw new Error('Cyclic dependencies');

        processing[next] = true;
        graph[next].forEach(d => visit(d));
        processing[next] = false;

        visited[next] = true;
        sorted.push(next);
    });

    return sorted;
}

// resolve dependencies, load, then execute in correct sequence
get(name) {
    if (!(name in this.resources)) {
        return Promise.reject(name);
    }

    // construct dependency chain
    let dependencies = [name];
    let queue = [name];
    while (queue.length > 0) {
        const next = queue.pop();
        const deps = this.resources[next].dependencies.filter(name => !dependencies.includes(name));
        dependencies = dependencies.concat(deps);
        queue = queue.concat(deps);
    }

    // ensure correct sequence
    dependencies = this.sorted.filter(name => dependencies.includes(name));

    // load resources
    const promises = dependencies.map(name => this.loadResource(name));

    return Promise.all(promises).then(data => {
        // execute scripts and styles
        dependencies.forEach(name => {
            const dependency = this.resources[name];
            if (dependency.type === 'script') {
                dependency.promise.then(script => document.head.appendChild(script));
            } else if (dependency.type === 'style') {
                dependency.promise.then(style => document.head.appendChild(style));
            }
        });

        // return last one (the requested one, "name")
        return data.pop();
    });
}

get loaders() {
    return {
        'image'  : this.loadImage,
        'script' : this.loadScript,
        'style'  : this.loadStyle,
        'json'   : this.loadJson,
        'html'   : this.loadHtml
    };
}

// load single resource and save a promise
loadResource(name) {
    if (!(name in this.resources)) {
        return Promise.reject(name);
    }

    const resource = this.resources[name];
    if (resource.promise) {
        return resource.promise;
    }

    if (!(resource.type in this.loaders)) {
        return Promise.resolve(name);
    }

    const loader = this.loaders[resource.type];
    resource.promise = loader(resource.url);
    return resource.promise;
}

loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', reject);
        image.src = url;
    });
}

loadScript(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', () => {
            const script = document.createElement('script');
            script.text = xhr.response;
            resolve(script);
        });
        xhr.addEventListener('error', reject);
        xhr.open('GET', url);
        xhr.send();
    });
}

loadStyle(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', () => {
            const style = document.createElement('style');
            style.textContent = xhr.response;
            resolve(style);
        });
        xhr.addEventListener('error', reject);
        xhr.open('GET', url);
        xhr.send();
    });
}

loadJson(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = 'json';
        xhr.addEventListener('load', () => resolve(xhr.response));
        xhr.addEventListener('error', reject);
        xhr.open('GET', url);
        xhr.send();
    });
}

loadHtml(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = 'document';
        xhr.addEventListener('load', () => resolve(xhr.response));
        xhr.addEventListener('error', reject);
        xhr.open('GET', url);
        xhr.send();
    });
}

}
// #link Application
// #link ResourceLoader

const resources = {
    shaders: {
        type: 'json',
        url: 'glsl/shaders.json'
    },
    mixins: {
        type: 'json',
        url: 'glsl/mixins.json'
    },
    templates: {
        type: 'json',
        url: 'html/templates.json'
    },
    uispecs: {
        type: 'json',
        url: 'uispecs.json'
    },
    wgsl: {
        type: 'json',
        url: 'wgsl/shaders.json'
    },
    all: {
        type: 'dummy',
        dependencies: [
            'shaders',
            'mixins',
            'templates',
            'uispecs'
        ]
    }
};

// TODO: fix this quick hack to load all resources into the old globals
ResourceLoader.instance = new ResourceLoader(resources);

let SHADERS;
let MIXINS;
let TEMPLATES;
let UISPECS;
let WGSL;

document.addEventListener('DOMContentLoaded', async () => {
    const rl = ResourceLoader.instance;
    [ SHADERS, MIXINS, TEMPLATES, UISPECS, WGSL ] = await Promise.all([
        rl.loadResource('shaders'),
        rl.loadResource('mixins'),
        rl.loadResource('templates'),
        rl.loadResource('uispecs'),
        rl.loadResource('wgsl'),
    ]);
    const application = new Application();
});
