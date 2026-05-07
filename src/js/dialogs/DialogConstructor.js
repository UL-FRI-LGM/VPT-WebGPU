import { DOMUtils } from '../utils/DOMUtils.js';

export class DialogConstructor {

static construct(properties) {
    const panel = document.createElement('div');
    for (const property of properties) {
        const widget = this.constructProperty(property);
        if (property.type === 'transfer-function') {
            const accordion = `<ui-accordion><span slot="label">Transfer function</span>${widget}</ui-accordion>`;
            const instance = DOMUtils.instantiate(accordion);
            panel.appendChild(instance);
        } else if (property.label === undefined) {
            // No label - widget spans the whole row
            const wrapper = document.createElement('div');
            wrapper.innerHTML = widget;
            panel.appendChild(wrapper.firstElementChild || wrapper.firstChild);
        } else {
            const field = `<ui-field><label slot="label">${property.label}</label>${widget}</ui-field>`;
            const instance = DOMUtils.instantiate(field);
            panel.appendChild(instance);
        }
    }
    return panel;
}

// TODO: This is ugly. Fix ASAP.
static constructProperty(property) {
    switch (property.type) {
        case 'spinner': return `<input type="number" bind="${property.name}" value="${property.value}" min="${property.min}" max="${property.max}" step="${property.step}">`;
        case 'vector-spinner': return `<ui-vector-spinner bind="${property.name}" value="${JSON.stringify(property.value)}" min="${property.min}" max="${property.max}" step="${property.step}"></ui-slider>`;
        case 'slider': return `<ui-slider bind="${property.name}" value="${property.value}" min="${property.min}" max="${property.max}" step="${property.step}"></ui-slider>`;
        case 'checkbox': return `<ui-checkbox bind="${property.name}" ${property.value ? "checked" : ""} ${property.disabled ? "disabled" : ""}></ui-checkbox>`;
        case 'color-chooser': return `<ui-color-chooser bind="${property.name}" value="${property.value}"></ui-color-chooser>`;
        case 'transfer-function': return `<ui-transfer-function bind="${property.name}"></ui-transfer-function>`;
        case 'button':
            const button = `<button type="button" data-action="${property.name}">${property.buttonLabel}</button>`;
            return `<div style="padding: 0 10px">${button}</div>`
        case 'button-row':
            const buttons = property.items.map(item =>
                `<button type="button" data-action="${item.action}"${item.hidden ? ' class="invisible"' : ''}>${item.label}</button>`
            ).join('');
            return `<div style="display: flex; gap: 5px; padding: 0 10px;">${buttons}</div>`;
        case 'text': return `<span style="display: inline-block;${property.color ? ` color: ${property.color};` : ''}" bind="${property.name}">${property.value}</span>`;
        case 'text-input': return `<input type="text" bind="${property.name}" value="${property.value}" ${property.placeholder ? `placeholder="${property.placeholder}"` : ''}>`;
        case 'select':
            const options = property.options.map(opt =>
                `<option value="${opt.value}" ${opt.value === property.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            return `<select bind="${property.name}">${options}</select>`;
        case 'file-chooser': return `<ui-file-chooser bind="${property.name}"></ui-file-chooser>`;
        default: return `<div></div>`;
    }
}

}
