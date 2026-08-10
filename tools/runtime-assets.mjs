import spdxLicenseIds from 'spdx-license-ids/index.json' with { type: 'json' };

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
    'application/javascript',
    'MIT'
  ),
  asset(
    'gifWorker',
    'Animated GIF worker',
    'modern-gif',
    '2.1.0',
    'https://cdn.jsdelivr.net/npm/modern-gif@2.1.0/dist/worker.js',
    'sha384-/AE2XoJ6rgtq/wlcIHqFn5/zSGrXTfrwuH5NQ2BjgflUjtjIJAz9/C0JSldf8Hr+',
    'application/javascript',
    'MIT'
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
    'text/javascript',
    'ISC'
  ),
  asset(
    'rawWorker',
    'LibRaw worker',
    'libraw-wasm',
    '1.6.0',
    'https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/worker.js',
    'sha384-7JQfQ2BWV1nukA5F91bEBWv2NWw8SEqG8F6i3GTZyi++2KR2V7FhpXt+dviu21xy',
    'text/javascript',
    'ISC'
  ),
  asset(
    'rawLib',
    'LibRaw library',
    'libraw-wasm',
    '1.6.0',
    'https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/libraw.js',
    'sha384-T8EoHnvoSgGVvZD4H9LA9IZqIWyac+pSzS22Q768TIC7l1e6Y4ZDL4RrSZzPi21D',
    'text/javascript',
    'ISC'
  ),
  asset(
    'rawWasm',
    'LibRaw WebAssembly',
    'libraw-wasm',
    '1.6.0',
    'https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/libraw.wasm',
    'sha384-Bb2q2WPqAGNUd9bIiwHDZ8jTKdC5ESZvSkG+3fQLEvGHXV8pYBxY3okzxmDnaWW4',
    'application/wasm',
    'ISC'
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
    'c2paModule',
    'C2PA web reader module',
    '@contentauth/c2pa-web',
    '0.13.4',
    'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.13.4/+esm',
    'sha384-XiKGtMoho/UT5RF3N91nZZzHNJTGYZEr8mw6iVe5zmLjvO++niUx7f0vWYtX4+/u',
    'text/javascript',
    'MIT',
    makeProvenance({
      verifiedFor:'0.13.4',
      verifiedUrl:'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.13.4/+esm',
      embeddedDependencies:[
        { packageName:'@contentauth/c2pa-types', version:'0.7.3' },
        { packageName:'@contentauth/c2pa-wasm', version:'0.11.2' }
      ],
      dependencyFindings:[
        {
          packageName:'highgain',
          declaredRange:'^0.1.0',
          observedVersion:'0.1.0',
          embedded:false,
          reachable:true,
          evidence:'The generated ESM imports highgain; OpenShop rewrites that import to the separately verified c2paHighgain asset.'
        },
        {
          packageName:'ts-deepmerge',
          declaredRange:'^8.0.0',
          observedVersion:'8.0.0',
          embedded:false,
          reachable:true,
          evidence:'The generated ESM imports ts-deepmerge; OpenShop rewrites that import to the separately verified c2paDeepmerge asset.'
        }
      ]
    })
  ),
  asset(
    'c2paHighgain',
    'C2PA worker transport',
    'highgain',
    '0.1.0',
    'https://cdn.jsdelivr.net/npm/highgain@0.1.0/+esm',
    'sha384-nUjcIEz+lWetduemQYT80yPP4vZnzGpi5ByuqQAd4X8C2330hZOn3w91PMkMhpqR',
    'text/javascript',
    'ISC'
  ),
  asset(
    'c2paDeepmerge',
    'C2PA settings merge',
    'ts-deepmerge',
    '8.0.0',
    'https://cdn.jsdelivr.net/npm/ts-deepmerge@8.0.0/+esm',
    'sha384-97l76Yys/gRH/pN9a6OU8JjpnV+wUY+7yv6PiD11HuXjaQ4khO+W1iBNlVhzbJwr',
    'text/javascript',
    'ISC'
  ),
  asset(
    'c2paWasm',
    'C2PA WebAssembly reader',
    '@contentauth/c2pa-wasm',
    '0.11.2',
    'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-wasm@0.11.2/pkg/c2pa_bg.wasm',
    'sha384-Ulh60/CRTblPxnFr7UHZiHmqQk0Sd9E1gwgUwKmB7nFSjLIxABXVRsh5AQ58G06C',
    'application/wasm',
    'MIT'
  ),
  asset(
    'heicDecoderModule',
    'HEIC decoder module',
    '@discourse/heic',
    '1.0.0',
    'https://cdn.jsdelivr.net/npm/@discourse/heic@1.0.0/codec/dec/heic_dec.js',
    'sha384-F9T0mt1CuLFFYi6Bhsty/mYlCq3u5nIA73KNNpAKzdWjsrq9eUnHjyYlMhCXuxsN',
    'application/javascript',
    'Apache-2.0',
    makeProvenance({
      verifiedFor:'1.0.0',
      verifiedUrl:'https://cdn.jsdelivr.net/npm/@discourse/heic@1.0.0/codec/dec/heic_dec.js',
      embeddedDependencies:[
        { packageName:'libheif', version:'1.19.7' },
        { packageName:'libde265', version:'1.0.15' }
      ],
      dependencyFindings:[
        {
          packageName:'libheif',
          declaredRange:'compiled into @discourse/heic 1.0.0',
          observedVersion:'1.19.7',
          embedded:true,
          reachable:true,
          evidence:'The @discourse/heic 1.0.0 build Makefile pins libheif v1.19.7; the WASM is loaded only for a HEIC import.'
        },
        {
          packageName:'libde265',
          declaredRange:'compiled into @discourse/heic 1.0.0',
          observedVersion:'1.0.15',
          embedded:true,
          reachable:true,
          evidence:'The @discourse/heic 1.0.0 build Makefile pins libde265 v1.0.15; the WASM is loaded only for a HEIC import.'
        }
      ]
    })
  ),
  asset(
    'heicDecoderWasm',
    'HEIC decoder WebAssembly',
    '@discourse/heic',
    '1.0.0',
    'https://cdn.jsdelivr.net/npm/@discourse/heic@1.0.0/codec/dec/heic_dec.wasm',
    'sha384-MUbrD0AkP7bJ+T8RT47EJYUCRoHzjn8+35nwLd62Kwn4OHm+MNkqiUzlIwpHe+fR',
    'application/wasm',
    'Apache-2.0'
  ),
  asset(
    'jxlDecoderModule',
    'JPEG XL decoder module',
    '@jsquash/jxl',
    '1.3.0',
    'https://cdn.jsdelivr.net/npm/@jsquash/jxl@1.3.0/codec/dec/jxl_dec.js',
    'sha384-OVUtDrf9Am51biP6vZWJC1BeSlKKo6nQQPjlB+KF9eWNuazANiijG+IBV4RDRUMA',
    'application/javascript',
    'Apache-2.0',
    makeProvenance({
      verifiedFor:'1.3.0',
      verifiedUrl:'https://cdn.jsdelivr.net/npm/@jsquash/jxl@1.3.0/codec/dec/jxl_dec.js',
      embeddedDependencies:[
        { packageName:'libjxl', version:'9f544641ec83f6abd9da598bdd08178ee8a003e0' }
      ],
      dependencyFindings:[
        {
          packageName:'libjxl',
          declaredRange:'compiled from the pinned source commit in @jsquash/jxl 1.3.0',
          observedVersion:'9f544641ec83f6abd9da598bdd08178ee8a003e0',
          embedded:true,
          reachable:true,
          evidence:'The @jsquash/jxl 1.3.0 codec Makefile pins libjxl commit 9f544641ec83f6abd9da598bdd08178ee8a003e0; the WASM is loaded only for a JXL import.'
        }
      ]
    })
  ),
  asset(
    'jxlDecoderWasm',
    'JPEG XL decoder WebAssembly',
    '@jsquash/jxl',
    '1.3.0',
    'https://cdn.jsdelivr.net/npm/@jsquash/jxl@1.3.0/codec/dec/jxl_dec.wasm',
    'sha384-nJrefhoZ7HToq7VA6kbP3TG/g8+eD4UjhgDkyl0D6a6JtkP/2kj3MlygJWP6k/Ex',
    'application/wasm',
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
const SPDX_LICENSE_IDS = new Set(spdxLicenseIds);

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
    license:value.license,
    provenance:value.provenance || makeProvenance({ verifiedFor:value.version, verifiedUrl:value.url })
  }));
}

