import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--plugin-root");
const pluginRoot = path.resolve(
  rootIndex >= 0 && args[rootIndex + 1]
    ? args[rootIndex + 1]
    : "de.rhao92.thebus-telemetry-interface.sdPlugin",
);
const requireMonochrome = args.includes("--marketplace");
const manifest = JSON.parse(
  fs.readFileSync(path.join(pluginRoot, "manifest.json"), "utf8"),
);

function readPngSize(filePath) {
  const data = fs.readFileSync(filePath);
  const signature = "89504e470d0a1a0a";
  if (data.length < 24 || data.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`Not a valid PNG: ${filePath}`);
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function readRgbaPixels(filePath) {
  const data = fs.readFileSync(filePath);
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const compressed = [];

  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      interlace = chunk[12];
    } else if (type === "IDAT") {
      compressed.push(chunk);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `Marketplace color audit needs a non-interlaced 8-bit RGBA PNG: ${filePath}`,
    );
  }

  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const source = raw[inputOffset + x];
      const left = x >= 4 ? pixels[rowOffset + x - 4] : 0;
      const above = y > 0 ? pixels[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= 4
        ? pixels[rowOffset - stride + x - 4]
        : 0;
      let value;
      if (filter === 0) value = source;
      else if (filter === 1) value = source + left;
      else if (filter === 2) value = source + above;
      else if (filter === 3) value = source + Math.floor((left + above) / 2);
      else if (filter === 4) {
        const prediction = left + above - upperLeft;
        const distanceLeft = Math.abs(prediction - left);
        const distanceAbove = Math.abs(prediction - above);
        const distanceUpperLeft = Math.abs(prediction - upperLeft);
        const predictor = distanceLeft <= distanceAbove && distanceLeft <= distanceUpperLeft
          ? left
          : distanceAbove <= distanceUpperLeft
            ? above
            : upperLeft;
        value = source + predictor;
      } else {
        throw new Error(`Unsupported PNG filter ${filter}: ${filePath}`);
      }
      pixels[rowOffset + x] = value & 0xff;
    }
    inputOffset += stride;
  }

  return pixels;
}

function assertWhiteTransparent(filePath) {
  const pixels = readRgbaPixels(filePath);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const [red, green, blue, alpha] = pixels.subarray(offset, offset + 4);
    if (alpha > 0 && (red !== 255 || green !== 255 || blue !== 255)) {
      throw new Error(`Non-white visible pixel in marketplace icon: ${filePath}`);
    }
  }
}

function assertPng(baseRef, suffix, expectedSize) {
  const filePath = path.join(pluginRoot, `${baseRef}${suffix}.png`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing icon asset: ${filePath}`);
  }
  const size = readPngSize(filePath);
  if (size.width !== expectedSize || size.height !== expectedSize) {
    throw new Error(
      `Wrong icon size for ${filePath}: ${size.width}x${size.height}, expected ${expectedSize}x${expectedSize}`,
    );
  }
}

assertPng(manifest.Icon, "", 256);
assertPng(manifest.Icon, "@2x", 512);
assertPng(manifest.CategoryIcon, "", 28);
assertPng(manifest.CategoryIcon, "@2x", 56);

const visibleActions = manifest.Actions.filter(
  (action) => action.VisibleInActionsList !== false,
);
const visibleIconRefs = new Set(visibleActions.map((action) => action.Icon));
for (const iconRef of visibleIconRefs) {
  assertPng(iconRef, "", 20);
  assertPng(iconRef, "@2x", 40);
}

if (requireMonochrome) {
  const monochromeFiles = [
    path.join(pluginRoot, `${manifest.CategoryIcon}.png`),
    path.join(pluginRoot, `${manifest.CategoryIcon}@2x.png`),
  ];
  for (const iconRef of visibleIconRefs) {
    monochromeFiles.push(path.join(pluginRoot, `${iconRef}.png`));
    monochromeFiles.push(path.join(pluginRoot, `${iconRef}@2x.png`));
  }
  for (const filePath of monochromeFiles) assertWhiteTransparent(filePath);
}

console.log(
  `Icon asset audit passed${requireMonochrome ? " (marketplace monochrome)" : ""}: ${visibleActions.length} visible actions, ${visibleIconRefs.size} unique action-list icon pairs.`,
);
