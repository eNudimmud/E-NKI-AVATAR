import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const expectedWidth = 1024;
const expectedHeight = 1536;
const root = process.cwd();
const assetNames = [
  "enki-base.webp",
  "enki-blink.webp",
  "enki-mouth-aa.webp",
  "enki-mouth-e.webp",
  "enki-mouth-o.webp",
];

function webpDimensions(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") throw new Error("invalid RIFF/WEBP signature");
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === "VP8X") return {
      width: 1 + buffer[data + 4] + (buffer[data + 5] << 8) + (buffer[data + 6] << 16),
      height: 1 + buffer[data + 7] + (buffer[data + 8] << 8) + (buffer[data + 9] << 16),
    };
    if (type === "VP8 ") return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff };
    if (type === "VP8L") {
      const bits = buffer.readUInt32LE(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    offset = data + size + (size % 2);
  }
  throw new Error("no supported WebP image chunk");
}

let totalBytes = 0;
for (const assetName of assetNames) {
  const asset = path.join("public/avatar2d", assetName);
  const absolutePath = path.join(root, asset);
  const [buffer, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  const dimensions = webpDimensions(buffer);
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error(`${asset}: expected ${expectedWidth}x${expectedHeight}, received ${dimensions.width}x${dimensions.height}`);
  }
  if (metadata.size < 20_000) throw new Error(`${asset}: unexpectedly small asset`);
  console.log(`✓ ${asset} ${dimensions.width}x${dimensions.height} ${metadata.size} bytes`);
  totalBytes += buffer.byteLength;
}
if (totalBytes > 1_500_000) throw new Error(`avatar payload too large: ${totalBytes} bytes`);
console.log(`✓ portrait payload ${totalBytes} bytes`);