export function validateRuntimeProvenance(assets = OPENSHOP_CACHEABLE_RUNTIME_ASSETS) {
  const failures = [];
  assets.forEach(value => {
    if (!value.key || !value.name || !value.packageName) {
      failures.push(`${value.key || 'unknown asset'} is missing a canonical identity`);
    }
    if (!value.version || /[\s^~*<>=|]/.test(value.version)) {
      failures.push(`${value.key || 'unknown asset'} does not record an exact version`);
    }
    const expectedUrl = `https://cdn.jsdelivr.net/npm/${value.packageName}@${value.version}`;
    if (!value.url || (value.url !== expectedUrl && !value.url.startsWith(`${expectedUrl}/`))) {
      failures.push(`${value.key || 'unknown asset'} source URL is not pinned to its exact package/version`);
    }
    if (!/^sha384-[A-Za-z0-9+/=]+$/.test(value.integrity || '')) {
      failures.push(`${value.key || 'unknown asset'} is missing a SHA-384 integrity hash`);
    }
    if (!value.license) {
      failures.push(`${value.key || 'unknown asset'} has no SPDX license identifier`);
    } else if (!SPDX_LICENSE_IDS.has(value.license)) {
      failures.push(`${value.key || 'unknown asset'} license is not a valid SPDX identifier: ${value.license}`);
    }
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
