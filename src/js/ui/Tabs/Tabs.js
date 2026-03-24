import { DOMUtils } from '../../utils/DOMUtils.js';

const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./Tabs.html', import.meta.url))
    .then(response => response.text());

export class Tabs extends HTMLElement {

constructor() {
    super();

    this.clickListener = this.clickListener.bind(this);

    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.appendChild(template.content.cloneNode(true));
    this.binds = DOMUtils.bind(this.shadow);

    // // TODO: this should be done on every mutation
    // for (const header of this.binds.headers.assignedElements()) {
    //     header.addEventListener('click', this.clickListener);
    // }
    this.binds.headers.addEventListener('slotchange', () => this._bindHeaders());
    this._bindHeaders();

    this.selectTab(0);
}

_bindHeaders() {
    const headers = this.binds.headers.assignedElements();
    for (const header of headers) {
        header.removeEventListener('click', this.clickListener);
        header.addEventListener('click', this.clickListener);
    }
}

selectTab(index) {
    const tabs = this.binds.tabs.assignedElements();
    // console.log(index);
    if (tabs.length == 0)
        return;
    if (index < 0 || index >= tabs.length) {
        throw new Error('Tab index out of range');
    }

    this.index = index;
    this._updateStyle();
}

_updateStyle() {
    const tabs = this.binds.tabs.assignedElements();
    const headers = this.binds.headers.assignedElements();

    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('selected', i === this.index);
        tabs[i].classList.toggle('invisible', i !== this.index);
        headers[i].classList.toggle('selected', i === this.index);
        // headers[i].classList.toggle('invisible', i !== this.index); // to dela, skrije vse tabe ki niso izbrani, morde lhko nrdim da so usi tabi razn prvega skriti če nisi v per channel vizualizaciji
    }
}

clickListener(e) {
    const headers = this.binds.headers.assignedElements();
    const index = headers.indexOf(e.target);
    this.selectTab(index);
}

}

customElements.define('ui-tabs', Tabs);
