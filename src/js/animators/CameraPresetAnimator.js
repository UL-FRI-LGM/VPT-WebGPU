import { mat4, vec3 } from '../../lib/gl-matrix-module.js';
import { centerModelMatrix } from '../WebGPUVolume.js';

function rotatedModelMatrix(angleX, angleY, angleZ, scaleX, scaleY, scaleZ) {
    const DEG_TO_RAD = Math.PI / 180;

    const m = mat4.create();
    if (angleX !== undefined) {
        mat4.rotateX(m, m, angleX * DEG_TO_RAD);
    }
    if (angleY !== undefined) {
        mat4.rotateY(m, m, angleY * DEG_TO_RAD);
    }
    if (angleZ !== undefined) {
        mat4.rotateZ(m, m, angleZ * DEG_TO_RAD);
    }
    if (scaleX !== undefined || scaleY !== undefined || scaleZ !== undefined) {
        mat4.scale(m, m, [scaleX ?? 1, scaleY ?? 1, scaleZ ?? 1]);
    }
    return centerModelMatrix(m);
}

const CAMERA_PRESETS = {
    front: {
        yaw: (t) => 2.1999999999999957,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.0337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    back: {
        yaw: (t) => 1.1999999999999957,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.0337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    oscillate: {
        yaw: (t) => 2.1999999999999957 + Math.sin(t / 1000) / 5,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.0337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable: {
        yaw: (t) => 2.1999999999999957 + t / 2000,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_0: {
        yaw: (t) => 2.1999999999999957,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_30: {
        yaw: (t) => 2.1999999999999957 + 1 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_60: {
        yaw: (t) => 2.1999999999999957 + 2 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_90: {
        yaw: (t) => 2.1999999999999957 + 3 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_120: {
        yaw: (t) => 2.1999999999999957 + 4 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_150: {
        yaw: (t) => 2.1999999999999957 + 5 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_180: {
        yaw: (t) => 2.1999999999999957 + 6 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_210: {
        yaw: (t) => 2.1999999999999957 + 7 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_240: {
        yaw: (t) => 2.1999999999999957 + 8 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_270: {
        yaw: (t) => 2.1999999999999957 + 9 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_300: {
        yaw: (t) => 2.1999999999999957 + 10 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    turntable_330: {
        yaw: (t) => 2.1999999999999957 + 11 * Math.PI / 6,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    insides: {
        yaw: (t) => 25.14194999999925,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    head: {
        yaw: (t) => 34.424149999998505,
        pitch: (t) => -0.14,
        focus: (t) => [ -0.06036277860403061, 0.01638137176632881, -0.06459356099367142 ],
        focusDistance: (t) => 1.1337026689833984,
        modelMatrix: rotatedModelMatrix(0, 0, 180),
    },
    front_heptane: {
        yaw: (t) => 0.5049999999998507,
        pitch: (t) => -0.4350000000000004,
        focus: (t) => [ -0.038775622844696045, -0.01985437050461769, -0.049268536269664764 ],
        focusDistance: (t) => 1.2562702103792711,
        modelMatrix: rotatedModelMatrix(0, 0, 0),
    },
    turntable_heptane: {
        yaw: (t) => 0.5049999999998507 + t / 2000,
        pitch: (t) => -0.4350000000000004,
        focus: (t) => [ -0.038775622844696045, -0.01985437050461769, -0.049268536269664764 ],
        focusDistance: (t) => 1.2562702103792711,
        modelMatrix: rotatedModelMatrix(0, 0, 0),
    },
    front_neurons: {
        yaw: (t) => 2.6649999999997753,
        pitch: (t) => 0.3600000000000016,
        focus: (t) => [ 0.1733391135931015, -0.7541943192481995, 0.06944463402032852 ],
        focusDistance: (t) => 2.909982829236379,
        modelMatrix: rotatedModelMatrix(0, 0, 0, 5, 5, 2),
    },
    turntable_neurons: {
        yaw: (t) => 2.6649999999997753 + t / 2000,
        pitch: (t) => 0.3600000000000016,
        focus: (t) => [ 0.1733391135931015, -0.7541943192481995, 0.06944463402032852 ],
        focusDistance: (t) => 2.909982829236379,
        modelMatrix: rotatedModelMatrix(0, 0, 0, 5, 5, 2),
    },
    front_frog: {
        yaw: (t) => 3.959999999999628,
        pitch: (t) => -0.5000000000000003,
        focus: (t) => [ -0.09150969982147217, 0.057108305394649506, 0.019231850281357765 ],
        focusDistance: (t) => 2.5809232417457753,
        modelMatrix: rotatedModelMatrix(90, 0, 0, 3, 3, 1),
    },
    turntable_frog: {
        yaw: (t) => 3.959999999999628 + t / 2000,
        pitch: (t) => -0.5000000000000003,
        focus: (t) => [ -0.09150969982147217, 0.057108305394649506, 0.019231850281357765 ],
        focusDistance: (t) => 2.5809232417457753,
        modelMatrix: rotatedModelMatrix(90, 0, 0, 3, 3, 1),
    },
    front_mri_ventricles: {
        yaw: (t) => 2.7549999999998143,
        pitch: (t) => 0.16000000000000023,
        focus: (t) => [ 0.12144546955823898, 0.12675130367279053, 0.019524328410625458 ],
        focusDistance: (t) => 1.88352906716849,
        modelMatrix: rotatedModelMatrix(0, 0, 0, 2, 2, 1),
    },
    turntable_mri_ventricles: {
        yaw: (t) => 2.7549999999998143 + t / 2000,
        pitch: (t) => 0.16000000000000023,
        focus: (t) => [ 0.12144546955823898, 0.12675130367279053, 0.019524328410625458 ],
        focusDistance: (t) => 1.88352906716849,
        modelMatrix: rotatedModelMatrix(0, 0, 0, 2, 2, 1),
    },
    front_silicium: {
        yaw: (t) => 0.579999999999874,
        pitch: (t) => -0.5749999999999986,
        focus: (t) => [ 0.04848085716366768, 0.00587119348347187, 0.03379536792635918 ],
        focusDistance: (t) => 1.645669316112017,
        modelMatrix: rotatedModelMatrix(0, 0, 0, 2, 1, 1),
    },
    turntable_silicium: {
        yaw: (t) => 0.579999999999874 + t / 2000,
        pitch: (t) => -0.5749999999999986,
        focus: (t) => [ 0.04848085716366768, 0.00587119348347187, 0.03379536792635918 ],
        focusDistance: (t) => 1.645669316112017,
        modelMatrix: rotatedModelMatrix(0, 0, 0, 2, 1, 1),
    },
    front_vismale: {
        yaw: (t) => 1.0499999999998533,
        pitch: (t) => -0.3007963267949054,
        focus: (t) => [ 0.13349512219429016, -0.2837158143520355, -0.39784160256385803 ],
        focusDistance: (t) => 5.145626757176621,
        modelMatrix: rotatedModelMatrix(90, 0, 0, 3, 3, 4),
    },
    turntable_vismale: {
        yaw: (t) => 1.0499999999998533 + t / 2000,
        pitch: (t) => -0.3007963267949054,
        focus: (t) => [ 0.13349512219429016, -0.2837158143520355, -0.39784160256385803 ],
        focusDistance: (t) => 5.145626757176621,
        modelMatrix: rotatedModelMatrix(90, 0, 0, 3, 3, 4),
    },
    front_miranda: {
        yaw: (t) => 0.7850000000000081,
        pitch: (t) => 0.32079632679490794,
        focus: (t) => [ -0.009284207597374916, 0.15232543647289276, -0.09384680539369583 ],
        focusDistance: (t) => 1.526758988673696,
        modelMatrix: rotatedModelMatrix(90, 0, 0, 1, 1, 1),
    },
    turntable_miranda: {
        yaw: (t) => 0.7850000000000081 + t / 2000,
        pitch: (t) => 0.32079632679490794,
        focus: (t) => [ -0.009284207597374916, 0.15232543647289276, -0.09384680539369583 ],
        focusDistance: (t) => 1.526758988673696,
        modelMatrix: rotatedModelMatrix(90, 0, 0, 1, 1, 1),
    },
    front_bonsai: {
        yaw: (t) => 1.2599999999999731,
        pitch: (t) => -0.2650000000000001,
        focus: (t) => [ -0.0432717502117157, -0.12075801938772202, -0.047777704894542694 ],
        focusDistance: (t) => 1.08128179061863,
        modelMatrix: rotatedModelMatrix(180, 0, 0, 1, 1, 1),
    },
    turntable_bonsai: {
        yaw: (t) => 1.2599999999999731 + t / 2000,
        pitch: (t) => -0.2650000000000001,
        focus: (t) => [ -0.0432717502117157, -0.12075801938772202, -0.047777704894542694 ],
        focusDistance: (t) => 1.08128179061863,
        modelMatrix: rotatedModelMatrix(180, 0, 0, 1, 1, 1),
    },
};

export class CameraPresetAnimator {

    constructor(orbit, volume) {
        this.orbit = orbit;
        this.camera = orbit._camera;
        this.volume = volume;
        this.preset = undefined;
        this.animationTime = 0;

        this.orbitPrevYaw = undefined;
        this.orbitPrevPitch = undefined;
        this.orbitPrevFocus = undefined;
        this.orbitPrevFocusDistance = undefined;
        this.volumePrevMatrix = undefined;
    }

    setPreset(name) {
        if (!(name in CAMERA_PRESETS)) {
            if (this.orbitPrevYaw !== undefined) {
                this.orbit._yaw = this.orbitPrevYaw;
                this.orbitPrevYaw = undefined;
            }
            if (this.orbitPrevPitch !== undefined) {
                this.orbit._pitch = this.orbitPrevPitch;
                this.orbitPrevPitch = undefined;
            }
            if (this.orbitPrevFocus !== undefined) {
                this.orbit._focus = this.orbitPrevFocus;
                this.orbitPrevFocus = undefined;
            }
            if (this.orbitPrevFocusDistance !== undefined) {
                this.orbit._focusDistance = this.orbitPrevFocusDistance;
                this.orbitPrevFocusDistance = undefined;
            }
            if (this.volumePrevMatrix !== undefined) {
                this.volume.modelMatrix = this.volumePrevMatrix;
                this.volumePrevMatrix = undefined;
            }
            this.preset = undefined;
            this.orbit._updateCamera();
            return;
        }

        if (this.preset == undefined) {
            this.orbitPrevYaw = this.orbit._yaw;
            this.orbitPrevPitch = this.orbit._pitch;
            this.orbitPrevFocus = this.orbit._focus;
            this.orbitPrevFocusDistance = this.orbit._focusDistance;
            this.volumePrevMatrix = this.volume.modelMatrix;
        }

        this.preset = CAMERA_PRESETS[name];
    }

    reset() {
        this.animationTime = undefined;
    }

    update() {
        if (this.preset == undefined) {
            return;
        }

        if (this.animationTime == undefined) {
            this.animationTime = performance.now();
        }

        const t = performance.now() - this.animationTime;
        let change = false;

        const yaw = this.preset.yaw(t);
        if (this.orbit._yaw !== yaw) {
            this.orbit._yaw = yaw;
            change = true;
        }
        const pitch = this.preset.pitch(t);
        if (this.orbit._pitch !== pitch) {
            this.orbit._pitch = pitch;
            change = true;
        }
        const focus = this.preset.focus(t);
        if (!equalArrays(this.orbit._focus, focus)) {
            this.orbit._focus = vec3.clone(focus);
            change = true;
        }
        const focusDistance = this.preset.focusDistance(t);
        if (this.orbit._focusDistance !== focusDistance) {
            this.orbit._focusDistance = focusDistance;
            change = true;
        }

        if (!equalArrays(this.volume.modelMatrix, this.preset.modelMatrix)) {
            this.volume.modelMatrix = this.preset.modelMatrix;
            change = true;
        }

        if (change) {
            this.orbit._updateCamera();
        }
    }
}

function equalArrays(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
