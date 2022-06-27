// #part /js/WebGPURenderingContext

// #link math
// #link WebGL
// #link WebGPU
// #link Ticker
// #link Camera
// #link OrbitCameraController
// #link WebGPUVolume
// #link renderers
// #link tonemappers

class WebGPURenderingContext {

constructor(onReady, options) {
    this._render = this._render.bind(this);
    // this._webglcontextlostHandler = this._webglcontextlostHandler.bind(this);
    // this._webglcontextrestoredHandler = this._webglcontextrestoredHandler.bind(this);

    Object.assign(this, {
        _resolution : 512,
        _filter     : 'linear'
    }, options);

    this._canvas = document.createElement('canvas');
    // this._canvas.addEventListener('webglcontextlost', this._webglcontextlostHandler);
    // this._canvas.addEventListener('webglcontextrestored', this._webglcontextrestoredHandler);

    this._initWebGPU(() => {
        this._camera = new Camera();
        this._camera.position.z = 1.5;
        this._camera.fovX = 0.3;
        this._camera.fovY = 0.3;
        this._camera.updateMatrices();

        this._cameraController = new OrbitCameraController(this._camera, this._canvas);

        this._volume = new WebGPUVolume(this._device);
        this._scale = new Vector(1, 1, 1);
        this._translation = new Vector(0, 0, 0);
        this._isTransformationDirty = true;
        this._updateMvpInverseMatrix();

        onReady(); // TODO: Dirty hack, remove
    });

    
}

// ============================ WEBGPU SUBSYSTEM ============================ //

async _initWebGPU(onInit) {
    this._adapter = await window.navigator.gpu.requestAdapter();
    this._device = await this._adapter.requestDevice();
    this._context = this._canvas.getContext("webgpu");
    this._presentationFormat = this._context.getPreferredFormat(this._adapter);
    this._context.configure({
        device: this._device,
        format: this._presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    this._hasCompute = false; // TODO: Remove

    this._clipQuad = WebGPU.createClipQuad(this._device);

    this._sampler = this._device.createSampler({
        minFilter: "nearest",
        magFilter: "nearest"
    });



    let tempTexData = new Uint8Array(256 * 256 * 4)
    for (let i = 0; i < 256 * 256; ++i) {
        tempTexData[4*i] = 255
        tempTexData[4*i+1] = 0
        tempTexData[4*i+2] = 0
        tempTexData[4*i+3] = 255
    }
    let tempTexBuffer = this._device.createBuffer({
        size: ((tempTexData.byteLength + 3) & ~3),
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true
    });
    new Uint8Array(tempTexBuffer.getMappedRange()).set(tempTexData);
    tempTexBuffer.unmap();
    
    this._tempTex = this._device.createTexture({
        size: [256, 256, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    
    // TODO: Cleanup
    let ce = this._device.createCommandEncoder({});
    ce.copyBufferToTexture({ buffer: tempTexBuffer, bytesPerRow: 256 * 4 }, {texture: this._tempTex}, { width: 256, height: 256});
    this._device.queue.submit([ce.finish()]);

    this._quadVSModule = this._device.createShaderModule({ code: WGSL.quad.vertex });
    this._quadFSModule = this._device.createShaderModule({ code: WGSL.quad.fragment });

    this._quadBindGroupLayout = this._device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            }
        ]
    });
    this._quadBindGroup = this._device.createBindGroup({
        layout: this._quadBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: this._sampler
            },
            {
                binding: 1,
                resource: this._tempTex.createView()
            }
        ]
    });
    this._quadPipeline = this._device.createRenderPipeline({
        layout: this._device.createPipelineLayout({
            bindGroupLayouts: [this._quadBindGroupLayout]
        }),
        vertex: {
            module: this._quadVSModule,
            entryPoint: "main",
            buffers: [
                { // vertexBuffer
                    attributes: [
                        { // Position
                            shaderLocation: 0, // [[location(0)]]
                            offset: 0,
                            format: "float32x2"
                        }
                    ],
                    arrayStride: 4 * 2, // sizeof(float) * 6
                    stepMode: "vertex"
                }
            ]
        },
        fragment: {
            module: this._quadFSModule,
            entryPoint: "main",
            targets: [{
                format: this._presentationFormat
            }],
        },
        primitive: {
            // frontFace: "ccw",
            // cullMode: "back",
            topology: "triangle-list"
        },
        // depthStencil: {
        //     depthWriteEnabled: true,
        //     depthCompare: "less",
        //     format: "depth24plus-stencil8"
        // }
    });







