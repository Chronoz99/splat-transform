/**
 * GPU Device - Platform-agnostic GPU device wrapper
 *
 * This module provides the core GpuDevice class that wraps a PlayCanvas
 * graphics device for GPU compute operations.
 *
 * Platform-specific device creation is handled by:
 * - node-gpu.ts (Node.js with Dawn)
 * - browser-gpu.ts (Browser with native WebGPU)
 */

import {
    // components
    AnimComponentSystem,
    RenderComponentSystem,
    CameraComponentSystem,
    LightComponentSystem,
    GSplatComponentSystem,
    ScriptComponentSystem,
    // handlers
    AnimClipHandler,
    AnimStateGraphHandler,
    BinaryHandler,
    ContainerHandler,
    CubemapHandler,
    GSplatHandler,
    RenderHandler,
    TextureHandler,
    // rest
    AppBase,
    AppOptions,
    Texture
} from 'playcanvas';

/**
 * PlayCanvas Application wrapper for GPU compute operations
 */
class Application extends AppBase {
    constructor(canvas: HTMLCanvasElement, options: any = {}) {
        super(canvas);

        const appOptions = new AppOptions();

        appOptions.graphicsDevice = options.graphicsDevice;

        appOptions.componentSystems = [
            AnimComponentSystem,
            CameraComponentSystem,
            GSplatComponentSystem,
            LightComponentSystem,
            RenderComponentSystem,
            ScriptComponentSystem
        ];

        appOptions.resourceHandlers = [
            AnimClipHandler,
            AnimStateGraphHandler,
            BinaryHandler,
            ContainerHandler,
            CubemapHandler,
            GSplatHandler,
            RenderHandler,
            TextureHandler
        ];

        this.init(appOptions);
    }
}

/**
 * GPU Device wrapper for compute operations
 */
class GpuDevice {
    app: Application;
    backbuffer: Texture;

    constructor(app: Application, backbuffer: Texture) {
        this.app = app;
        this.backbuffer = backbuffer;
    }

    destroy() {
        this.backbuffer.destroy();
        this.app.destroy();
    }
}

export { GpuDevice, Application };
