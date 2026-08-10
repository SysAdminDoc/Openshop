const freezeRecords = records => Object.freeze(records.map(record => Object.freeze({ ...record })));
const makeProvenance = ({ verifiedFor, verifiedUrl, embeddedDependencies = [], dependencyFindings = [] }) => Object.freeze({
  verifiedFor,
  verifiedUrl,
  embeddedDependencies: freezeRecords(embeddedDependencies),
  dependencyFindings: freezeRecords(dependencyFindings)
});

const asset = (key, name, packageName, version, url, integrity, type, license = null, provenance = null) => Object.freeze({
  key,
  name,
  packageName,
  version,
  url,
  integrity,
  type,
  license,
  provenance
});

export const OPENSHOP_BOOT_ASSETS = Object.freeze([
  asset(
    'fabric',
    'Fabric.js',
    'fabric',
    '7.4.0',
    'https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist/index.min.js',
    'sha384-T2IWa4YW4tn/gJpR880CrMehXQvwxwaRgQszdzYPA6jBbKH9sPZuTf9YrN/PqNP6',
    'application/javascript',
    'MIT'
  ),
  asset(
    'agPsd',
    'ag-psd',
    'ag-psd',
    '31.0.2',
    'https://cdn.jsdelivr.net/npm/ag-psd@31.0.2/dist/bundle.js',
    'sha384-9dhx2Gx3cKvCuBJwLZxPUmqz77LqKJIAzYABzUhCaCPDK5Rz+CFt6/jeKu84tBA6',
    'application/javascript',
    'MIT'
  ),
  asset(
    'jsPdf',
    'jsPDF',
    'jspdf',
    '4.2.1',
    'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
    'sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3',
    'application/javascript',
    'MIT',
    makeProvenance({
      verifiedFor:'4.2.1',
      verifiedUrl:'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
      dependencyFindings:[{
        packageName:'dompurify',
        declaredRange:'^3.3.1',
        observedVersion:null,
        embedded:false,
        reachable:false,
        evidence:'The jsPDF 4.2.1 UMD contains optional DOMPurify loader hooks but no DOMPurify bytes; OpenShop does not invoke jsPDF.html().'
      }]
    })
  )
]);

