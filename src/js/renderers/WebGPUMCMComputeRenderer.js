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
            value: new Uint8Array([0,0,0,0]),
        },
        {
            name: 'transferFunction2',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array([0,0,0,0]),
        },
        {
            name: 'transferFunction3',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array([0,0,0,0]),
        },
        {
            name: 'transferFunction4',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array([0,0,0,0]),
        },
        {
            name: 'transferFunction1D_1',
            label: 'Transfer function',
            type: 'transfer-function-1d',
            value: new Uint8Array([0,0,0,0]),
        }
        // {
        //     name: 'transferFunction5',
        //     label: 'Transfer function',
        //     type: 'transfer-function',
        //     value: new Uint8Array([0,0,0,0]),
        // },
        // {
        //     name: 'transferFunction6',
        //     label: 'Transfer function',
        //     type: 'transfer-function',
        //     value: new Uint8Array([0,0,0,0]),
        // },
        // {
        //     name: 'transferFunction7',
        //     label: 'Transfer function',
        //     type: 'transfer-function',
        //     value: new Uint8Array([0,0,0,0]),
        // },
        // {
        //     name: 'transferFunction8',
        //     label: 'Transfer function',
        //     type: 'transfer-function',
        //     value: new Uint8Array([0,0,0,0]),
        // },
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
        if (name === 'transferFunction1D_1') {
            this.setTransferFunction1D_1(this.transferFunction1D_1);
        }
        // if (name === 'transferFunction5') {
        //     this.setTransferFunction5(this.transferFunction5);
        // }
        // if (name === 'transferFunction6') {
        //     this.setTransferFunction6(this.transferFunction6);
        // }
        // if (name === 'transferFunction7') {
        //     this.setTransferFunction7(this.transferFunction7);
        // }
        // if (name === 'transferFunction8') {
        //     this.setTransferFunction8(this.transferFunction8);
        // }

        if ([
            'extinction',
            'anisotropy',
            'bounces',
            'transferFunction1',
            'transferFunction2',
            'transferFunction3',
            'transferFunction4',
            'transferFunction1D_1',
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

    this._visModeBuffer = device.createBuffer({
        size: 4,  // 4 bytes for a single u32
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    this._renderUniformBuffer = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this._renderBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "3d",
                    mulitsampled: false
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "3d",
                    mulitsampled: false
                }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 5,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 6,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 7,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 8,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 9,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 10,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 11,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 12,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 13,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 14,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 15,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 16,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 17,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 18,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 19,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 20,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 21,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 22,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform"
                }
            },
            {
                binding: 23,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "storage"
                }
            },
            {
                binding: 24,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: "write-only",
                    format: "rgba16float",
                    viewDimension: "2d"
                }
            },
        ]
    });
    this._renderBindGroupLayout1 = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform"
                }
            }
        ]
    });
    this._renderPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this._renderBindGroupLayout, this._renderBindGroupLayout1]
    });
    this._renderPipeline = device.createComputePipeline({
        label: "WebGPUMCMComputeRenderer render pipeline",
        layout: this._renderPipelineLayout,
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
        size: 128,
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
    var modelMatrix;
    if (!this._volume.length) {
        modelMatrix = this._volume.getModelMatrix();
    }
    else {
        modelMatrix = this._volume[0].getModelMatrix();
    }
    // const modelMatrix = this._volume.getModelMatrix();
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
    const modelMatrix = this._volume[0].getModelMatrix();
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
    device.queue.writeBuffer(this._visModeBuffer, 0, new Uint32Array([this._visMode]));

    const bindGroup = device.createBindGroup({
        layout: this._renderPipeline.getBindGroupLayout(0),
        entries: [ // TODO: Cleanup
            {
                binding: 0,
                resource: this._volume[0].getTexture().createView()
            },
            {
                binding: 1,
                resource: this._volume[0].getTextureSampler()
            },
            {
                binding: 2,
                resource: this._volume[1].getTexture().createView()
            },
            {
                binding: 3,
                resource: this._volume[1].getTextureSampler()
            },
            {
                binding: 4,
                resource: this._transferFunction1.createView()
            },
            {
                binding: 5,
                resource: this._transferFunctionSampler1
            },
            {
                binding: 6,
                resource: this._transferFunction2.createView()
            },
            {
                binding: 7,
                resource: this._transferFunctionSampler2
            },
            {
                binding: 8,
                resource: this._transferFunction3.createView()
            },
            {
                binding: 9,
                resource: this._transferFunctionSampler3
            },
            {
                binding: 10,
                resource: this._transferFunction4.createView()
            },
            {
                binding: 11,
                resource: this._transferFunctionSampler4
            },
            {
                binding: 12,
                resource: this._transferFunction5.createView()
            },
            {
                binding: 13,
                resource: this._transferFunctionSampler5
            },
            {
                binding: 14,
                resource: this._transferFunction6.createView()
            },
            {
                binding: 15,
                resource: this._transferFunctionSampler6
            },
            {
                binding: 16,
                resource: this._transferFunction7.createView()
            },
            {
                binding: 17,
                resource: this._transferFunctionSampler7
            },
            {
                binding: 18,
                resource: this._transferFunction8.createView()
            },
            {
                binding: 19,
                resource: this._transferFunctionSampler8
            },
            {
                binding: 20,
                resource: this._environment.texture.createView()
            },
            {
                binding: 21,
                resource: this._environment.sampler
            },
            {
                binding: 22,
                resource: { buffer: this._renderUniformBuffer }
            },
            {
                binding: 23,
                resource: { buffer: this._photonBuffer }
            },
            {
                binding: 24,
                resource: this._renderBuffer.getAttachments()[0].texture.createView(),
            }
        ]
    });

    const bindGroup1 = device.createBindGroup({
        label: 'generate bind group 1',
        layout: this._renderPipeline.getBindGroupLayout(1),
        entries: [
            {
                binding: 0,
                resource: { buffer: this._visModeBuffer }
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._renderPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setBindGroup(1, bindGroup1);
    // console.log(this._getWorkgroupCount());
    pass.dispatchWorkgroups(...this._getWorkgroupCount());
    pass.end();
    device.queue.submit([encoder.finish()]);
}

}
