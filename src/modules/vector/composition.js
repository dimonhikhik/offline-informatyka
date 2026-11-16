import { bounds,combined } from './model.js';

function units(objects) {
  const groups = new Map();
  for (const object of objects) {
    const id = object.group || object.id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(object);
  }
  return [...groups.values()].map(items => ({items, box:combined(items)}));
}

function shift(unit, axis, distance) {
  for (const object of unit.items) object[axis] += distance;
}

export function alignSelection(objects, axis, alignment, page) {
  const size = axis === 'x' ? 'w' : 'h';
  const selected = units(objects);
  const target = selected.length === 1 ? {x:0,y:0,w:page.width,h:page.height} : combined(objects);
  if (!target) return;
  for (const unit of selected) {
    shift(unit, axis, target[axis] + target[size] * alignment - unit.box[axis] - unit.box[size] * alignment);
  }
}

export function distributeSelection(objects, axis, byGap) {
  const size = axis === 'x' ? 'w' : 'h';
  const position = box => box[axis] + (byGap ? 0 : box[size] / 2);
  const selected = units(objects).sort((a, b) => position(a.box) - position(b.box));
  if (selected.length < 3) throw new Error('Вибери щонайменше три об’єкти або групи.');
  const first = selected[0].box, last = selected.at(-1).box;
  const total = selected.reduce((sum, unit) => sum + unit.box[size], 0);
  const space = (byGap ? last[axis] + last[size] - first[axis] - total : position(last) - position(first)) / (selected.length - 1);
  let target = position(first);
  for (const unit of selected) {
    shift(unit, axis, target - position(unit.box));
    target += space + (byGap ? unit.box[size] : 0);
  }
}

export function moveStack(doc, ids, direction) {
  const layers = new Map(doc.layers.map(layer => [layer.id, []]));
  for (const object of doc.objects) layers.get(object.layer).push(object);
  for (const [key, stack] of layers) {
    if (direction === 'top' || direction === 'bottom') {
      const selected = stack.filter(object => ids.has(object.id));
      const others = stack.filter(object => !ids.has(object.id));
      layers.set(key, direction === 'top' ? [...others, ...selected] : [...selected, ...others]);
      continue;
    }
    const forward = direction === 'forward';
    for (let i = 0; i < stack.length - 1; i++) {
      const current = forward ? stack.length - 2 - i : i + 1;
      const neighbor = current + (forward ? 1 : -1);
      if (ids.has(stack[current].id) && !ids.has(stack[neighbor].id)) {
        [stack[current], stack[neighbor]] = [stack[neighbor], stack[current]];
      }
    }
  }
  doc.objects = [...layers.values()].flat();
}

export function reflectSelection(objects, axis) {
  const frame = combined(objects);
  const size = axis === 'x' ? 'w' : 'h', flag = axis === 'x' ? 'flipX' : 'flipY';
  for (const object of objects) {
    const box = bounds(object);
    object[axis] += 2 * (frame[axis] - box[axis]) + frame[size] - box[size];
    object.angle = -object.angle;
    object[flag] = !object[flag];
  }
}
