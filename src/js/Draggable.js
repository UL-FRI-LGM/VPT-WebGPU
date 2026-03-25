export class Draggable {

constructor(element, handle) {
    this._handlePointerDown = this._handlePointerDown.bind(this);
    this._handlePointerUp = this._handlePointerUp.bind(this);
    this._handlePointerMove = this._handlePointerMove.bind(this);

    this._element = element;
    this._handle = handle;
    this._startX = 0;
    this._startY = 0;

    this._handle.addEventListener('pointerdown', this._handlePointerDown);
    // console.log(this._element);
    // console.log(this._handle);
}

_handlePointerDown(e) {
    this._startX = e.pageX;
    this._startY = e.pageY;

    document.addEventListener('pointermove', this._handlePointerMove);
    document.addEventListener('pointerup', this._handlePointerUp);
    this._handle.removeEventListener('pointerdown', this._handlePointerDown);

    const event = new CustomEvent('draggablestart', {
        detail: {
            x: this._startX,
            y: this._startY
        }
    });
    this._element.dispatchEvent(event);
}

_handlePointerUp(e) {
    document.removeEventListener('pointermove', this._handlePointerMove);
    document.removeEventListener('pointerup', this._handlePointerUp);
    this._handle.addEventListener('pointerdown', this._handlePointerDown);

    const event = new CustomEvent('draggableend', {
        detail: {
            x: this._startX,
            y: this._startY
        }
    });
    this._element.dispatchEvent(event);
}

_handlePointerMove(e) {
    // console.log(e);
    // console.log(this._element);
    // console.log(this._handle);
    const dx = e.pageX - this._startX;
    const dy = e.pageY - this._startY;
    const x = this._element.offsetLeft;
    const y = this._element.offsetTop;
    const pw = this._element.parentNode.offsetWidth;
    const ph = this._element.parentNode.offsetHeight;
    const newx = Math.min(Math.max(x + dx, 0), pw);
    let newy = 0;
    if (this._handle.classList.contains('bump-handle1D'))
        newy = ph / 2;// Math.min(Math.max(y + dy, 0), ph);
    else
        newy = Math.min(Math.max(y + dy, 0), ph);
    // console.log(newy);
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
