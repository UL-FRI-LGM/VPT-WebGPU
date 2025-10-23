import { mat4 } from '../../lib/gl-matrix-module.js';

import { WebGPU } from '../WebGPU.js';
import { WebGPUAbstractComputeRenderer } from './WebGPUAbstractComputeRenderer.js';

import { PerspectiveCamera } from '../PerspectiveCamera.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPUMCMComputeRenderer extends WebGPUAbstractComputeRenderer {

constructor(device, volume, camera, environment, options = {}) {
    super(device, volume, camera, environment, options);

    this.registerProperties([
        {
            name: 'extinction',
            label: 'Extinction',
            type: 'spinner',
            value: 1,
            min: 0,
        },
        {
            name: 'anisotropy',
            label: 'Anisotropy',
            type: 'slider',
            value: 0,
            min: -1,
            max: 1,
        },
        {
            name: 'bounces',
            label: 'Max bounces',
            type: 'spinner',
            value: 8,
            min: 0,
        },
        {
            name: 'steps',
            label: 'Steps',
            type: 'spinner',
            value: 8,
            min: 0,
        },
        {
            name: 'transferFunction1',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array(256),
        },
        {
            name: 'transferFunction2',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array(256),
        },
        {
            name: 'transferFunction3',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array(256),
        },
        {
            name: 'transferFunction4',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array(256),
        },
    ]);

    this.addEventListener('change', e => {
        const { name, value } = e.detail;

        if (name === 'transferFunction1') {
            this.setTransferFunction1(this.transferFunction1);
        }
        if (name === 'transferFunction2') {
            this.setTransferFunction2(this.transferFunction2);
        }
        if (name === 'transferFunction3') {
            this.setTransferFunction3(this.transferFunction3);
        }
        if (name === 'transferFunction4') {
            this.setTransferFunction4(this.transferFunction4);
        }

        if ([
            'extinction',
            'anisotropy',
            'bounces',
            'transferFunction1',
            'transferFunction2',
            'transferFunction3',
            'transferFunction4',
        ].includes(name)) {
            this.reset();
        }
    });

    this._programs = WebGPU.buildShaderModules(device, SHADERS.renderers.MCMCompute, MIXINS);

    // TODO: Define all buffer sizes in one place

    const photonSize = 64; // Photon.wgsl
    this._photonBuffer = device.createBuffer({
        size: this._resolution * this._resolution * photonSize,
        usage: GPUBufferUsage.STORAGE
    });

    
    this._renderUniformBuffer = device.createBuffer({
        size: 96,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this._renderPipeline = device.createComputePipeline({
        label: "WebGPUMCMComputeRenderer render pipeline",
        layout: "auto",
        compute: {
            module: this._programs.render,
            entryPoint: "compute_main",
            constants: {
                WORKGROUP_SIZE_X: this._workgroup_size[0],
                WORKGROUP_SIZE_Y: this._workgroup_size[1]
            }
        }
    });

    
    this._resetUniformBuffer = device.createBuffer({
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this._resetPipeline = device.createComputePipeline({
        label: "WebGPUMCMComputeRenderer reset pipeline",
        layout: "auto",
        compute: {
            module: this._programs.reset,
            entryPoint: "compute_main",
            constants: {
                WORKGROUP_SIZE_X: this._workgroup_size[0],
                WORKGROUP_SIZE_Y: this._workgroup_size[1]
            }
        }
    });
}

destroy() {
    this._photonBuffer.destroy();

    super.destroy();
}

_resetFrame() {
    const device = this._device;

    // TODO: get model matrix from volume
    const modelMatrix = this._volume.getModelMatrix();
    const viewMatrix = this._camera.transform.inverseGlobalMatrix;
    const projectionMatrix = this._camera.getComponent(PerspectiveCamera).projectionMatrix;

    const matrix = mat4.create();
    mat4.multiply(matrix, modelMatrix, matrix);
    mat4.multiply(matrix, viewMatrix, matrix);
    mat4.multiply(matrix, projectionMatrix, matrix);
    mat4.invert(matrix, matrix);

    device.queue.writeBuffer(this._resetUniformBuffer, 0, matrix); // uniforms.mvpInverseMatrix
    device.queue.writeBuffer(this._resetUniformBuffer, 64, new Float32Array([
        1 / this._resolution, 1 / this._resolution, // uniforms.inverseResolution
        Math.random(),                              // uniforms.randSeed
        0,                                          // uniforms.blur
    ]));

    const bindGroup = device.createBindGroup({
        layout: this._resetPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: { buffer: this._resetUniformBuffer }
            },
            {
                binding: 1,
                resource: { buffer: this._photonBuffer }
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._resetPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(...this._getWorkgroupCount());
    pass.end();
    device.queue.submit([encoder.finish()]);
}

_renderFrame() {
    const device = this._device;

    // TODO: get model matrix from volume
    const modelMatrix = this._volume.getModelMatrix();
    const viewMatrix = this._camera.transform.inverseGlobalMatrix;
    const projectionMatrix = this._camera.getComponent(PerspectiveCamera).projectionMatrix;

    const matrix = mat4.create();
    mat4.multiply(matrix, modelMatrix, matrix);
    mat4.multiply(matrix, viewMatrix, matrix);
    mat4.multiply(matrix, projectionMatrix, matrix);
    mat4.invert(matrix, matrix);

    device.queue.writeBuffer(this._renderUniformBuffer, 0, matrix);
    device.queue.writeBuffer(this._renderUniformBuffer, 64, new Float32Array([
        1 / this._resolution, 1 / this._resolution, // uniforms.inverseResolution
        Math.random(),                              // uniforms.randSeed
        0,                                          // uniforms.blur
        this.extinction,                            // uniforms.extinction
        this.anisotropy,                            // uniforms.anisotropy
    ]));
    device.queue.writeBuffer(this._renderUniformBuffer, 88, new Uint32Array([
        this.bounces,                               // uniforms.bounces
        this.steps                                  // uniforms.steps
    ]));

    const bindGroup = device.createBindGroup({
        layout: this._renderPipeline.getBindGroupLayout(0),
        entries: [ // TODO: Cleanup
            {
                binding: 0,
                resource: this._volume.getTexture().createView()
            },
            {
                binding: 1,
                resource: this._volume.getTextureSampler()
            },
            {
                binding: 2,
                resource: this._transferFunction1.createView()
            },
            {
                binding: 3,
                resource: this._transferFunctionSampler1
            },
            {
                binding: 4,
                resource: this._transferFunction2.createView()
            },
            {
                binding: 5,
                resource: this._transferFunctionSampler2
            },
            {
                binding: 6,
                resource: this._transferFunction3.createView()
            },
            {
                binding: 7,
                resource: this._transferFunctionSampler3
            },
            {
                binding: 8,
                resource: this._transferFunction4.createView()
            },
            {
                binding: 9,
                resource: this._transferFunctionSampler4
            },
            {
                binding: 10,
                resource: this._environment.texture.createView()
            },
            {
                binding: 11,
                resource: this._environment.sampler
            },
            {
                binding: 12,
                resource: { buffer: this._renderUniformBuffer }
            },
            {
                binding: 13,
                resource: { buffer: this._photonBuffer }
            },
            {
                binding: 14,
                resource: this._renderBuffer.getAttachments()[0].texture.createView(),
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._renderPipeline);
    pass.setBindGroup(0, bindGroup);
    console.log(this._getWorkgroupCount());
    pass.dispatchWorkgroups(...this._getWorkgroupCount());
    pass.end();
    device.queue.submit([encoder.finish()]);
}

}
