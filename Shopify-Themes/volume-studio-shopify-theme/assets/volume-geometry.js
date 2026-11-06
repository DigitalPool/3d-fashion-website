import * as THREE from 'three';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const signed = (n, p) => Math.sign(n) * Math.pow(Math.abs(n), p);

function surface(cols, rows, sample, material) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    positions.push(...sample(i / cols, j / rows));
    uvs.push(i / cols, j / rows);
    if (i < cols && j < rows) {
      const k = j * (cols + 1) + i;
      indices.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function fabricTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4;
    const shade = 125 + 28 * Math.cos(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) + ((x * 17 + y * 41) % 13);
    data.data.set([shade, shade, shade, 255], i);
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(13, 13);
  return texture;
}

function seam(group, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, radius, 6, false), material));
}

const torsoProfile = new THREE.SplineCurve([
  [.66, .28], [.74, .33], [.79, .36], [.83, .365], [.83, .34], [.76, .29], [.45, .225], [.29, .18],
].map(([x, y]) => new THREE.Vector2(x, y)));

function torso(u, t, hoodie) {
  const a = u * TAU, profile = torsoProfile.getPoint(t);
  const waist = hoodie ? -.69 : -1.06;
  const fold = .037 * Math.sin(a * 7 + t * 7) * Math.sin(Math.PI * t) + .018 * Math.sin(a * 13 - t * 15) * (1 - t);
  return [(profile.x + fold) * signed(Math.sin(a), .78),
    THREE.MathUtils.lerp(waist, .92, t) + .055 * Math.cos(2 * a) * Math.sin(Math.PI * t),
    (profile.y + fold) * signed(Math.cos(a), .83)];
}

function sleeve(side, hoodie, u, t) {
  const a = u * TAU;
  const x = side * (.59 + (hoodie ? .55 : .46) * t + .095 * Math.sin(Math.PI * t));
  const y = .59 - (hoodie ? 1.47 : .57) * t;
  const z = -.025 + .19 * t * t;
  const radius = THREE.MathUtils.lerp(.28, hoodie ? .115 : .235, t);
  const folds = .024 * Math.sin(t * 29 + 3 * Math.sin(a)) * Math.sin(Math.PI * t) +
    .016 * Math.cos(a * 6 + t * 13) * (.4 + .6 * t);
  return [x + side * Math.cos(a) * (radius + folds) * .91,
    y + Math.cos(a) * (radius + folds) * (hoodie ? .42 : .62),
    z + Math.sin(a) * (radius + folds) * 1.1];
}

function band(group, sample, t, height, material) {
  group.add(surface(64, 8, (u, v) => {
    const [x, y, z] = sample(u, t);
    return [x * 1.015, y + (v - .5) * height, z * 1.025];
  }, material));
}

function hood(group, shell, lining, stitching) {
  const shape = (u, t, inset = 0) => {
    const a = u * TAU;
    const radius = Math.cos(t * Math.PI / 2) * (1 + .11 * Math.sin(t * Math.PI));
    return [Math.sin(a) * (.465 - inset) * radius * (1 + .1 * Math.cos(a)),
      1.15 + Math.cos(a) * (.52 - inset) * radius + .15 * t,
      .31 - .75 * t + .055 * Math.cos(a) * (1 - t)];
  };
  group.add(surface(64, 40, (u, t) => shape(u, t), shell));
  group.add(surface(64, 32, (u, t) => {
    const [x,y,z] = shape(u,t,.035); return [x,y,z-.012];
  }, lining));
  seam(group, Array.from({ length: 65 }, (_, i) => V(...shape(i / 64, 0))), .02, stitching);
  seam(group, Array.from({ length: 22 }, (_, i) => V(...shape(0, i / 23)).add(V(0, .007, 0))), .006, stitching);
}

function chestMark(group, hoodie, texture, width, height) {
  const top = hoodie ? .39 : .51;
  group.add(surface(32, 24, (u, v) => {
    const targetX = (u - .5) * width;
    const t = (top - (1 - v) * height + (hoodie ? .69 : 1.06)) / (hoodie ? 1.61 : 1.98);
    let min = -.24, max = .24;
    for (let n = 0; n < 12; n++) {
      const mid = (min + max) / 2;
      if (torso(mid, t, hoodie)[0] < targetX) min = mid;
      else max = mid;
    }
    const [x,y,z] = torso((min + max) / 2,t,hoodie);
    return [x,y,z+.012];
  }, new THREE.MeshStandardMaterial({ map: texture, color: '#ffffff', transparent: hoodie, side: THREE.DoubleSide, roughness: .85, depthWrite: !hoodie })));
}