    // const contextSettings = {
    //     alpha                 : false,
    //     depth                 : false,
    //     stencil               : false,
    //     antialias             : false,
    //     preserveDrawingBuffer : true,
    // };

    // this._contextRestorable = true;

    // this._gl = this._canvas.getContext('webgl2-compute', contextSettings);
    // if (this._gl) {
    //     this._hasCompute = true;
    // } else {
    //     this._hasCompute = false;
    //     this._gl = this._canvas.getContext('webgl2', contextSettings);
    // }
    // const gl = this._gl;
    // this._extLoseContext = gl.getExtension('WEBGL_lose_context');
    // this._extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    // this._extTextureFloatLinear = gl.getExtension('OES_texture_float_linear');

    // if (!this._extColorBufferFloat) {
    //     console.error('EXT_color_buffer_float not supported!');
    // }

    // if (!this._extTextureFloatLinear) {
    //     console.error('OES_texture_float_linear not supported!');
    // }

    // gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // this._environmentTexture = WebGL.createTexture(gl, {
    //     width          : 1,
    //     height         : 1,
    //     data           : new Uint8Array([255, 255, 255, 255]),
    //     format         : gl.RGBA,
    //     internalFormat : gl.RGBA, // TODO: HDRI & OpenEXR support
    //     type           : gl.UNSIGNED_BYTE,
    //     wrapS          : gl.CLAMP_TO_EDGE,
    //     wrapT          : gl.CLAMP_TO_EDGE,
    //     min            : gl.LINEAR,
    //     max            : gl.LINEAR
    // });

    // this._program = WebGL.buildPrograms(gl, {
    //     quad: SHADERS.quad
    // }, MIXINS).quad;

    // this._clipQuad = WebGL.createClipQuad(gl);

    onInit(); // TODO: Dirty hack, remove
}

_webglcontextlostHandler(e) {
    if (this._contextRestorable) {
        e.preventDefault();
    }
}

_webglcontextrestoredHandler(e) {
    this._initWebGPU();
}

resize(width, height) {
    this._canvas.width = width;
    this._canvas.height = height;
    this._camera.resize(width, height);
}

setVolume(reader) {
    this._volume = new WebGPUVolume(this._device, reader);
    this._volume.readMetadata({
        onData: () => {
            this._volume.readModality('default', {
                onLoad: () => {
                    this._volume.setFilter(this._filter);
                    if (this._renderer) {
                        this._renderer.setVolume(this._volume);
                        this.startRendering();
                    }
                }
            });
        }
    });
}

setEnvironmentMap(image) {
    // WebGL.createTexture(this._gl, {
    //     texture : this._environmentTexture,
    //     image   : image
    // });
}

setFilter(filter) {
    this._filter = filter;
    if (this._volume) {
        this._volume.setFilter(filter);
        if (this._renderer) {
            this._renderer.reset();
        }
    }
}

chooseRenderer(renderer) {
    if (this._renderer) {
        this._renderer.destroy();
    }
    const rendererClass = this._getRendererClass(renderer);
    this._renderer = new rendererClass(this._device, this._volume, this._environmentTexture);
    if (this._toneMapper) {
        this._toneMapper.setTexture(this._renderer.getTexture());
    }
    this._isTransformationDirty = true;

    // TODO: Delete old bind group (memory leak?)
    this._quadBindGroup = this._device.createBindGroup({
        layout: this._quadBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: this._sampler
            },
            {
                binding: 1,
                resource: this._renderer.getTexture().createView()
            }
        ]
    });
}

chooseToneMapper(toneMapper) {
    // if (this._toneMapper) {
    //     this._toneMapper.destroy();
    // }
    // const gl = this._gl;
    // let texture;
    // if (this._renderer) {
    //     texture = this._renderer.getTexture();
    // } else {
    //     texture = WebGL.createTexture(gl, {
    //         width  : 1,
    //         height : 1,
    //         data   : new Uint8Array([255, 255, 255, 255]),
    //     });
    // }
    // const toneMapperClass = this._getToneMapperClass(toneMapper);
    // this._toneMapper = new toneMapperClass(gl, texture);
}

getCanvas() {
    return this._canvas;
}

getRenderer() {
    return this._renderer;
}

getToneMapper() {
    return this._toneMapper;
}