export const OPENSHOP_RUNTIME_ASSETS = Object.freeze([
  asset(
    'psdDecoder',
    'PSD decoder',
    'ag-psd',
    '31.0.2',
    'https://cdn.jsdelivr.net/npm/ag-psd@31.0.2/dist/bundle.js',
    'sha384-9dhx2Gx3cKvCuBJwLZxPUmqz77LqKJIAzYABzUhCaCPDK5Rz+CFt6/jeKu84tBA6',
    'application/javascript',
    'MIT'
  ),
  asset(
    'photonModule',
    'Photon module',
    '@silvia-odwyer/photon',
    '0.3.3',
    'https://cdn.jsdelivr.net/npm/@silvia-odwyer/photon@0.3.3/photon_rs.js',
    'sha384-2poc6y7WarCbgFC86zFZ0ce5oBR0hkYUGIB2ySfyuYwEZ0KsRA51rtlAe7bnMEr0',
    'application/javascript',
    'Apache-2.0'
  ),
  asset(
    'photonWasm',
    'Photon WebAssembly',
    '@silvia-odwyer/photon',
    '0.3.3',
    'https://cdn.jsdelivr.net/npm/@silvia-odwyer/photon@0.3.3/photon_rs_bg.wasm',
    'sha384-XTalmX4dqxgWAOn0b1wPMbNs/bZhF/kkmL4ttacTyF6/8aeRN3JWlFPF9rLT8ST4',
    'application/wasm',
    'Apache-2.0'
  ),
  asset(
    'gifCodec',
    'Animated GIF codec',
    'modern-gif',
    '2.1.0',
    'https://cdn.jsdelivr.net/npm/modern-gif@2.1.0/dist/index.js',
    'sha384-yCVLlNDdLotEs4WM1HtMcWyV942aZDf0ylFBfb3DWJ2kPNBIpDA5SJa3CJgMUzUv',
    'application/javascript'
  ),
  asset(
    'gifWorker',
    'Animated GIF worker',
    'modern-gif',
    '2.1.0',
    'https://cdn.jsdelivr.net/npm/modern-gif@2.1.0/dist/worker.js',
    'sha384-/AE2XoJ6rgtq/wlcIHqFn5/zSGrXTfrwuH5NQ2BjgflUjtjIJAz9/C0JSldf8Hr+',
    'application/javascript'
  ),
  asset(
    'pdfModule',
    'PDF.js module',
    'pdfjs-dist',
    '6.2.108',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.min.mjs',
    'sha384-iFreJLYJz3yZXDcGivJRXeHAo/NHOLP/QIK1neoV/fI0muPBJGNUhorvDzwNiIF/',
    'text/javascript',
    'Apache-2.0'
  ),
  asset(
    'pdfWorker',
    'PDF.js worker',
    'pdfjs-dist',
    '6.2.108',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.worker.min.mjs',
    'sha384-TP/IyAALg2YIe4jQVEJ6WwbztilE5pDhTVEmz5gPXnu3JwDPws/1dWcJwLnX/+GJ',
    'text/javascript',
    'Apache-2.0'
  ),
  asset(
    'rawIndex',
    'LibRaw module',
    'libraw-wasm',
    '1.6.0',
    'https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/index.js',
    'sha384-IPc84Xt0caNODxmuJ0QRTalkSnpgUi4vcKJKA0qQZ3XTYl1q30DZgEtq2iHXFZcL',
    'text/javascript'
  ),
  asset(
    'rawWorker',
    'LibRaw worker',
    'libraw-wasm',
    '1.6.0',
    'https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/worker.js',
    'sha384-7JQfQ2BWV1nukA5F91bEBWv2NWw8SEqG8F6i3GTZyi++2KR2V7FhpXt+dviu21xy',
    'text/javascript'
  ),
  asset(
    'rawLib',
    'LibRaw library',
    'libraw-wasm',
    '1.6.0',
    'https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/libraw.js',
    'sha384-T8EoHnvoSgGVvZD4H9LA9IZqIWyac+pSzS22Q768TIC7l1e6Y4ZDL4RrSZzPi21D',
    'text/javascript'
  ),
  asset(
    'rawWasm',
    'LibRaw WebAssembly',
    'libraw-wasm',
    '1.6.0',
    'https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/libraw.wasm',
    'sha384-Bb2q2WPqAGNUd9bIiwHDZ8jTKdC5ESZvSkG+3fQLEvGHXV8pYBxY3okzxmDnaWW4',
    'application/wasm'
  ),
  asset(
    'avifEncoderModule',
    'AVIF encoder module',
    '@jsquash/avif',
    '2.1.1',
    'https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/enc/avif_enc.js',
    'sha384-CSCv5W4tWhwNEV016b7Cf+Z7a+XAf4Z8tY/79BEKL+PJSO96cZrxu+ryYFU+den3',
    'application/javascript',
    'Apache-2.0'
  ),
  asset(
    'avifEncoderWasm',
    'AVIF encoder WebAssembly',
    '@jsquash/avif',
    '2.1.1',
    'https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/enc/avif_enc.wasm',
    'sha384-05Hrg6MAEOyGEl+DBp138l7mH4bs/srHNfuLKY1bXS0R9WI/amgsW509B8FkaZWr',
    'application/wasm',
    'Apache-2.0'
  ),
  asset(
    'avifDecoderModule',
    'AVIF decoder module',
    '@jsquash/avif',
    '2.1.1',
    'https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/dec/avif_dec.js',
    'sha384-pQijokcrYgIbNNMYKnZu0dEAsqNQJ0lC/666Tk0hVjrDNVx5QZJ9Y3fXt34Ad39p',
    'application/javascript',
    'Apache-2.0'
  ),
  asset(
    'avifDecoderWasm',
    'AVIF decoder WebAssembly',
    '@jsquash/avif',
    '2.1.1',
    'https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/dec/avif_dec.wasm',
    'sha384-WXzHutwoBnplk2hri8J5IvzXrMqwzK8SJSgK71upLLSvawD7CtQd7Ylgs5nMkpuh',
    'application/wasm',
    'Apache-2.0'
  ),
  asset(
    'svg2pdf',
    'SVG-to-PDF module',
    'svg2pdf.js',
    '2.7.0',
    'https://cdn.jsdelivr.net/npm/svg2pdf.js@2.7.0/dist/svg2pdf.umd.min.js',
    'sha384-UMdplNeJF/mRqnsNO/vfK5po5eKyTMGCymHkdARQ9NFscA4DX3buGxfhUJcPLbWj',
    'application/javascript',
    'MIT'
  ),
  asset(
    'imageTracer',
    'ImageTracer',
    'imagetracerjs',
    '1.2.6',
    'https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js',
    'sha384-YcOTH4/N9eULF5JC2kvcrQ7ZDfV1VOCErlPHqmUk77bzeZN9vJbYsi2gM8bJHgWc',
    'application/javascript',
    'Unlicense'
  ),
  asset(
    'fabricExtensions',
    'Fabric.js extensions',
    'fabric',
    '7.4.0',
    'https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist-extensions/fabric-extensions.min.js',
    'sha384-6rc+3DCy0kNV0pFM9+GP1741c0pd6ZL++m828n3irFmgRIFqnLdegK6IK7FP1w7K',
    'application/javascript',
    'MIT'
  ),
  asset(
    'transformers',
    'Transformers.js',
    '@huggingface/transformers',
    '4.2.0',
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0',
    'sha384-3TA7bWonh/FGdhkvnr9EMFCoFqikJ5aJQEV8RlUgOmBFIF9z3W+h67aRdQPRxN9d',
    'application/javascript',
    'Apache-2.0'
  ),
  asset(
    'onnxWasm',
    'ONNX Runtime WebAssembly',
    'onnxruntime-web',
    '1.26.0-dev.20260416-b7804b056c',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.asyncify.wasm',
    'sha384-ppxy8GpR5oK0pciZqI/PSDs0fl2gPFvA509fIkdyEwIAvXabDahpzW9fPyZq/fLs',
    'application/wasm',
    'MIT'
  ),
  asset(
    'onnxWasmFactory',
    'ONNX Runtime WebAssembly factory',
    'onnxruntime-web',
    '1.26.0-dev.20260416-b7804b056c',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.asyncify.mjs',
    'sha384-3PtbyJKPDRoZCNL6u5IQ3uw3aYqeALuxedvWoGF8Syni60K8769ZoBCVSyxZVllq',
    'application/javascript',
    'MIT'
  ),
  asset(
    'onnxSafariWasm',
    'ONNX Runtime Safari WebAssembly',
    'onnxruntime-web',
    '1.26.0-dev.20260416-b7804b056c',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.wasm',
    'sha384-ac1etqJINZEQKCzyc73jLkiBdavxbNEJ9zaX0uKADcjBIU3+Uj5sx7bW2kasMiZA',
    'application/wasm',
    'MIT'
  ),
  asset(
    'onnxSafariWasmFactory',
    'ONNX Runtime Safari WebAssembly factory',
    'onnxruntime-web',
    '1.26.0-dev.20260416-b7804b056c',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.mjs',
    'sha384-CclkOX/Bse5EM7hBknuVBkrt9XxuaHzaSDsqYGa8L7gW9g9aVQJmmeuWugYUKPGs',
    'application/javascript',
    'MIT'
  )
]);

