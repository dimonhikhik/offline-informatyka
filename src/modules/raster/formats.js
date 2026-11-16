const U8 = Uint8Array;
const ppm = dpi => Math.round(dpi / .0254);

function blobFromCanvas(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не вдалося підготувати зображення.')), type, .92);
  });
}

function encodeBmp({data, width, height}, dpi) {
  const stride = Math.ceil(width * 3 / 4) * 4;
  const bytes = new U8(54 + stride * height), view = new DataView(bytes.buffer);
  bytes.set([66, 77]);
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, stride * height, true);
  view.setInt32(38, ppm(dpi), true);
  view.setInt32(42, ppm(dpi), true);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4, dest = 54 + (height - y - 1) * stride + x * 3;
      const alpha = data[src + 3] / 255;
      for (let c = 0; c < 3; c++) bytes[dest + c] = Math.round(data[src + 2 - c] * alpha + 255 * (1 - alpha));
    }
  }
  return new Blob([bytes], {type:'image/bmp'});
}

function encodeTiff({data, width, height}, dpi) {
  const tags = 15, bits = 8 + 2 + tags * 12 + 4, resolution = bits + 8, pixels = resolution + 8;
  const header = new U8(pixels), view = new DataView(header.buffer);
  header.set([73, 73, 42, 0, 8, 0, 0, 0]);
  view.setUint16(8, tags, true);
  let offset = 10;
  function tag(id, type, count, value) {
    view.setUint16(offset, id, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, value, true);
    offset += 12;
  }
  tag(256, 4, 1, width);
  tag(257, 4, 1, height);
  tag(258, 3, 4, bits);
  tag(259, 3, 1, 1);
  tag(262, 3, 1, 2);
  tag(273, 4, 1, pixels);
  tag(277, 3, 1, 4);
  tag(278, 4, 1, height);
  tag(279, 4, 1, data.length);
  tag(282, 5, 1, resolution);
  tag(283, 5, 1, resolution);
  tag(284, 3, 1, 1);
  tag(296, 3, 1, 2);
  tag(338, 3, 1, 2);
  tag(339, 3, 1, 1);
  for (let i = 0; i < 4; i++) view.setUint16(bits + 2 * i, 8, true);
  view.setUint32(resolution, dpi, true);
  view.setUint32(resolution + 4, 1, true);
  return new Blob([header, data], {type:'image/tiff'});
}

function encodeGif({data, width, height}) {
  const header = new U8(13 + 768 + 8 + 10 + 1);
  const view = new DataView(header.buffer);
  header.set([71, 73, 70, 56, 57, 97]);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  header[10] = 0xf7;
  header[11] = 255;
  for (let r = 0, i = 13; r < 6; r++) {
    for (let g = 0; g < 7; g++) {
      for (let b = 0; b < 6; b++, i += 3) {
        header[i] = Math.round(r * 255 / 5);
        header[i + 1] = Math.round(g * 255 / 6);
        header[i + 2] = Math.round(b * 255 / 5);
      }
    }
  }
  const extension = 13 + 768, descriptor = extension + 8;
  header.set([0x21, 0xf9, 4, 1, 0, 0, 255, 0], extension);
  header[descriptor] = 0x2c;
  view.setUint16(descriptor + 5, width, true);
  view.setUint16(descriptor + 7, height, true);
  header[descriptor + 10] = 8;

  const pixelCount = width * height;
  const coded = new U8(Math.ceil((pixelCount + Math.ceil(pixelCount / 240) + 1) * 9 / 8));
  let byte = 0, bits = 0, length = 0;
  function code(value) {
    byte |= value << bits;
    bits += 9;
    while (bits >= 8) {
      coded[length++] = byte & 255;
      byte >>= 8;
      bits -= 8;
    }
  }
  // Resets keep the GIF dictionary within nine bits.
  for (let i = 0; i < pixelCount; i++) {
    if (i % 240 === 0) code(256);
    const offset = i * 4, alpha = data[offset + 3];
    if (alpha < 128) {
      code(255);
      continue;
    }
    const r = Math.round(data[offset] * 5 / 255);
    const g = Math.round(data[offset + 1] * 6 / 255);
    const b = Math.round(data[offset + 2] * 5 / 255);
    code(r * 42 + g * 6 + b);
  }
  code(257);
  if (bits) coded[length++] = byte;
  const blocks = new U8(length + Math.ceil(length / 255) + 2);
  let cursor = 0;
  for (let start = 0; start < length; start += 255) {
    const block = coded.subarray(start, Math.min(start + 255, length));
    blocks[cursor++] = block.length;
    blocks.set(block, cursor);
    cursor += block.length;
  }
  blocks[cursor + 1] = 0x3b;
  return new Blob([header, blocks], {type:'image/gif'});
}

async function pngDensity(blob, dpi) {
  const raw = new U8(await blob.arrayBuffer()), input = new DataView(raw.buffer);
  const chunk = new U8(21), view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, ppm(dpi));
  view.setUint32(12, ppm(dpi));
  chunk[16] = 1;
  let crc = -1;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, crc ^ -1);
  const parts = [raw.subarray(0, 8)];
  for (let offset = 8; offset + 12 <= raw.length;) {
    const end = offset + 12 + input.getUint32(offset), name = input.getUint32(offset + 4);
    if (name !== 0x70485973) parts.push(raw.subarray(offset, end));
    if (name === 0x49484452) parts.push(chunk);
    offset = end;
  }
  return new Blob(parts, {type:'image/png'});
}

