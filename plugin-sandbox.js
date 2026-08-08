'use strict';

// The helper page has an inline fallback for direct file:// launches, where a
// sandboxed iframe cannot load a local script subresource. Hosted pages still
// execute this canonical external asset.
window.__openShopPluginSandboxLoaded = true;

// This file is intentionally tiny and static. The parent sends plugin source
// over postMessage; this document is always loaded in an allow-scripts-only
// sandbox, so the source is evaluated here and never in the editor window.
(() => {
    const MAX_SOURCE_BYTES = 512 * 1024;
    let started = false;

    window.addEventListener('message', event => {
        if (event.source !== window.parent || started) return;
        const message = event.data;
        if (!message || message.type !== 'openshop:host-init' || message.protocolVersion !== 1 || typeof message.source !== 'string') return;
        const manifest = message.manifest;
        if (!manifest || typeof manifest !== 'object' || manifest.id !== message.pluginId || manifest.minApiVersion > message.protocolVersion) return;
        started = true;
        if (new Blob([message.source]).size > MAX_SOURCE_BYTES) {
            window.parent.postMessage({
                type:'openshop:plugin-error',
                protocolVersion:message.protocolVersion,
                pluginId:message.pluginId,
                token:message.token,
                error:'Plugin source exceeds the sandbox limit'
            }, '*');
            return;
        }
        const host = Object.freeze({
            protocolVersion:message.protocolVersion,
            pluginId:message.pluginId,
            token:message.token,
            manifest:Object.freeze({ ...manifest }),
            capabilities:Object.freeze([...(message.capabilities || [])]),
            api:Object.freeze({ ...(message.api || {}) })
        });
        Object.defineProperty(window, '__openShopPluginHost', { value:host, enumerable:false, configurable:false, writable:false });
        try {
            const run = new Function(`"use strict";\n${message.source}\n//# sourceURL=openshop-plugin-${message.pluginId}.js`);
            run();
            window.parent.postMessage({
                type:'openshop:plugin-ready',
                protocolVersion:message.protocolVersion,
                pluginId:message.pluginId,
                token:message.token
            }, '*');
        } catch (error) {
            window.parent.postMessage({
                type:'openshop:plugin-error',
                protocolVersion:message.protocolVersion,
                pluginId:message.pluginId,
                token:message.token,
                error:String(error?.message || 'Plugin source failed')
            }, '*');
        }
    });
})();
