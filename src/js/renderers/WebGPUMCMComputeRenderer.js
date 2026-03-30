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
            name: 'transferFunction1D_1',
            label: 'Transfer function',
            type: 'transfer-function-1d',
            value: new Uint8Array([0,0,0,0]),
        },
        {
            name: 'transferFunction1D_2',
            label: 'Transfer function',
            type: 'transfer-function-1d',
            value: new Uint8Array([0,0,0,0]),
        },
        {
            name: 'transferFunction1D_3',
            label: 'Transfer function',
            type: 'transfer-function-1d',
            value: new Uint8Array([0,0,0,0]),
        },
        {
            name: 'transferFunction1D_4',
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
        if (name === 'transferFunction1D_1') {
            this.setTransferFunction1D_1(this.transferFunction1D_1);
        }
        if (name === 'transferFunction1D_2') {
            this.setTransferFunction1D_2(this.transferFunction1D_2);
        }
        if (name === 'transferFunction1D_3') {
            this.setTransferFunction1D_3(this.transferFunction1D_3);
        }
        if (name === 'transferFunction1D_4') {
            this.setTransferFunction1D_4(this.transferFunction1D_4);
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
            'transferFunction1D_1',
            'transferFunction1D_2',
            'transferFunction1D_3',
            'transferFunction1D_4',
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

    this._cutPlaneBuffer = device.createBuffer({
        size: 32,
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
            // {
            //     binding: 14,
            //     visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
            //     texture: {
            //         sampleType: "float",
            //         viewDimension: "2d",
            //         mulitsampled: false
            //     }
            // },
            // {
            //     binding: 15,
            //     visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
            //     sampler: {
            //         type: "filtering"
            //     }
            // },
            // {
            //     binding: 16,
            //     visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
            //     texture: {
            //         sampleType: "float",
            //         viewDimension: "2d",
            //         mulitsampled: false
            //     }
            // },
            // {
            //     binding: 17,
            //     visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
            //     sampler: {
            //         type: "filtering"
            //     }
            // },
            // {
            //     binding: 18,
            //     visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
            //     texture: {
            //         sampleType: "float",
            //         viewDimension: "2d",
            //         mulitsampled: false
            //     }
            // },
            // {
            //     binding: 19,
            //     visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
            //     sampler: {
            //         type: "filtering"
            //     }
            // },
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
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform"
                }
            },
            {
                binding: 17,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "storage"
                }
            },
            {
                binding: 18,
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
                visibility: GPUShaderStage.COMPUTE,
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
    this._resetBindGroupLayout0 = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform"
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "storage"
                }
            }
        ]
    });
     this._resetBindGroupLayout1 = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform"
                }
            }
        ]
    });


    this._resetPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this._resetBindGroupLayout0, this._resetBindGroupLayout1]
    });
    
    this._resetPipeline = device.createComputePipeline({
        label: "WebGPUMCMComputeRenderer reset pipeline",
        layout: this._resetPipelineLayout,
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
    device.queue.writeBuffer(this._cutPlaneBuffer, 0, new Float32Array(this._minCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 12, new Float32Array([this._viewCutDistance]));
    device.queue.writeBuffer(this._cutPlaneBuffer, 16, new Float32Array(this._maxCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 28, new Uint32Array([this._visMode]));
    // device.queue.writeBuffer(this._cutPlaneBuffer, 0, new Float32Array([this._minCutPlane]));
    // device.queue.writeBuffer(this._cutPlaneBuffer, 16, new Float32Array([this._maxCutPlane]));
    // device.queue.writeBuffer(this._cutPlaneBuffer, 28, new Float32Array([this._viewCutDistance]));

    const bindGroup0 = device.createBindGroup({
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
    const bindGroup1 = device.createBindGroup({
        layout: this._resetPipeline.getBindGroupLayout(1),
        entries: [
            {
                binding: 0,
                resource: { buffer: this._cutPlaneBuffer }
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._resetPipeline);
    pass.setBindGroup(0, bindGroup0);
    pass.setBindGroup(1, bindGroup1);
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
    device.queue.writeBuffer(this._cutPlaneBuffer, 0, new Float32Array(this._minCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 12, new Float32Array([this._viewCutDistance]));
    device.queue.writeBuffer(this._cutPlaneBuffer, 16, new Float32Array(this._maxCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 28, new Uint32Array([this._visMode]));
    // device.queue.writeBuffer(this._cutPlaneBuffer, 16, new Float32Array([]));
    // device.queue.writeBuffer(this._cutPlaneBuffer, 28, new Float32Array([]));
    // device.queue.writeBuffer(this._visModeBuffer, 0, new Uint32Array([this._visMode]));
    // console.log(this._minCutPlane, this._maxCutPlane, this._viewCutDistance);
    

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
                resource: this._transferFunction1D_1.createView()
            },
            {
                binding: 7,
                resource: this._transferFunctionSampler1D_1
            },
            {
                binding: 8,
                resource: this._transferFunction1D_2.createView()
            },
            {
                binding: 9,
                resource: this._transferFunctionSampler1D_2
            },
            {
                binding: 10,
                resource: this._transferFunction1D_3.createView()
            },
            {
                binding: 11,
                resource: this._transferFunctionSampler1D_3
            },
            {
                binding: 12,
                resource: this._transferFunction1D_4.createView()
            },
            {
                binding: 13,
                resource: this._transferFunctionSampler1D_4
            },
            // {
            //     binding: 14,
            //     resource: this._transferFunction6.createView()
            // },
            // {
            //     binding: 15,
            //     resource: this._transferFunctionSampler6
            // },
            // {
            //     binding: 16,
            //     resource: this._transferFunction7.createView()
            // },
            // {
            //     binding: 17,
            //     resource: this._transferFunctionSampler7
            // },
            // {
            //     binding: 18,
            //     resource: this._transferFunction8.createView()
            // },
            // {
            //     binding: 19,
            //     resource: this._transferFunctionSampler8
            // },
            {
                binding: 14,
                resource: this._environment.texture.createView()
            },
            {
                binding: 15,
                resource: this._environment.sampler
            },
            {
                binding: 16,
                resource: { buffer: this._renderUniformBuffer }
            },
            {
                binding: 17,
                resource: { buffer: this._photonBuffer }
            },
            {
                binding: 18,
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
                resource: { buffer: this._cutPlaneBuffer }
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
