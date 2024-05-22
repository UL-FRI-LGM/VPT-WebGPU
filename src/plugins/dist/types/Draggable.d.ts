export class Draggable {
    constructor(element: any, handle: any);
    _handlePointerDown(e: any): void;
    _handlePointerUp(e: any): void;
    _handlePointerMove(e: any): void;
    _element: any;
    _handle: any;
    _startX: number;
    _startY: number;
}
