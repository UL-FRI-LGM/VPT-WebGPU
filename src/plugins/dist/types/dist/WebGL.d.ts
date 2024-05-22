export class WebGL {
    static createShader(gl: any, source: any, type: any): any;
    static createProgram(gl: any, shaders: any): {
        program: any;
        attributes: {};
        uniforms: {};
    };
    static buildPrograms(gl: any, shaders: any, mixins: any): {};
    static createTexture(gl: any, { texture, unit, target, level, iformat, format, type, image, data, width, height, wrapS, wrapT, wrapR, min, mag, mip, }: {
        texture?: any;
        unit: any;
        target?: any;
        level?: number | undefined;
        iformat?: any;
        format?: any;
        type?: any;
        image: any;
        data: any;
        width: any;
        height: any;
        wrapS: any;
        wrapT: any;
        wrapR: any;
        min: any;
        mag: any;
        mip: any;
    }): any;
    static createFramebuffer(gl: any, attachments: any): any;
    static createBuffer(gl: any, { buffer, target, hint, data, }: {
        buffer?: any;
        target?: any;
        hint?: any;
        data: any;
    }): any;
    static createSampler(gl: any, { sampler, wrapS, wrapT, wrapR, min, mag, }: {
        sampler?: any;
        wrapS: any;
        wrapT: any;
        wrapR: any;
        min: any;
        mag: any;
    }): any;
    static configureAttribute(gl: any, { location, count, type, normalize, stride, offset, divisor, }: {
        location: any;
        count: any;
        type: any;
        normalize?: boolean | undefined;
        stride?: number | undefined;
        offset?: number | undefined;
        divisor?: number | undefined;
    }): void;
}
