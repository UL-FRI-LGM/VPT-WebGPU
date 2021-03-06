// #part /js/dialogs/tonemappers/RangeToneMapperDialog

// #link ../AbstractDialog

// #link /uispecs/tonemappers/RangeToneMapperDialog

class RangeToneMapperDialog extends AbstractDialog {

constructor(toneMapper, options) {
    super(UISPECS.tonemappers.RangeToneMapperDialog, options);

    this._toneMapper = toneMapper;

    this._handleChange = this._handleChange.bind(this);

    this._binds.low.addEventListener('input', this._handleChange);
    this._binds.high.addEventListener('input', this._handleChange);
}

_handleChange() {
    this._toneMapper._min = this._binds.low.getValue();
    this._toneMapper._max = this._binds.high.getValue();
}

}
