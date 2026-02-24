import { mat4, vec3 } from '../../lib/gl-matrix-module.js';
import { centerModelMatrix } from '../WebGPUVolume.js';

function rotatedModelMatrix(angleX, angleY, angleZ) {
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
    return centerModelMatrix(m);
}

const CAMERA_PRESETS = {
    static: {
        yaw: (t) => 2.1999999999999957,
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
