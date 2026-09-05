# Security and privacy

OpenShop performs normal editing in the browser. It has no user account, telemetry collector, document-processing API, or advertising SDK.

## Data boundaries

Opening, editing, recovering, and exporting a document does not send its pixels to an OpenShop server. Local project recovery uses browser storage. Exported files are written through browser download or file-system APIs.

There are two deliberate exceptions to a fully local data path:

- Starting a Collaborative Session transfers document state directly to the peer you choose over WebRTC. The consent dialog shows a peer fingerprint before sharing.
- Embedding OpenShop allows the host page to exchange supported documents and exports through the versioned window-message bridge. The bridge binds replies to the exact host window.

OpenShop does not configure an ICE relay for collaboration. Network metadata may still be visible to the browser's WebRTC infrastructure.

## Network requests

The page can download:

- Pinned runtime code and codecs from `cdn.jsdelivr.net`
- Pinned model weights from Hugging Face after a model-backed tool is selected

The Network Activity panel records requests by host and purpose from page startup. Strict Offline Mode refuses requests that are not already local or cached.

The standalone `index.html` file is network-first on a cold start. A hosted HTTPS copy becomes offline-ready only after the application verifies its required shell. Optional codecs and model weights need one successful download before their separate caches can help offline.

## Runtime verification

Core and optional executable assets are tied to exact versions and SHA-384 digests. A mismatched download is discarded. Content Security Policy hashes cover both inline scripts, and executable event attributes are prohibited by the local release checks.

Optional plugins run in opaque-origin sandboxed frames. A plugin grant is bound to its id, version, source digest, and named capabilities. There is no document-write, file, DOM, or network capability in the plugin API.

Imports are checked against limits for file size, canvas dimensions, decoded pixels, object count, layers, and structured data. PSD parsing is cancellable and uses a bounded allocator. A rejected import leaves the current document unchanged.

## Hosted deployment

Serve OpenShop from a dedicated HTTPS subdirectory. Keep `sw.js` below that path so its control does not extend to unrelated applications.

The HTML file contains the policy needed for the portable lane. A hosted deployment should also send that policy as an HTTP `Content-Security-Policy` header. Set `frame-ancestors` for the deployment if embedding is allowed.

Hosted updates stage separately and must pass an editor health check before promotion. OpenShop retains the previous verified shell for rollback.

## Reporting a vulnerability

Please use [GitHub's private vulnerability reporting form](https://github.com/SysAdminDoc/Openshop/security/advisories/new). Include the affected version, browser, launch mode, reproduction steps, and a small sample file when one is needed.

Do not open a public issue for an unpatched vulnerability.