_updateMvpInverseMatrix() {
    if (!this._camera.isDirty && !this._isTransformationDirty) {
        return;
    }

    this._camera.isDirty = false;
    this._isTransformationDirty = false;
    this._camera.updateMatrices();

    const centerTranslation = new Matrix().fromTranslation(-0.5, -0.5, -0.5);
    const volumeTranslation = new Matrix().fromTranslation(
        this._translation.x, this._translation.y, this._translation.z);
    const volumeScale = new Matrix().fromScale(
        this._scale.x, this._scale.y, this._scale.z);

    const modelMatrix = new Matrix();
    modelMatrix.multiply(volumeScale, centerTranslation);
    modelMatrix.multiply(volumeTranslation, modelMatrix);

    const viewMatrix = this._camera.viewMatrix;
    const projectionMatrix = this._camera.projectionMatrix;

    if (this._renderer) {
        this._renderer.modelMatrix.copy(modelMatrix);
        this._renderer.viewMatrix.copy(viewMatrix);
        this._renderer.projectionMatrix.copy(projectionMatrix);
        this._renderer.reset();
    }
}

_render() {
    const device = this._device;
    if (!device) { // || !this._renderer || !this._toneMapper) {
        return;
    }

    this._updateMvpInverseMatrix();

    this._renderer.render();
    // this._toneMapper.render();

    const commandEncoder = device.createCommandEncoder();
    const quadPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: this._context.getCurrentTexture().createView(), // Swap framebuffer
            clearValue: [0, 0, 0, 1],
            loadOp: "clear",
            storeOp: "store"
        }]
    });

    quadPass.setPipeline(this._quadPipeline);
    quadPass.setVertexBuffer(0, this._clipQuad);
    quadPass.setBindGroup(0, this._quadBindGroup);
    quadPass.draw(6, 1, 0, 0);
    quadPass.end();

    device.queue.submit([commandEncoder.finish()]);




    // const gl = this._gl;
    // if (!gl || !this._renderer || !this._toneMapper) {
    //     return;
    // }

    // this._updateMvpInverseMatrix();

    // this._renderer.render();
    // this._toneMapper.render();

    // gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    // const program = this._program;
    // gl.useProgram(program.program);
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    // const aPosition = program.attributes.aPosition;
    // gl.enableVertexAttribArray(aPosition);
    // gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._toneMapper.getTexture());
    // gl.uniform1i(program.uniforms.uTexture, 0);
    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // gl.disableVertexAttribArray(aPosition);
    // gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // gl.bindTexture(gl.TEXTURE_2D, null);
}

getScale() {
    return this._scale;
}

setScale(x, y, z) {
    this._scale.set(x, y, z);
    this._isTransformationDirty = true;
}

getTranslation() {
    return this._translation;
}

setTranslation(x, y, z) {
    this._translation.set(x, y, z);
    this._isTransformationDirty = true;
}

getResolution() {
    return this._resolution;
}

setResolution(resolution) {
    if (this._renderer) {
        this._renderer.setResolution(resolution);

        // TODO: Delete old bind group (memory leak?)
        this._quadBindGroup = this._device.createBindGroup({
            layout: this._quadBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this._sampler
                },
                {
                    binding: 1,
                    resource: this._renderer.getTexture().createView()
                }
            ]
        });
    }
    if (this._toneMapper) {
        this._toneMapper.setResolution(resolution);
        if (this._renderer) {
            this._toneMapper.setTexture(this._renderer.getTexture());
        }
    }
}

startRendering() {
    Ticker.add(this._render);
}

stopRendering() {
    Ticker.remove(this._render);
}

hasComputeCapabilities() {
    return this._hasCompute;
}

_getRendererClass(renderer) {
    switch (renderer) {
        case 'iso': return WebGPUISORenderer;
        case 'eam': return WebGPUEAMRenderer;
    }
    return WebGPUEAMRenderer;
    
    switch (renderer) {
        case 'mip' : return MIPRenderer;
        case 'iso' : return ISORenderer;
        case 'eam' : return EAMRenderer;
        case 'mcs' : return MCSRenderer;
        case 'mcm' : return MCMRenderer;
        case 'mcc' : return MCCRenderer;
        case 'dos' : return DOSRenderer;
    }
}

_getToneMapperClass(toneMapper) {
    switch (toneMapper) {
        case 'artistic'   : return ArtisticToneMapper;
        case 'range'      : return RangeToneMapper;
        case 'reinhard'   : return ReinhardToneMapper;
        case 'reinhard2'  : return Reinhard2ToneMapper;
        case 'uncharted2' : return Uncharted2ToneMapper;
        case 'filmic'     : return FilmicToneMapper;
        case 'unreal'     : return UnrealToneMapper;
        case 'aces'       : return AcesToneMapper;
        case 'lottes'     : return LottesToneMapper;
        case 'uchimura'   : return UchimuraToneMapper;
    }
}

}