export const OPENSHOP_REQUIRED_BOOT_KEYS = Object.freeze(['fabric', 'agPsd', 'jsPdf']);
export const OPENSHOP_LOCAL_SHELL_ASSETS = Object.freeze([
  './',
  './index.html',
  './plugin-sandbox.html',
  './plugin-sandbox.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './design/openshop-studio-master.png',
  './design/openshop-menu-states.png'
]);
export const OPENSHOP_OPTIONAL_RUNTIME_KEYS = Object.freeze([
  'photonModule',
  'photonWasm',
  'gifCodec',
  'gifWorker'
]);
export const OPENSHOP_RUNTIME_ORIGINS = Object.freeze([
  'https://cdn.jsdelivr.net'
]);
export const OPENSHOP_ASSETS_BY_KEY = Object.freeze(
  Object.fromEntries([...OPENSHOP_BOOT_ASSETS, ...OPENSHOP_RUNTIME_ASSETS].map(value => [value.key, value]))
);
export const OPENSHOP_CACHEABLE_RUNTIME_ASSETS = Object.freeze([
  ...OPENSHOP_BOOT_ASSETS,
  ...OPENSHOP_RUNTIME_ASSETS
]);

export function assetsForKeys(keys) {
  return keys.map(key => {
    const value = OPENSHOP_ASSETS_BY_KEY[key];
    if (!value) throw new Error(`Unknown OpenShop runtime asset key: ${key}`);
    return value;
  });
}

export function licenseReport() {
  validateRuntimeProvenance();
  return [...OPENSHOP_CACHEABLE_RUNTIME_ASSETS].map(value => ({
    key:value.key,
    name:value.name,
    packageName:value.packageName,
    version:value.version,
    url:value.url,
    license:value.license || 'not declared in manifest; verify package metadata',
    provenance:value.provenance || makeProvenance({ verifiedFor:value.version, verifiedUrl:value.url })
  }));
}

export function validateRuntimeProvenance() {
  const failures = [];
  OPENSHOP_CACHEABLE_RUNTIME_ASSETS.forEach(value => {
    if (!value.provenance) return;
    if (value.provenance.verifiedFor !== value.version) {
      failures.push(`${value.key} provenance is verified for ${value.provenance.verifiedFor}, not ${value.version}`);
    }
    if (value.provenance.verifiedUrl !== value.url) {
      failures.push(`${value.key} provenance URL does not match its pinned asset`);
    }
    value.provenance.embeddedDependencies.forEach(dependency => {
      if (!dependency.packageName || !dependency.version) {
        failures.push(`${value.key} has an embedded dependency without an exact package/version`);
      }
    });
    value.provenance.dependencyFindings.forEach(finding => {
      if (!finding.packageName || typeof finding.embedded !== 'boolean' || typeof finding.reachable !== 'boolean') {
        failures.push(`${value.key} has an incomplete dependency finding`);
      }
    });
  });
  if (failures.length) throw new Error(`Runtime provenance failed:\n- ${failures.join('\n- ')}`);
  return true;
}
