export class CommonUtils {
    static downloadJSON(json: any, filename: any): void;
    static readTextFile(onLoad: any, onError: any): void;
    static bind(object: any, { prefix, suffix }?: {
        prefix?: string | undefined;
        suffix?: string | undefined;
    }): void;
    static hex2rgb(str: any): number[];
    static rgb2hex(rgb: any): string;
    static clamp(x: any, min: any, max: any): number;
    static lerp(a: any, b: any, x: any): any;
    static step(edge: any, x: any): 0 | 1;
    static linstep(edge0: any, edge1: any, x: any): number;
    static smoothstep(edge0: any, edge1: any, x: any): number;
    static smootherstep(edge0: any, edge1: any, x: any): number;
}
