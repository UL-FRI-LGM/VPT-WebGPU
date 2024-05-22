import { Value, View, ViewProps } from '@tweakpane/core';
interface Config {
    value: Value<String>;
    viewProps: ViewProps;
}
export declare class PluginView implements View {
    readonly element: HTMLElement;
    private value_;
    private dotElems_;
    private _program;
    private document;
    private scaleSpeed;
    private canvasDiv;
    constructor(doc: Document, config: Config);
    private refresh_;
    private onValueChange_;
}
export {};