function wordmark() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eeeae5';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 92px Arial';
  ctx.fillText('APSHT', 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildGarment(kind, shade, print) {
  const group = new THREE.Group();
  const knit = fabricTexture();
  const make = (color, bump = .018) => new THREE.MeshPhysicalMaterial({
    color, bumpMap: knit, bumpScale: bump, roughness: .87, sheen: .65, sheenColor: new THREE.Color('#a7a2ac'),
    sheenRoughness: .8, side: THREE.DoubleSide,
  });
  const shell = make(shade);
  const stitch = make(new THREE.Color(shade).multiplyScalar(.76));
  const dark = make('#0b090d', .01);
  if (kind === 'trousers') {
    const white = make('#e2dedb', .009);
    const hip = (u, t) => {
      const a = u * TAU;
      return [Math.sin(a) * (.68 - .08 * t), .71 + t * .46, Math.cos(a) * (.32 - .055 * t)];
    };
    group.add(surface(64, 18, hip, shell));
    band(group, hip, .94, .13, stitch);
    for (const side of [-1, 1]) {
      const leg = (u, t, extra = 0) => {
        const a = u * TAU;
        const rad = .36 + .035 * Math.sin(t * Math.PI) + .022 * Math.sin(t * 26 + Math.sin(a) * 3) * (1 - t);
        const center = side * (.345 + .10 * (1 - t));
        return [center + Math.sin(a) * (rad + extra), -1.35 + t * 2.14,
          Math.cos(a) * (rad * .81 + extra) + .065 * Math.sin(t * 4)];
      };
      group.add(surface(64, 64, leg, shell));
      for (let stripe = 0; stripe < 3; stripe++) {
        group.add(surface(6, 56, (u, v) => {
          const t = .035 + v * .76;
          const sideAngle = side * (.13 + .08 * Math.sin(v * Math.PI / 2) + stripe * .032);
          return leg(sideAngle + (u - .5) * .012, t, .009);
        }, white));
      }
      seam(group, Array.from({length:65}, (_,i) => V(...leg(i/64,.023))), .015, stitch);
    }
    return group;
  }
  if (kind === 'mask') {
    const sample = (u, t) => {
      const a = u * TAU;
      const rad = .78 * (t < .66 ? 1 + .05 * Math.sin(t * 13) : Math.sqrt(1 - Math.pow((t - .66) / .342, 2)));
      return [Math.sin(a) * rad, (t - .48) * 2.7, Math.cos(a) * rad * .76];
    };
    group.add(surface(72, 56, sample, shell));
    const slit = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 22), dark);
    slit.scale.set(.63, .135, .10); slit.position.set(0,.31,.56); group.add(slit);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(.39,.10), new THREE.MeshStandardMaterial({map:wordmark(),transparent:true,side:THREE.DoubleSide}));
    mark.position.set(0,-.04,.637); group.add(mark);
    return group;
  }

  const hoodie = kind === 'hoodie';
  const body = (u, t) => torso(u, t, hoodie);
  group.add(surface(80, 58, body, shell));
  band(group, body, .02, hoodie ? .13 : .055, stitch);
  const collar = new THREE.Mesh(new THREE.CircleGeometry(.29, 40), dark);
  collar.rotation.x = -Math.PI / 2; collar.position.y = .916; collar.scale.y = .66; group.add(collar);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.29, .028, 8, 56), stitch);
  rim.rotation.x = Math.PI / 2; rim.scale.y = .66; rim.position.y = .925; group.add(rim);
  for (const side of [-1,1]) {
    const arm = (u, t) => sleeve(side, hoodie, u, t);
    group.add(surface(48, 52, arm, shell));
    seam(group, Array.from({length:49}, (_, i) => V(...arm(i/48,.96))), hoodie ? .032 : .012, stitch);
    seam(group, Array.from({length:49}, (_, i) => V(...arm(i/48,.12))), .008, stitch);
  }
  if (hoodie) {
    hood(group, shell, dark, stitch);
    chestMark(group,true,wordmark(),.56,.14);
  } else if (print) {
    chestMark(group,false,print,kind === 'white-tee' ? .68 : .93,kind === 'white-tee' ? 1.13 : .89);
  }
  return group;
}

export function releaseGarment(group) {
  const textures = new Set();
  group.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    for (const texture of [node.material.bumpMap, node.material.map]) if (texture) textures.add(texture);
    node.material.dispose();
  });
  textures.forEach((texture) => texture.dispose());
}
