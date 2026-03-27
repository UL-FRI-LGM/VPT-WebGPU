import { mat4 } from '../../lib/gl-matrix-module.js';

import { WebGPU } from '../WebGPU.js';
import { WebGPUAbstractRenderer } from './WebGPUAbstractRenderer.js';

import { PerspectiveCamera } from '../PerspectiveCamera.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPUMCMRenderer extends WebGPUAbstractRenderer {

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
        //     this.setTransferFunction5(this.transferFunction1);
        // }
        // if (name === 'transferFunction6') {
        //     this.setTransferFunction6(this.transferFunction2);
        // }
        // if (name === 'transferFunction7') {
        //     this.setTransferFunction7(this.transferFunction3);
        // }
        // if (name === 'transferFunction8') {
        //     this.setTransferFunction8(this.transferFunction4);
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

    this._programs = WebGPU.buildShaderModules(device, SHADERS.renderers.MCM, MIXINS);

    // console.log(volume);

    this._integrateUniformBuffer = device.createBuffer({
        size: 96,
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

    this._integrateBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "3d" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float", viewDimension: "3d" }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            },
            {
                binding: 5,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 6,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            },
            {
                binding: 7,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 8,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            },
            {
                binding: 9,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 10,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            },
            {
                binding: 11,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 12,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            },
            {
                binding: 13,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            // {
            //     binding: 14,
            //     visibility: GPUShaderStage.FRAGMENT,
            //     texture: { sampleType: "float" }
            // },
            // {
            //     binding: 15,
            //     visibility: GPUShaderStage.FRAGMENT,
            //     sampler: { type: "filtering" }
            // },
            // {
            //     binding: 16,
            //     visibility: GPUShaderStage.FRAGMENT,
            //     texture: { sampleType: "float" }
            // },
            // {
            //     binding: 17,
            //     visibility: GPUShaderStage.FRAGMENT,
            //     sampler: { type: "filtering" }
            // },
            // {
            //     binding: 18,
            //     visibility: GPUShaderStage.FRAGMENT,
            //     texture: { sampleType: "float" }
            // },
            // {
            //     binding: 19,
            //     visibility: GPUShaderStage.FRAGMENT,
            //     sampler: { type: "filtering" }
            // },
            {
                binding: 14,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            },
            {
                binding: 15,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 16,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" }
            },
            {
                binding: 17,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "non-filtering" }
            },
            {
                binding: 18,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" }
            },
            {
                binding: 19,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "non-filtering" }
            },
            {
                binding: 20,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" }
            },
            {
                binding: 21,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "non-filtering" }
            },
            {
                binding: 22,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" }
            },
            {
                binding: 23,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "non-filtering" }
            },
            {
                binding: 24,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            }
        ]
    });

    this._generateBindGroupLayout = device.createBindGroupLayout({
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
            }
            // {
            //     binding: 2,
            //     visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            //     buffer: {
            //         type: "uniform"
            //     }
            // },
            // {
            //     binding: 3,
            //     visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            //     buffer: {
            //         type: "uniform"
            //     }
            // }
        ]
    });
    
    const integratePipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this._integrateBindGroupLayout, this._generateBindGroupLayout]
    });
    this._integratePipeline = device.createRenderPipeline({
        label: "WebGPUMCMRenderer integrate pipeline",
        layout: integratePipelineLayout,
        vertex: {
            module: this._programs.integrate,
            entryPoint: "vertex_main"
        },
        fragment: {
            module: this._programs.integrate,
            entryPoint: "fragment_main",
            targets: this._getAccumulationBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });


    this._renderBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "non-filtering" }
            }
        ]
    });
    const renderPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this._renderBindGroupLayout]
    });
    this._renderPipeline = device.createRenderPipeline({
        label: "WebGPUMCMRenderer render pipeline",
        layout: renderPipelineLayout,
        vertex: {
            module: this._programs.render,
            entryPoint: "vertex_main"
        },
        fragment: {
            module: this._programs.render,
            entryPoint: "fragment_main",
            targets: this._getRenderBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });

    
    this._resetUniformBuffer = device.createBuffer({
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this._resetBindGroupLayout = device.createBindGroupLayout({
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
            }
            // {
            //     binding: 2,
            //     visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            //     buffer: {
            //         type: "uniform"
            //     }
            // },
            // {
            //     binding: 3,
            //     visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            //     buffer: {
            //         type: "uniform"
            //     }
            // }
        ]
    });

    this._resetPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this._resetBindGroupLayout]
    });

    this._resetPipeline = device.createRenderPipeline({
        label: "WebGPUMCMRenderer reset pipeline",
        layout: this._resetPipelineLayout,
        vertex: {
            module: this._programs.reset,
            entryPoint: "vertex_main"
        },
        fragment: {
            module: this._programs.reset,
            entryPoint: "fragment_main",
            targets: this._getAccumulationBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });
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
        0                                          // uniforms.blur
    ]));
    device.queue.writeBuffer(this._cutPlaneBuffer, 0, new Float32Array(this._minCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 16, new Float32Array(this._maxCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 32, new Float32Array(this._viewCutDistance));

    const bindGroup = device.createBindGroup({
        layout: this._resetPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: { buffer: this._resetUniformBuffer }
            },
            {
                binding: 1,
                resource: { buffer: this._cutPlaneBuffer }
            }
            // {
            //     binding: 2,
            //     resource: { buffer: this._cutPlaneBuffer }
            // },
            // {
            //     binding: 3,
            //     resource: { buffer: this._cutPlaneBuffer }
            // },
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [ // TODO: Clean this up
            {
                view: this._accumulationBuffer.getWriteAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0], // TODO: Should all values be 0?
                loadOp: "clear",
                storeOp: "store"
            },
            {
                view: this._accumulationBuffer.getWriteAttachments()[1].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            },
            {
                view: this._accumulationBuffer.getWriteAttachments()[2].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            },
            {
                view: this._accumulationBuffer.getWriteAttachments()[3].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._resetPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
}

_generateFrame() {
}

_integrateFrame() {
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

    device.queue.writeBuffer(this._integrateUniformBuffer, 0, matrix); // uniforms.mvpInverseMatrix
    device.queue.writeBuffer(this._integrateUniformBuffer, 64, new Float32Array([
        1 / this._resolution, 1 / this._resolution, // uniforms.inverseResolution
        Math.random(),                              // uniforms.randSeed
        0,                                          // uniforms.blur
        this.extinction,                            // uniforms.extinction
        this.anisotropy,                            // uniforms.anisotropy
    ]));
    device.queue.writeBuffer(this._integrateUniformBuffer, 88, new Uint32Array([
        this.bounces,                               // uniforms.bounces
        this.steps                                 // uniforms.steps
    ]));
    device.queue.writeBuffer(this._visModeBuffer, 0, new Uint32Array([this._visMode]));
    device.queue.writeBuffer(this._cutPlaneBuffer, 0, new Float32Array(this._minCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 16, new Float32Array(this._maxCutPlane));
    device.queue.writeBuffer(this._cutPlaneBuffer, 32, new Float32Array([this._viewCutDistance]));

    const bindGroup = device.createBindGroup({
        layout: this._integratePipeline.getBindGroupLayout(0),
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
                resource: this._accumulationBuffer.getReadAttachments()[0].texture.createView(),
            },
            {
                binding: 17,
                resource: this._accumulationBuffer.getReadAttachments()[0].sampler,
            },
            {
                binding: 18,
                resource: this._accumulationBuffer.getReadAttachments()[1].texture.createView(),
            },
            {
                binding: 19,
                resource: this._accumulationBuffer.getReadAttachments()[1].sampler,
            },
            {
                binding: 20,
                resource: this._accumulationBuffer.getReadAttachments()[2].texture.createView(),
            },
            {
                binding: 21,
                resource: this._accumulationBuffer.getReadAttachments()[2].sampler,
            },
            {
                binding: 22,
                resource: this._accumulationBuffer.getReadAttachments()[3].texture.createView(),
            },
            {
                binding: 23,
                resource: this._accumulationBuffer.getReadAttachments()[3].sampler,
            },
            {
                binding: 24,
                resource: { buffer: this._integrateUniformBuffer }
            }
        ]
    });

    const bindGroup1 = device.createBindGroup({
        label: 'generate bind group 1',
        layout: this._integratePipeline.getBindGroupLayout(1),
        entries: [
            {
                binding: 0,
                resource: { buffer: this._visModeBuffer }
            },
            {
                binding: 1,
                resource: { buffer: this._cutPlaneBuffer }
            }
            // {
            //     binding: 2,
            //     resource: { buffer: this._cutPlaneBuffer }
            // },
            // {
            //     binding: 3,
            //     resource: { buffer: this._cutPlaneBuffer }
            // }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [ // TODO: Clean this up
            {
                view: this._accumulationBuffer.getWriteAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0], // TODO: Should all values be 0?
                loadOp: "clear",
                storeOp: "store"
            },
            {
                view: this._accumulationBuffer.getWriteAttachments()[1].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0], // TODO: Should all values be 0?
                loadOp: "clear",
                storeOp: "store"
            },
            {
                view: this._accumulationBuffer.getWriteAttachments()[2].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0], // TODO: Should all values be 0?
                loadOp: "clear",
                storeOp: "store"
            },
            {
                view: this._accumulationBuffer.getWriteAttachments()[3].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0], // TODO: Should all values be 0?
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._integratePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setBindGroup(1, bindGroup1);
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
                resource: this._accumulationBuffer.getReadAttachments()[3].texture.createView(),
            },
            {
                binding: 1,
                resource: this._accumulationBuffer.getReadAttachments()[3].sampler,
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
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        }
    }];
}

_getAccumulationBufferSpec() {
    const positionBufferSpec = {
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba16float", // TODO: Change to rgba32float - zakaj? dobim error color attachment bytes 64 exceed maximum 32, na rgba16float dela in očitno ne prekorači tega
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        }
    };

    const directionBufferSpec = {
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba16float", // TODO: Change to rgba32float
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        }
    };

    const transmittanceBufferSpec = {
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba16float", // TODO: Change to rgba32float
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        }
    };

    const radianceBufferSpec = {
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba16float", // TODO: Change to rgba32float
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        }
    };

    return [
        positionBufferSpec,
        directionBufferSpec,
        transmittanceBufferSpec,
        radianceBufferSpec,
    ];
}

}
