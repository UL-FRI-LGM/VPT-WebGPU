import { DOMUtils } from '../../utils/DOMUtils.js';
import { CommonUtils } from '../../utils/CommonUtils.js';

const [ templateElement ] = await Promise.all([
    new URL('./TransferFunction1D.html', import.meta.url),
].map(url => fetch(url).then(response => response.text())));

const template = document.createElement('template');
template.innerHTML = templateElement;

export class TransferFunction1D extends HTMLElement {

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
        this.shadow.appendChild(template.content.cloneNode(true));
        this.binds = DOMUtils.bind(this.shadow);

        this.stops = [
            { position: 0.0, color: { r: 0, g: 0, b: 0, a: 0 } },
            { position: 1.0, color: { r: 1, g: 1, b: 1, a: 1 } }
        ];
        this._selectedIndex = 0;

        // this._displayCanvas = this.shadow.querySelector('canvas.display');
        // this._displayCtx = this._displayCanvas.getContext('2d');
        // this._displayCanvas.width = 256;
        // this._displayCanvas.height = 48;

        this.canvas = this.shadow.querySelector('canvas');
        this.canvas.width = 256;
        this.canvas.height = 48;
        this._ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.binds.addStop.addEventListener('click', () => this.addStop());
        this.binds.removeStop.addEventListener('click', () => this.removeStop());
        this.binds.color.addEventListener('change', () => this._updateSelectedStop());
        this.binds.alpha.addEventListener('change', () => this._updateSelectedStop());

        this.render();
        this._rebuildHandles();
    }

    render() {
        const ctx = this._ctx;
        const width = this.canvas.width;

        // sort stops by position
        const sorted = [...this.stops].sort((a, b) => a.position - b.position);

        // build gradient
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        for (const stop of sorted) {
            const { r, g, b, a } = stop.color;
            gradient.addColorStop(
                stop.position,
                `rgba(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)}, ${a})`
            );
        }

        ctx.clearRect(0, 0, width, 48);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, 48);

        // const displayGradient = this._displayCtx.createLinearGradient(0, 0, 256, 0);
        // for (const stop of sorted) {
        //     const { r, g, b, a } = stop.color;
        //     displayGradient.addColorStop(stop.position,
        //         `rgba(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)}, ${a})`
        //     );
        // }
        // this._displayCtx.clearRect(0, 0, 256, 48);
        // this._displayCtx.fillStyle = displayGradient;
        // this._displayCtx.fillRect(0, 0, 256, 48);

        // also draw preview on the visible canvas (stretched via CSS)
        this.dispatchEvent(new Event('change'));
    }

    get value() {
        return this.canvas;
    }

    addStop(position = 0.5) {
        this.stops.push({
            position,
            color: { r: 1, g: 0, b: 0, a: 1 }
        });
        this._selectedIndex = this.stops.length - 1;
        this._rebuildHandles();
        this.render();
        this.dispatchEvent(new Event('change'));
    }

    removeStop() {
        if (this.stops.length <= 2) return;  // keep at least 2 stops
        this.stops.splice(this._selectedIndex, 1);
        this._selectedIndex = 0;
        this._rebuildHandles();
        this.render();
        this.dispatchEvent(new Event('change'));
    }

    _updateSelectedStop() {
        const stop = this.stops[this._selectedIndex];
        const color = CommonUtils.hex2rgb(this.binds.color.value);
        stop.color.r = color[0];
        stop.color.g = color[1];
        stop.color.b = color[2];
        stop.color.a = parseFloat(this.binds.alpha.value);
        this.render();
    }

    _rebuildHandles() {
        const container = this.shadow.querySelector('.stops');
        container.innerHTML = '';
        for (let i = 0; i < this.stops.length; i++) {
            const handle = document.createElement('div');
            handle.className = 'stop' + (i === this._selectedIndex ? ' selected' : '');
            handle.style.left = (this.stops[i].position * 100) + '%';
            handle.style.backgroundColor = CommonUtils.rgb2hex([
                this.stops[i].color.r,
                this.stops[i].color.g,
                this.stops[i].color.b
            ]);

            handle.addEventListener('pointerdown', (e) => {
                this._selectedIndex = i;
                this._rebuildHandles();
                this._syncColorPicker();

                // drag to reposition
                const onMove = (e) => {
                    const rect = container.getBoundingClientRect();
                    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    this.stops[i].position = x;
                    handle.style.left = (x * 100) + '%';
                    this.render();
                };
                const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            });

            container.appendChild(handle);
        }
    }

    _syncColorPicker() {
        const stop = this.stops[this._selectedIndex];
        this.binds.color.value = CommonUtils.rgb2hex([stop.color.r, stop.color.g, stop.color.b]);
        this.binds.alpha.value = stop.color.a;
    }
}

customElements.define('ui-transfer-function-1d', TransferFunction1D);