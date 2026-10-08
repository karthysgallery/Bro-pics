// Downloads the background-removal model into models/ and checks its SHA-256.
// BiRefNet-lite, ONNX export by onnx-community — MIT licence (code and weights):
// https://huggingface.co/onnx-community/BiRefNet_lite-ONNX
// Run before `docker build` (the Dockerfile copies models/), and once for local development.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = 'https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model.onnx';
const SHA256 = '5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333';
const target = join(dirname(fileURLToPath(import.meta.url)), 'models', 'birefnet-lite.onnx');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
if (existsSync(target) && sha(readFileSync(target)) === SHA256) {
  console.log(`Model already present: ${target}`);
  process.exit(0);
}
mkdirSync(dirname(target), { recursive: true });
console.log('Downloading BiRefNet-lite (224 MB)…');
const res = await fetch(URL);
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
const data = Buffer.from(await res.arrayBuffer());
if (sha(data) !== SHA256) throw new Error('Checksum mismatch: the downloaded model is not the expected file. Nothing was saved.');
writeFileSync(target, data);
console.log(`Saved ${target}`);
