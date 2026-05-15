import { DOMUtils } from '../../utils/DOMUtils.js';

const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./FileChooser.html', import.meta.url))
    .then(response => response.text());

export class FileChooser extends HTMLElement {

constructor() {
    super();

    this.changeListener = this.changeListener.bind(this);
    this.clickListener = this.clickListener.bind(this);

    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.appendChild(template.content.cloneNode(true));
    this.binds = DOMUtils.bind(this.shadow);

    this.addEventListener('click', this.clickListener);
    this.binds.input.addEventListener('change', this.changeListener);
}

changeListener() {
    const files = this.binds.input.files;
    if (files.length > 0) {
        if (this.hasAttribute('multiple') && files.length > 1) {
            this.binds.label.textContent = `${files.length} files selected`;
        } else {
            this.binds.label.textContent = files[0].name;
        }
    } else {
        this.binds.label.textContent = '';
    }
    this.dispatchEvent(new Event('change'));
}

attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'multiple') {
        this.binds.input.setAttribute('multiple', '');
    }
}

clickListener() {
    this.binds.input.click();
}

get files() {
    return this.binds.input.files;
}

get value() {
    return this.files;
}

static get observedAttributes() {
    return ['multiple'];
}

}

customElements.define('ui-file-chooser', FileChooser);
