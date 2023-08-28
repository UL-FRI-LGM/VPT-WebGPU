import { mat4 } from '../../lib/gl-matrix-module.js';

import { WebGPU } from '../WebGPU.js';
import { WebGPUAbstractRenderer } from './WebGPUAbstractRenderer.js';

import { PerspectiveCamera } from '../PerspectiveCamera.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPUMCMRenderer extends WebGPUAbstractRenderer {

constructor(device, volume, camera, environmentTexture, options = {}) {
    super(device, volume, camera, environmentTexture, options);

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
            name: 'transferFunction',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array(256),
        },
    ]);

    this.addEventListener('change', e => {
        const { name, value } = e.detail;

        if (name === 'transferFunction') {
            this.setTransferFunction(this.transferFunction);
        }

        if ([
            'extinction',
            'anisotropy',
            'bounces',
            'transferFunction',
        ].includes(name)) {
            this.reset();
        }
    });

    this._programs = WebGPU.buildShaderModules(device, SHADERS.renderers.MCM, MIXINS);


    this._integrateUniformBuffer = device.createBuffer({
        size: 96,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this._integrateBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { /*sampleType: "float",*/ viewDimension: "3d" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { /*type: "filtering"*/ }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { /*sampleType: "float"*/ }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { /*type: "filtering"*/ }
            },
            {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { /*sampleType: "float"*/ }
            },
            {
                binding: 5,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 6,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" }
            },
            {
                binding: 7,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "non-filtering" }
            },
            {
                binding: 8,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" }
            },
            {
                binding: 9,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "non-filtering" }
            },
            {
                binding: 10,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" }
            },
            {
                binding: 11,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "non-filtering" }
            },
            {
                binding: 12,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" }
            },
            {
                binding: 13,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "non-filtering" }
            },
            {
                binding: 14,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            }
        ]
    });
    const integratePipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this._integrateBindGroupLayout]
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
    this._resetPipeline = device.createRenderPipeline({
        label: "WebGPUMCMRenderer reset pipeline",
        layout: "auto",
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

destroy() {
    return; // TODO

    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });

    super.destroy();
}

_resetFrame() {
    const device = this._device;

    // TODO: get model matrix from volume
    const modelMatrix = mat4.fromTranslation(mat4.create(), [-0.5, -0.5, -0.5]);
    const viewMatrix = this._camera.transform.inverseGlobalMatrix;
    const projectionMatrix = this._camera.getComponent(PerspectiveCamera).projectionMatrix;

    const matrix = mat4.create();
    mat4.multiply(matrix, modelMatrix, matrix);
    mat4.multiply(matrix, viewMatrix, matrix);
    mat4.multiply(matrix, projectionMatrix, matrix);
    mat4.invert(matrix, matrix);

    device.queue.writeBuffer(this._resetUniformBuffer, 0, matrix);
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
            }
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
    const modelMatrix = mat4.fromTranslation(mat4.create(), [-0.5, -0.5, -0.5]);
    const viewMatrix = this._camera.transform.inverseGlobalMatrix;
    const projectionMatrix = this._camera.getComponent(PerspectiveCamera).projectionMatrix;

    const matrix = mat4.create();
    mat4.multiply(matrix, modelMatrix, matrix);
    mat4.multiply(matrix, viewMatrix, matrix);
    mat4.multiply(matrix, projectionMatrix, matrix);
    mat4.invert(matrix, matrix);

    device.queue.writeBuffer(this._integrateUniformBuffer, 0, matrix);
    device.queue.writeBuffer(this._integrateUniformBuffer, 64, new Float32Array([
        1 / this._resolution, 1 / this._resolution, // uniforms.inverseResolution
        Math.random(),                              // uniforms.randSeed
        0,                                          // uniforms.blur
        this.extinction,                            // uniforms.extinction
        this.anisotropy,                            // uniforms.anisotropy
        this.bounces,                               // uniforms.bounces
        this.steps                                  // uniforms.steps
    ]));

    const bindGroup = device.createBindGroup({
        layout: this._integratePipeline.getBindGroupLayout(0),
        entries: [ // TODO: Cleanup
            {
                binding: 0,
                resource: this._volume.getTexture().createView()
            },
            {
                binding: 1,
                resource: this._volume.getSampler()
            },
            {
                binding: 2,
                resource: this._transferFunctionTexture.createView()
            },
            {
                binding: 3,
                resource: this._transferFunctionSampler
            },
            {
                binding: 4,
                resource: this._transferFunctionTexture.createView() // TODO: Change to environment texture
            },
            {
                binding: 5,
                resource: this._transferFunctionSampler // TODO: Change to environment texture sampler
            },
            {
                binding: 6,
                resource: this._accumulationBuffer.getReadAttachments()[0].texture.createView(),
            },
            {
                binding: 7,
                resource: this._accumulationBuffer.getReadAttachments()[0].sampler,
            },
            {
                binding: 8,
                resource: this._accumulationBuffer.getReadAttachments()[1].texture.createView(),
            },
            {
                binding: 9,
                resource: this._accumulationBuffer.getReadAttachments()[1].sampler,
            },
            {
                binding: 10,
                resource: this._accumulationBuffer.getReadAttachments()[2].texture.createView(),
            },
            {
                binding: 11,
                resource: this._accumulationBuffer.getReadAttachments()[2].sampler,
            },
            {
                binding: 12,
                resource: this._accumulationBuffer.getReadAttachments()[3].texture.createView(),
            },
            {
                binding: 13,
                resource: this._accumulationBuffer.getReadAttachments()[3].sampler,
            },
            {
                binding: 14,
                resource: { buffer: this._integrateUniformBuffer }
            }
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
            format: "rgba32float",
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
            format: "rgba16float",
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
            format: "rgba16float",
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
            format: "rgba16float",
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
            format: "rgba16float",
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
