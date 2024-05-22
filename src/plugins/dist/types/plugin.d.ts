import { BaseInputParams, InputBindingPlugin } from '@tweakpane/core';
export interface CanvasInputParams extends BaseInputParams {
    view: 'canvas-pane';
    bumps?: String;
}
export declare const CanvasPanePlugin: InputBindingPlugin<String, String, CanvasInputParams>;