async function jpegDensity(blob, dpi) {
  const raw = new U8(await blob.arrayBuffer());
  if (raw[2] === 255 && raw[3] === 224 && raw[6] === 74 && raw[7] === 70 && raw[8] === 73 && raw[9] === 70) {
    const view = new DataView(raw.buffer);
    raw[13] = 1;
    view.setUint16(14, dpi);
    view.setUint16(16, dpi);
    return new Blob([raw], {type:'image/jpeg'});
  }
  const density = new U8([255,224,0,16,74,70,73,70,0,1,1,1,0,0,0,0,0,0]);
  const view = new DataView(density.buffer);
  view.setUint16(12, dpi);
  view.setUint16(14, dpi);
  return new Blob([raw.subarray(0, 2), density, raw.subarray(2)], {type:'image/jpeg'});
}

export async function encodeRaster(canvas, format, options = {}) {
  const dpi = Math.round(Math.max(1, Math.min(2400, Number(options.dpi) || 96)));
  if (format === 'png') return pngDensity(await blobFromCanvas(canvas, 'image/png'), dpi);
  if (format === 'jpeg' || format === 'jpg') {
    const opaque = document.createElement('canvas');
    opaque.width = canvas.width;
    opaque.height = canvas.height;
    const ctx = opaque.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvas, 0, 0);
    return jpegDensity(await blobFromCanvas(opaque, 'image/jpeg'), dpi);
  }
  const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  if (format === 'bmp') return encodeBmp(image, dpi);
  if (format === 'gif') return encodeGif(image);
  if (format === 'tiff' || format === 'tif') return encodeTiff(image, dpi);
  throw new Error('Невідомий формат зображення.');
}

export async function decodeTiff(blob, maxSide) {
  const bytes = new U8(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
  const bad = () => { throw new Error('Підтримується нестиснений TIFF із 8-бітними каналами RGB або відтінками сірого.'); };
  if (bytes.length < 8) bad();
  const order = view.getUint16(0), little = order === 0x4949;
  if (!little && order !== 0x4d4d || view.getUint16(2, little) !== 42) bad();
  const directory = view.getUint32(4, little);
  if (directory + 2 > bytes.length) bad();
  const count = view.getUint16(directory, little);
  if (count > 256 || directory + 2 + 12 * count > bytes.length) bad();
  const tags = new Map();
  for (let i = 0; i < count; i++) {
    const entry = directory + 2 + i * 12;
    tags.set(view.getUint16(entry, little), entry);
  }
  function values(id) {
    const entry = tags.get(id);
    if (entry === undefined) return [];
    const type = view.getUint16(entry + 2, little), count = view.getUint32(entry + 4, little);
    const size = {1:1,3:2,4:4,5:8}[type];
    if (!size || !count || count > maxSide * 2) bad();
    const offset = count * size <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
    if (offset + count * size > bytes.length) bad();
    return Array.from({length:count}, (_, i) => {
      const p = offset + i * size;
      if (type === 1) return bytes[p];
      if (type === 3) return view.getUint16(p, little);
      if (type === 4) return view.getUint32(p, little);
      return view.getUint32(p, little) / view.getUint32(p + 4, little);
    });
  }
  const value = (id, fallback) => values(id)[0] ?? fallback;
  const width = value(256), height = value(257), channels = value(277, 1);
  if (!(width > 0 && width <= maxSide && height > 0 && height <= maxSide)) {
    throw new Error('Розмір TIFF перевищує межу '+maxSide+' пікселів на сторону.');
  }
  const photometric = value(262, 1), color = photometric === 2;
  const required = color ? 3 : 1, hasAlpha = channels === required + 1;
  if (![0,1,2].includes(photometric) || !(channels === required || hasAlpha)
    || value(259,1) !== 1 || value(274,1) !== 1 || value(284,1) !== 1
    || values(258).some(depth => depth !== 8) || !values(258).length
    || values(339).some(sample => sample !== 1)) bad();
  const offsets = values(273), byteCounts = values(279), rows = value(278,height);
  const strips = Math.ceil(height / rows), premultiplied = hasAlpha && value(338) === 1;
  if (rows < 1 || !Number.isFinite(rows) || offsets.length !== strips || byteCounts.length !== strips) bad();
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let strip = 0; strip < strips; strip++) {
    const origin = offsets[strip], first = strip * rows * width, length = Math.min(rows, height - strip * rows) * width;
    if (byteCounts[strip] < length * channels || origin + length * channels > bytes.length) bad();
    for (let i = 0; i < length; i++) {
      const source = origin + i * channels, destination = (first + i) * 4;
      const alpha = hasAlpha ? bytes[source + required] : 255;
      const gray = photometric === 0 ? 255 - bytes[source] : bytes[source];
      for (let c = 0; c < 3; c++) {
        const channel = color ? bytes[source + c] : gray;
        pixels[destination + c] = premultiplied ? alpha ? channel * 255 / alpha : 0 : channel;
      }
      pixels[destination + 3] = alpha;
    }
  }
  const resolution = value(282,100) * (value(296,2) === 3 ? 2.54 : 1);
  const dpi = Number.isFinite(resolution) ? Math.max(1,Math.min(1200,Math.round(resolution))) : 100;
  return {pixels,width,height,dpi};
}
