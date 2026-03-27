import { DOMUtils } from '../utils/DOMUtils.js';

export class DialogConstructor {

static construct(properties) {
    const panel = document.createElement('ui-tabs');
    panel.bind = "tabs";

    const header = document.createElement('div');
    header.slot = 'header';
    header.textContent = 'Properties';

    const tabContent = document.createElement('div');
    var i = 0;
    for (const property of properties) {
        const widget = this.constructProperty(property);
        // console.log(widget);
        if (property.type === 'transfer-function' || property.type === 'transfer-function-1d') {
            const tfHeader = document.createElement('div');
            tfHeader.slot = 'header';
            if (i == 0)
                tfHeader.textContent = "2D TF";
            else
                tfHeader.textContent = i-1;
            panel.appendChild(tfHeader);

            const tfInstance = DOMUtils.instantiate(widget);
            panel.appendChild(tfInstance);
            i+=1;
            // console.log(panel);
        } else {
            const fieldHTML = `<ui-field><label slot="label">${property.label}</label>${widget}</ui-field>`;
            const instance = DOMUtils.instantiate(fieldHTML);
            tabContent.appendChild(instance);
        }
    }

    panel.appendChild(header);
    panel.appendChild(tabContent);

    return panel;
}

// TODO: This is ugly. Fix ASAP.
static constructProperty(property) {
    switch (property.type) {
        case 'spinner': return `<input type="number" bind="${property.name}" value="${property.value}" min="${property.min}" max="${property.max}" step="${property.step}">`;
        case 'vector-spinner': return `<ui-vector-spinner bind="${property.name}" value="${JSON.stringify(property.value)}" min="${property.min}" max="${property.max}" step="${property.step}"></ui-slider>`;
        case 'slider': return `<ui-slider bind="${property.name}" value="${property.value}" min="${property.min}" max="${property.max}" step="${property.step}"></ui-slider>`;
        case 'checkbox': return `<ui-checkbox bind="${property.name}" ${property.value ? "checked" : ""}></ui-checkbox>`;
        case 'color-chooser': return `<ui-color-chooser bind="${property.name}" value="${property.value}"></ui-color-chooser>`;
        case 'transfer-function': return `<ui-transfer-function bind="${property.name}"></ui-transfer-function>`;
        case 'transfer-function-1d': return `<ui-transfer-function-1d bind="${property.name}"></ui-transfer-function-1d>`;
        default: return `<div></div>`;
    }
}

}
