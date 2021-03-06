// #part /js/dialogs/renderers/EAMRendererDialog

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
