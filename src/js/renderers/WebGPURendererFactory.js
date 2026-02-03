// import { WebGPUMIPRenderer } from './WebGPUMIPRenderer.js';
// import { WebGPUISORenderer } from './WebGPUISORenderer.js';
import { WebGPUEAMRenderer } from './WebGPUEAMRenderer.js';
// import { WebGPULAORenderer } from './WebGPULAORenderer.js';
// import { WebGPUMCSRenderer } from './WebGPUMCSRenderer.js';
import { WebGPUMCMRenderer } from './WebGPUMCMRenderer.js';
import { WebGPUMCMComputeRenderer } from './WebGPUMCMComputeRenderer.js';
import { WebGPUNeuralCacheRenderer } from './WebGPUNeuralCacheRenderer.js';
// import { WebGPUDOSRenderer } from './WebGPUDOSRenderer.js';
// import { WebGPUDepthRenderer } from './WebGPUDepthRenderer.js';

export function WebGPURendererFactory(which) {
    switch (which) {
        // case 'mip': return WebGPUMIPRenderer;
        // case 'iso': return WebGPUISORenderer;
        case 'eam': return WebGPUEAMRenderer;
        // case 'lao': return WebGPULAORenderer;
        // case 'mcs': return WebGPUMCSRenderer;
        case 'mcm': return WebGPUMCMRenderer;
        case 'mcm-compute': return WebGPUMCMComputeRenderer;
        case 'neural-cache': return WebGPUNeuralCacheRenderer;
        // case 'dos': return WebGPUDOSRenderer;
        // case 'depth': return WebGPUDepthRenderer;

        default: throw new Error('No suitable class');
    }
}
