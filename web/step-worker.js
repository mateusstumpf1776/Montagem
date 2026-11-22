importScripts('./occt-import-js.js');

const views = [
  { view: 'projeção isométrica', right: [.7071, -.7071, 0], up: [-.4082, -.4082, .8165], depth: [.5774, .5774, .5774] },
  { view: 'projeção XZ (+Y)', right: [-1, 0, 0], up: [0, 0, 1], depth: [0, 1, 0] },
  { view: 'projeção XY (+Z)', right: [1, 0, 0], up: [0, 1, 0], depth: [0, 0, 1] }
];

function project(meshes, view) {
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  const points = meshes.map(mesh => {
    const positions = mesh.attributes.position.array;
    const projected = new Float64Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      const dot = vector => positions[i] * vector[0] + positions[i + 1] * vector[1] + positions[i + 2] * vector[2];
      const x = dot(view.right), y = dot(view.up);
      projected[i] = x;
      projected[i + 1] = y;
      projected[i + 2] = dot(view.depth);
      left = Math.min(left, x);
      right = Math.max(right, x);
      bottom = Math.min(bottom, y);
      top = Math.max(top, y);
    }
    return projected;
  });
  const scale = 1220 / Math.max(right - left, top - bottom);
  if (!Number.isFinite(scale)) throw new Error('O STEP não contém geometria visualizável.');
  const width = Math.ceil((right - left) * scale) + 90;
  const height = Math.ceil((top - bottom) * scale) + 90;
  const target = new OffscreenCanvas(width, height);
  const ctx = target.getContext('2d', { alpha: false });
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  const triangles = [];
  meshes.forEach((mesh, n) => {
    const position = points[n];
    const indices = mesh.index.array;
    const positions3d = mesh.attributes.position.array;
    const base = mesh.color ?? [.49 + (n % 3) * .09, .58 + (n % 4) * .07, .71 + (n % 2) * .12];
    for (let i = 0; i < indices.length; i += 3) {
      const a = 3 * indices[i], b = 3 * indices[i + 1], c = 3 * indices[i + 2];
      const ax = position[a], ay = position[a + 1];
      const bx = position[b], by = position[b + 1];
      const cx = position[c], cy = position[c + 1];
      if (Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) < 1e-8) continue;
      const ux = positions3d[b] - positions3d[a], uy = positions3d[b + 1] - positions3d[a + 1], uz = positions3d[b + 2] - positions3d[a + 2];
      const vx = positions3d[c] - positions3d[a], vy = positions3d[c + 1] - positions3d[a + 1], vz = positions3d[c + 2] - positions3d[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const shade = .61 + .39 * Math.abs(.31 * nx + .42 * ny + .852 * nz) / (Math.hypot(nx, ny, nz) || 1);
      triangles.push({ ax, ay, bx, by, cx, cy, z: position[a + 2] + position[b + 2] + position[c + 2], shade, base });
    }
  });
  triangles.sort((a, b) => a.z - b.z);
  ctx.lineWidth = .75;
  for (const { ax, ay, bx, by, cx, cy, shade, base } of triangles) {
    ctx.beginPath();
    ctx.moveTo(45 + (ax - left) * scale, 45 + (top - ay) * scale);
    ctx.lineTo(45 + (bx - left) * scale, 45 + (top - by) * scale);
    ctx.lineTo(45 + (cx - left) * scale, 45 + (top - cy) * scale);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle = `rgb(${base.map(channel => Math.round(255 * channel * shade)).join(',')})`;
    ctx.stroke();
    ctx.fill();
  }
  return target.convertToBlob({ type: 'image/jpeg', quality: .91 });
}

self.onmessage = async ({ data }) => {
  try {
    const reader = await occtimportjs();
    const model = reader.ReadStepFile(new Uint8Array(data), { linearUnit: 'millimeter', linearDeflection: .002, angularDeflection: .5 });
    if (!model.success || !model.meshes.length) throw new Error('Nenhuma geometria encontrada no STEP.');
    if (model.meshes.reduce((total, mesh) => total + mesh.index.array.length / 3, 0) > 250000) {
      throw new Error('O modelo STEP é grande demais. Exporte as peças relevantes ou use um PDF de vistas.');
    }
    const projections = [];
    for (const view of views) projections.push({ view: view.view, blob: await project(model.meshes, view) });
    self.postMessage(projections);
  } catch (error) {
    self.postMessage({ error: 'Falha ao ler o STEP. ' + error.message });
  }
};
