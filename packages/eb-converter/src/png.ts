import { deflateSync, inflateSync } from "node:zlib";

/**
 * Minimal dependency-free PNG encoder (8-bit RGBA, filter 0, no interlace).
 * Used to write locally rendered, gitignored map previews. Nothing produced
 * here is committed; output lives only under apps/game/public/generated.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = buildCrcTable();

export type PngRgba = {
  width: number;
  height: number;
  rgba: Uint8Array;
};

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePngRgba: expected ${width * height * 4} bytes, got ${rgba.length}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

/** Reads width/height from a PNG buffer, or undefined when not a PNG. */
export function readPngHeader(buffer: Uint8Array): { width: number; height: number } | undefined {
  if (buffer.length < 24 || !PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    return undefined;
  }
  const view = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
}

function bitsPerPixel(colorType: number, bitDepth: number): number {
  switch (colorType) {
    case 0:
      return bitDepth;
    case 2:
      return bitDepth * 3;
    case 3:
      return bitDepth;
    case 4:
      return bitDepth * 2;
    case 6:
      return bitDepth * 4;
    default:
      throw new Error(`unsupported PNG color type ${colorType}`);
  }
}

function bytesPerPixelForFilter(colorType: number, bitDepth: number): number {
  return Math.max(1, Math.ceil(bitsPerPixel(colorType, bitDepth) / 8));
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function unfilterScanlines(options: {
  inflated: Buffer;
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  label: string;
}): Uint8Array {
  const { inflated, width, height, colorType, bitDepth, label } = options;
  const stride = Math.ceil(width * bitsPerPixel(colorType, bitDepth) / 8);
  const bpp = bytesPerPixelForFilter(colorType, bitDepth);
  const raw = new Uint8Array(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    const previousRowOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= bpp ? raw[rowOffset + x - bpp] : 0;
      const up = y > 0 ? raw[previousRowOffset + x] : 0;
      const upLeft = y > 0 && x >= bpp ? raw[previousRowOffset + x - bpp] : 0;
      switch (filter) {
        case 0:
          raw[rowOffset + x] = value;
          break;
        case 1:
          raw[rowOffset + x] = (value + left) & 0xff;
          break;
        case 2:
          raw[rowOffset + x] = (value + up) & 0xff;
          break;
        case 3:
          raw[rowOffset + x] = (value + Math.floor((left + up) / 2)) & 0xff;
          break;
        case 4:
          raw[rowOffset + x] = (value + paeth(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`${label}: unsupported PNG filter ${filter}`);
      }
    }
    sourceOffset += stride;
  }
  return raw;
}

function indexedPixel(raw: Uint8Array, stride: number, bitDepth: number, x: number, y: number): number {
  const rowOffset = y * stride;
  if (bitDepth === 8) {
    return raw[rowOffset + x];
  }
  const pixelsPerByte = 8 / bitDepth;
  const byte = raw[rowOffset + Math.floor(x / pixelsPerByte)];
  const shift = (pixelsPerByte - 1 - (x % pixelsPerByte)) * bitDepth;
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

export function decodePngRgba(bytes: Uint8Array, label = "PNG image"): PngRgba {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 24 || !PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    throw new Error(`${label}: not a PNG`);
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compression = 0;
  let filterMethod = 0;
  let interlace = 0;
  let palette: Buffer | undefined;
  let transparency: Buffer | undefined;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      compression = data[10];
      filterMethod = data[11];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || compression !== 0 || filterMethod !== 0 || interlace !== 0 || idat.length === 0) {
    throw new Error(`${label}: unsupported PNG header`);
  }
  if (bitDepth !== 8 && !(colorType === 3 && [1, 2, 4].includes(bitDepth))) {
    throw new Error(`${label}: unsupported PNG bit depth ${bitDepth} for color type ${colorType}`);
  }

  const raw = unfilterScanlines({
    inflated: inflateSync(Buffer.concat(idat)),
    width,
    height,
    colorType,
    bitDepth,
    label
  });
  const rgba = new Uint8Array(width * height * 4);
  const stride = Math.ceil(width * bitsPerPixel(colorType, bitDepth) / 8);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      if (colorType === 6) {
        const source = y * stride + x * 4;
        rgba[out] = raw[source];
        rgba[out + 1] = raw[source + 1];
        rgba[out + 2] = raw[source + 2];
        rgba[out + 3] = raw[source + 3];
      } else if (colorType === 2) {
        const source = y * stride + x * 3;
        rgba[out] = raw[source];
        rgba[out + 1] = raw[source + 1];
        rgba[out + 2] = raw[source + 2];
        rgba[out + 3] = 255;
      } else if (colorType === 3) {
        if (!palette) {
          throw new Error(`${label}: indexed PNG is missing PLTE`);
        }
        const index = indexedPixel(raw, stride, bitDepth, x, y);
        rgba[out] = palette[index * 3] ?? 0;
        rgba[out + 1] = palette[index * 3 + 1] ?? 0;
        rgba[out + 2] = palette[index * 3 + 2] ?? 0;
        rgba[out + 3] = transparency?.[index] ?? 255;
      } else if (colorType === 4) {
        const source = y * stride + x * 2;
        const gray = raw[source];
        rgba[out] = gray;
        rgba[out + 1] = gray;
        rgba[out + 2] = gray;
        rgba[out + 3] = raw[source + 1];
      } else if (colorType === 0) {
        const gray = raw[y * stride + x];
        rgba[out] = gray;
        rgba[out + 1] = gray;
        rgba[out + 2] = gray;
        rgba[out + 3] = 255;
      } else {
        throw new Error(`${label}: unsupported PNG color type ${colorType}`);
      }
    }
  }
  return { width, height, rgba };
}
