import { mat4 } from '../../lib/gl-matrix-module.js';

import { WebGPU } from '../WebGPU.js';
import { WebGPUAbstractRenderer } from './WebGPUAbstractRenderer.js';

import { PerspectiveCamera } from '../PerspectiveCamera.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPUEAMRenderer extends WebGPUAbstractRenderer {

constructor(device, volume, camera, environment, options = {}) {
    super(device, volume, camera, environment, options);

    this.registerProperties([
        {
            name: 'extinction',
            label: 'Extinction',
            type: 'spinner',
            value: 100,
            min: 0,
        },
        {
            name: 'slices',
            label: 'Slices',
            type: 'spinner',
            value: 64,
            min: 1,
        },
        {
            name: 'random',
            label: 'Random',
            type: 'checkbox',
            value: true,
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
        },
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
            'slices',
            'random',
            'transferFunction1',
            'transferFunction1D_1',
            'transferFunction1D_2',
            'transferFunction1D_3',
            'transferFunction1D_4',
        ].includes(name)) {
            this.reset();
        }
    });

    const modules = WebGPU.buildShaderModules(device, SHADERS.renderers.EAM, MIXINS);
    this._frameNumber = 0;

    // console.log(modules);
    // let test = this._getFrameBufferSpec(); 
    // console.log(this._getFrameBufferSpec()[0].textureDescriptor.format);

    this._generateUniformBuffer = device.createBuffer({
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this._visModeBuffer = device.createBuffer({
        size: 4,  // 4 bytes for a single u32
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this._cutPlaneBuffer = device.createBuffer({
        size: 36,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    // bindgroup layout
    this._generateBindGroupLayout0 = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: "float",
                    viewDimension: "3d",
                    mulitsampled: false
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: "float",
                    viewDimension: "3d",
                    mulitsampled: false
                }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 5,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 6,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 7,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 8,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 9,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 10,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 11,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 12,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d",
                    mulitsampled: false
                }
            },
            {
                binding: 13,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "filtering"
                }
            },
            {
                binding: 14,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform"
                }
            },
            {
                binding: 15,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform"
                }
            },
        ]
    });
    // this._generateBindGroupLayout1 = device.createBindGroupLayout({
    //     entries: [
    //         {
    //             binding: 0,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             texture: {
    //                 sampleType: "float",
    //                 viewDimension: "3d",
    //                 mulitsampled: false
    //             }
    //         },
    //         {
    //             binding: 1,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             sampler: {
    //                 type: "filtering"
    //             }
    //         },
    //         {
    //             binding: 2,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             texture: {
    //                 sampleType: "float",
    //                 viewDimension: "2d",
    //                 mulitsampled: false
    //             }
    //         },
    //         {
    //             binding: 3,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             sampler: {
    //                 type: "filtering"
    //             }
    //         },
    //         {
    //             binding: 4,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             texture: {
    //                 sampleType: "float",
    //                 viewDimension: "2d",
    //                 mulitsampled: false
    //             }
    //         },
    //         {
    //             binding: 5,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             sampler: {
    //                 type: "filtering"
    //             }
    //         },
    //         {
    //             binding: 6,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             texture: {
    //                 sampleType: "float",
    //                 viewDimension: "2d",
    //                 mulitsampled: false
    //             }
    //         },
    //         {
    //             binding: 7,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             sampler: {
    //                 type: "filtering"
    //             }
    //         },
    //         {
    //             binding: 8,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             texture: {
    //                 sampleType: "float",
    //                 viewDimension: "2d",
    //                 mulitsampled: false
    //             }
    //         },
    //         {
    //             binding: 9,
    //             visibility: GPUShaderStage.FRAGMENT,
    //             sampler: {
    //                 type: "filtering"
    //             }
    //         },
    //         {
    //             binding: 10,
    //             visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    //             buffer: {
    //                 type: "uniform"
    //             }
    //         },
    //     ]
    // });
    this._generateBindGroupLayout1 = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform"
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform"
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform"
                }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform"
                }
            }
        ]
    });
    // pipeline layout
    this._generatePipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this._generateBindGroupLayout0, this._generateBindGroupLayout1]
    });

    this._generatePipeline = device.createRenderPipeline({
        label: "WebGPUEAMRenderer generate pipeline",
        layout: this._generatePipelineLayout,
        vertex: {
            module: modules.generate,
            entryPoint: "vertex_main"
        },
        fragment: {
            module: modules.generate,
            entryPoint: "fragment_main",
            targets: this._getFrameBufferSpec().map(s => ({ format: s.textureDescriptor.format })) 
        }
    });

    this._integrateUniformBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this._integratePipeline = device.createRenderPipeline({
        label: "WebGPUEAMRenderer integrate pipeline",
        layout: "auto",
        vertex: {
            module: modules.integrate,
            entryPoint: "vertex_main"
        },
        fragment: {
            module: modules.integrate,
            entryPoint: "fragment_main",
            targets: this._getAccumulationBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });

    this._renderPipeline = device.createRenderPipeline({
        label: "WebGPUEAMRenderer render pipeline",
        layout: "auto",
        vertex: {
            module: modules.render,
            entryPoint: "vertex_main"
        },
        fragment: {
            module: modules.render,
            entryPoint: "fragment_main",
            targets: this._getRenderBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });

    this._resetPipeline = device.createRenderPipeline({
        label: "WebGPUEAMRenderer reset pipeline",
        layout: "auto",
        vertex: {
            module: modules.reset,
            entryPoint: "vertex_main"
        },
        fragment: {
            module: modules.reset,
            entryPoint: "fragment_main",
            targets: this._getAccumulationBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });
}

_resetFrame() {
    const device = this._device;

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this._accumulationBuffer.getWriteAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._resetPipeline);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    this._frameNumber = 0;
}

_generateFrame() {
    const device = this._device;

    // TODO: get model matrix from volume
    // const modelMatrix = mat4.fromTranslation(mat4.create(), [-0.5, -0.5, -0.5]);
    // console.log(mat4.fromTranslation(mat4.create(), [-0.5, -0.5, -0.5]));
    //console.log(this._volume[1].getModelMatrix());
    const modelMatrix = this._volume[0].getModelMatrix();
    const viewMatrix = this._camera.transform.inverseGlobalMatrix;
    const projectionMatrix = this._camera.getComponent(PerspectiveCamera).projectionMatrix;

    const matrix = mat4.create();
    mat4.multiply(matrix, modelMatrix, matrix);
    mat4.multiply(matrix, viewMatrix, matrix);
    mat4.multiply(matrix, projectionMatrix, matrix);
    mat4.invert(matrix, matrix);

    // problem z _generateUniformBuffer-jem iz nekega razloga kadar hočem samplat 2 volumna hkrati se sam unbinda al neki podobnga

    device.queue.writeBuffer(this._generateUniformBuffer, 0, matrix);
    device.queue.writeBuffer(this._generateUniformBuffer, 64, new Float32Array([
        1.0 / this.slices,               // uniforms.stepSize
        this.random ? Math.random() : 0, // uniforms.offset
        this.extinction                  // uniforms.extinction
    ]));
    device.queue.writeBuffer(this._visModeBuffer, 0, new Uint32Array([this._visMode]));
    device.queue.writeBuffer(this._cutPlaneBuffer, 0, new Float32Array(this._minCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 16, new Float32Array(this._maxCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 32, new Float32Array([this._viewCutDistance]));

    // console.log(this._generatePipeline.getBindGroupLayout(0));
    const bindGroup1 = device.createBindGroup({
        label: 'generate bind group 1',
        layout: this._generatePipeline.getBindGroupLayout(0),
        entries: [
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
            {
                binding: 14,
                resource: { buffer: this._generateUniformBuffer }
            },
            {
                binding: 15,
                resource: { buffer: this._generateUniformBuffer }
            }
        ]
    });

    // const bindGroup2 = device.createBindGroup({
    //     label: 'generate bind group 2',
    //     layout: this._generatePipeline.getBindGroupLayout(1),
    //     entries: [
            
    //         {
    //             binding: 2,
    //             resource: this._transferFunction5.createView()
    //         },
    //         {
    //             binding: 3,
    //             resource: this._transferFunctionSampler5
    //         },
    //         {
    //             binding: 4,
    //             resource: this._transferFunction6.createView()
    //         },
    //         {
    //             binding: 5,
    //             resource: this._transferFunctionSampler6
    //         },
    //         {
    //             binding: 6,
    //             resource: this._transferFunction7.createView()
    //         },
    //         {
    //             binding: 7,
    //             resource: this._transferFunctionSampler7
    //         },
    //         {
    //             binding: 8,
    //             resource: this._transferFunction8.createView()
    //         },
    //         {
    //             binding: 9,
    //             resource: this._transferFunctionSampler8
    //         },
    //         {
    //             binding: 10,
    //             resource: { buffer: this._generateUniformBuffer }
    //         }
    //     ]
    // });

    const bindGroup2 = device.createBindGroup({
        label: 'generate bind group 2',
        layout: this._generatePipeline.getBindGroupLayout(1),
        entries: [
            {
                binding: 0,
                resource: { buffer: this._visModeBuffer }
            },
            {
                binding: 1,
                resource: { buffer: this._cutPlaneBuffer }
            },
            {
                binding: 2,
                resource: { buffer: this._cutPlaneBuffer }
            },
            {
                binding: 3,
                resource: { buffer: this._cutPlaneBuffer }
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this._frameBuffer.getAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._generatePipeline);
    // pass.setBindGroup(0, bindGroup);
    pass.setBindGroup(0, bindGroup1);
    pass.setBindGroup(1, bindGroup2);
    // pass.setBindGroup(2, bindGroup3);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    this._frameNumber++;
}

_integrateFrame() {
    const device = this._device;

    device.queue.writeBuffer(this._integrateUniformBuffer, 0, new Float32Array([1.0 / this._frameNumber]));

    const bindGroup = device.createBindGroup({
        label: 'integrate bind group',
        layout: this._integratePipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: this._accumulationBuffer.getReadAttachments()[0].texture.createView()
            },
            {
                binding: 1,
                resource: this._accumulationBuffer.getReadAttachments()[0].sampler
            },
            {
                binding: 2,
                resource: this._frameBuffer.getAttachments()[0].texture.createView()
            },
            {
                binding: 3,
                resource: this._frameBuffer.getAttachments()[0].sampler
            },
            {
                binding: 4,
                resource: { buffer: this._integrateUniformBuffer }
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this._accumulationBuffer.getWriteAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._integratePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
}

_renderFrame() {
    const device = this._device;

    const bindGroup = device.createBindGroup({
        layout: this._renderPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: this._accumulationBuffer.getReadAttachments()[0].texture.createView()
            },
            {
                binding: 1,
                resource: this._accumulationBuffer.getReadAttachments()[0].sampler
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this._renderBuffer.getAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._renderPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
}

_getFrameBufferSpec() {
    return [{
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        },
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        }
    }];
}

_getAccumulationBufferSpec() {
    return [{
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        },
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        }
    }];
}

}
