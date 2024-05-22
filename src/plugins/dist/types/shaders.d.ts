export namespace SHADERS {
    namespace TransferFunction {
        const vertex: string;
        const fragment: string;
    }
    namespace average {
        const vertex_1: string;
        export { vertex_1 as vertex };
        const fragment_1: string;
        export { fragment_1 as fragment };
    }
    namespace quad {
        const vertex_2: string;
        export { vertex_2 as vertex };
        const fragment_2: string;
        export { fragment_2 as fragment };
    }
    namespace renderers {
        namespace DOS {
            namespace integrate {
                const vertex_3: string;
                export { vertex_3 as vertex };
                const fragment_3: string;
                export { fragment_3 as fragment };
            }
            namespace render {
                const vertex_4: string;
                export { vertex_4 as vertex };
                const fragment_4: string;
                export { fragment_4 as fragment };
            }
            namespace reset {
                const vertex_5: string;
                export { vertex_5 as vertex };
                const fragment_5: string;
                export { fragment_5 as fragment };
            }
        }
        namespace EAM {
            export namespace generate {
                const vertex_6: string;
                export { vertex_6 as vertex };
                const fragment_6: string;
                export { fragment_6 as fragment };
            }
            export namespace integrate_1 {
                const vertex_7: string;
                export { vertex_7 as vertex };
                const fragment_7: string;
                export { fragment_7 as fragment };
            }
            export { integrate_1 as integrate };
            export namespace render_1 {
                const vertex_8: string;
                export { vertex_8 as vertex };
                const fragment_8: string;
                export { fragment_8 as fragment };
            }
            export { render_1 as render };
            export namespace reset_1 {
                const vertex_9: string;
                export { vertex_9 as vertex };
                const fragment_9: string;
                export { fragment_9 as fragment };
            }
            export { reset_1 as reset };
        }
        namespace ISO {
            export namespace generate_1 {
                const vertex_10: string;
                export { vertex_10 as vertex };
                const fragment_10: string;
                export { fragment_10 as fragment };
            }
            export { generate_1 as generate };
            export namespace integrate_2 {
                const vertex_11: string;
                export { vertex_11 as vertex };
                const fragment_11: string;
                export { fragment_11 as fragment };
            }
            export { integrate_2 as integrate };
            export namespace render_2 {
                const vertex_12: string;
                export { vertex_12 as vertex };
                const fragment_12: string;
                export { fragment_12 as fragment };
            }
            export { render_2 as render };
            export namespace reset_2 {
                const vertex_13: string;
                export { vertex_13 as vertex };
                const fragment_13: string;
                export { fragment_13 as fragment };
            }
            export { reset_2 as reset };
        }
        namespace LAO {
            export namespace generate_2 {
                const vertex_14: string;
                export { vertex_14 as vertex };
                const fragment_14: string;
                export { fragment_14 as fragment };
            }
            export { generate_2 as generate };
            export namespace integrate_3 {
                const vertex_15: string;
                export { vertex_15 as vertex };
                const fragment_15: string;
                export { fragment_15 as fragment };
            }
            export { integrate_3 as integrate };
            export namespace render_3 {
                const vertex_16: string;
                export { vertex_16 as vertex };
                const fragment_16: string;
                export { fragment_16 as fragment };
            }
            export { render_3 as render };
            export namespace reset_3 {
                const vertex_17: string;
                export { vertex_17 as vertex };
                const fragment_17: string;
                export { fragment_17 as fragment };
            }
            export { reset_3 as reset };
        }
        namespace MCM {
            export namespace integrate_4 {
                const vertex_18: string;
                export { vertex_18 as vertex };
                const fragment_18: string;
                export { fragment_18 as fragment };
            }
            export { integrate_4 as integrate };
            export namespace render_4 {
                const vertex_19: string;
                export { vertex_19 as vertex };
                const fragment_19: string;
                export { fragment_19 as fragment };
            }
            export { render_4 as render };
            export namespace reset_4 {
                const vertex_20: string;
                export { vertex_20 as vertex };
                const fragment_20: string;
                export { fragment_20 as fragment };
            }
            export { reset_4 as reset };
        }
        namespace MCS {
            export namespace generate_3 {
                const vertex_21: string;
                export { vertex_21 as vertex };
                const fragment_21: string;
                export { fragment_21 as fragment };
            }
            export { generate_3 as generate };
            export namespace integrate_5 {
                const vertex_22: string;
                export { vertex_22 as vertex };
                const fragment_22: string;
                export { fragment_22 as fragment };
            }
            export { integrate_5 as integrate };
            export namespace render_5 {
                const vertex_23: string;
                export { vertex_23 as vertex };
                const fragment_23: string;
                export { fragment_23 as fragment };
            }
            export { render_5 as render };
            export namespace reset_5 {
                const vertex_24: string;
                export { vertex_24 as vertex };
                const fragment_24: string;
                export { fragment_24 as fragment };
            }
            export { reset_5 as reset };
        }
        namespace MIP {
            export namespace generate_4 {
                const vertex_25: string;
                export { vertex_25 as vertex };
                const fragment_25: string;
                export { fragment_25 as fragment };
            }
            export { generate_4 as generate };
            export namespace integrate_6 {
                const vertex_26: string;
                export { vertex_26 as vertex };
                const fragment_26: string;
                export { fragment_26 as fragment };
            }
            export { integrate_6 as integrate };
            export namespace render_6 {
                const vertex_27: string;
                export { vertex_27 as vertex };
                const fragment_27: string;
                export { fragment_27 as fragment };
            }
            export { render_6 as render };
            export namespace reset_6 {
                const vertex_28: string;
                export { vertex_28 as vertex };
                const fragment_28: string;
                export { fragment_28 as fragment };
            }
            export { reset_6 as reset };
        }
    }
    namespace test {
        const vertex_29: string;
        export { vertex_29 as vertex };
        const fragment_29: string;
        export { fragment_29 as fragment };
    }
    namespace tonemappers {
        namespace AcesToneMapper {
            const vertex_30: string;
            export { vertex_30 as vertex };
            const fragment_30: string;
            export { fragment_30 as fragment };
        }
        namespace ArtisticToneMapper {
            const vertex_31: string;
            export { vertex_31 as vertex };
            const fragment_31: string;
            export { fragment_31 as fragment };
        }
        namespace FilmicToneMapper {
            const vertex_32: string;
            export { vertex_32 as vertex };
            const fragment_32: string;
            export { fragment_32 as fragment };
        }
        namespace LottesToneMapper {
            const vertex_33: string;
            export { vertex_33 as vertex };
            const fragment_33: string;
            export { fragment_33 as fragment };
        }
        namespace RangeToneMapper {
            const vertex_34: string;
            export { vertex_34 as vertex };
            const fragment_34: string;
            export { fragment_34 as fragment };
        }
        namespace Reinhard2ToneMapper {
            const vertex_35: string;
            export { vertex_35 as vertex };
            const fragment_35: string;
            export { fragment_35 as fragment };
        }
        namespace ReinhardToneMapper {
            const vertex_36: string;
            export { vertex_36 as vertex };
            const fragment_36: string;
            export { fragment_36 as fragment };
        }
        namespace UchimuraToneMapper {
            const vertex_37: string;
            export { vertex_37 as vertex };
            const fragment_37: string;
            export { fragment_37 as fragment };
        }
        namespace Uncharted2ToneMapper {
            const vertex_38: string;
            export { vertex_38 as vertex };
            const fragment_38: string;
            export { fragment_38 as fragment };
        }
        namespace UnrealToneMapper {
            const vertex_39: string;
            export { vertex_39 as vertex };
            const fragment_39: string;
            export { fragment_39 as fragment };
        }
    }
}
