export function shapeMask(width, height, kind, points) {
  const mask = new Uint8Array(width * height);
  if (!points.length) return mask;
  if (kind === 'lasso') {
    if (points.length < 3) return mask;
    let top = height, bottom = 0;
    for (const {y} of points) {
      top = Math.min(top, Math.floor(y));
      bottom = Math.max(bottom, Math.ceil(y));
    }
    for (let y = Math.max(0, top); y < Math.min(height, bottom); y++) {
      const intersections = [], row = y + .5;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a.y > row) === (b.y > row)) continue;
        intersections.push(a.x + (b.x - a.x) * (row - a.y) / (b.y - a.y));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const start = Math.max(0, Math.ceil(intersections[i] - .5));
        const end = Math.min(width, Math.ceil(intersections[i + 1] - .5));
        if (end > start) mask.fill(1, y * width + start, y * width + end);
      }
    }
    return mask;
  }
  const first = points[0], last = points.at(-1);
  const left = Math.max(0, Math.floor(Math.min(first.x, last.x)));
  const top = Math.max(0, Math.floor(Math.min(first.y, last.y)));
  const right = Math.min(width, Math.max(left + 1, Math.ceil(Math.max(first.x, last.x))));
  const bottom = Math.min(height, Math.max(top + 1, Math.ceil(Math.max(first.y, last.y))));
  if (left >= right || top >= bottom) return mask;
  const rx = (right - left) / 2, ry = (bottom - top) / 2;
  for (let y = top; y < bottom; y++) {
    if (kind === 'rect') {
      mask.fill(1, y * width + left, y * width + right);
      continue;
    }
    const dy = (y + .5 - top - ry) / ry, reach = rx * Math.sqrt(1 - dy ** 2);
    const firstX = Math.ceil(left + rx - reach - .5);
    const afterLastX = Math.floor(left + rx + reach - .5) + 1;
    if (afterLastX > firstX) mask.fill(1, y * width + firstX, y * width + afterLastX);
  }
  return mask;
}

export function combineMasks(current, next, mode) {
  if (!current || mode === 'replace') return next;
  const mask = new Uint8Array(next.length);
  for (let i = 0; i < mask.length; i++) {
    if (mode === 'add') mask[i] = current[i] | next[i];
    else if (mode === 'intersect') mask[i] = current[i] & next[i];
    else mask[i] = current[i] & (1 - next[i]);
  }
  return mask;
}

export function colorMask(image, x, y, {contiguous = true, tolerance = 0, selection} = {}) {
  const {data, width, height} = image, mask = new Uint8Array(width * height);
  x = Math.floor(x);
  y = Math.floor(y);
  if (!(x >= 0 && y >= 0 && x < width && y < height)) return mask;
  const seed = y * width + x, offset = seed * 4;
  const r = data[offset], g = data[offset + 1], b = data[offset + 2], a = data[offset + 3];
  const limit = Math.max(0, Math.min(255, tolerance));
  function matches(pixel) {
    if (selection && !selection[pixel]) return false;
    const i = pixel * 4, alpha = data[i + 3];
    return Math.abs(alpha - a) <= limit
      && ((!alpha && !a) || (Math.abs(data[i] - r) <= limit
        && Math.abs(data[i + 1] - g) <= limit && Math.abs(data[i + 2] - b) <= limit));
  }
  if (!contiguous) {
    for (let i = 0; i < mask.length; i++) mask[i] = Number(matches(i));
    return mask;
  }
  if (!matches(seed)) return mask;
  const queue = new Uint32Array(mask.length);
  let first = 0, last = 0;
  function enqueue(pixel) {
    if (mask[pixel] || !matches(pixel)) return;
    mask[pixel] = 1;
    queue[last++] = pixel;
  }
  enqueue(seed);
  while (first < last) {
    const index = queue[first++], column = index % width;
    if (column) enqueue(index - 1);
    if (column + 1 < width) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < mask.length - width) enqueue(index + width);
  }
  return mask;
}

export function fillPixels(image, x, y, rgba, {selection, tolerance = 0} = {}) {
  const mask = colorMask(image, x, y, {selection, tolerance});
  const {data} = image, alpha = rgba[3] / 255;
  if (!alpha) return image;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const offset = i * 4, destinationWeight = data[offset + 3] / 255 * (1 - alpha);
    const outputAlpha = alpha + destinationWeight;
    for (let c = 0; c < 3; c++) data[offset + c] = (rgba[c] * alpha + data[offset + c] * destinationWeight) / outputAlpha;
    data[offset + 3] = outputAlpha * 255;
  }
  return image;
}

export function gradientPixels(image, from, to, first, last, {selection, radial = false} = {}) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const size = dx * dx + dy * dy, radius = Math.sqrt(size);
  const startAlpha = first[3] / 255, endAlpha = last[3] / 255;
  const {data, width, height} = image;
  for (let y = 0, pixel = 0; y < height; y++) {
    for (let x = 0; x < width; x++, pixel++) {
      if (selection && !selection[pixel]) continue;
      const px = x + .5 - from.x, py = y + .5 - from.y;
      const raw = size ? radial ? Math.hypot(px, py) / radius : (px * dx + py * dy) / size : 0;
      const stop = Math.max(0, Math.min(1, raw));
      const startWeight = (1 - stop) * startAlpha, endWeight = stop * endAlpha;
      const alpha = startWeight + endWeight;
      if (!alpha) continue;
      const offset = pixel * 4, destinationWeight = data[offset + 3] / 255 * (1 - alpha);
      const outputAlpha = alpha + destinationWeight;
      for (let c = 0; c < 3; c++) {
        data[offset + c] = (first[c] * startWeight + last[c] * endWeight + data[offset + c] * destinationWeight) / outputAlpha;
      }
      data[offset + 3] = outputAlpha * 255;
    }
  }
  return image;
}
