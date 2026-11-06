/* Shared 3D helpers for the product card hover and the product page viewer */
import * as THREE from 'three';
import { GLTFLoader } from './gltf-loader.js';
import { MeshoptDecoder } from './meshopt-decoder.js';
import { RoomEnvironment } from './room-environment.js';

const FOV = 25;
const FILL_HEIGHT = 0.8, FILL_WIDTH = 0.92; // share of the view a model may occupy

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const models = new Map(); // url > promise of a centred model

export function loadModel(url) {
  if (!models.has(url)) {
    models.set(url, loader.loadAsync(url).then((gltf) => {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      gltf.scene.position.sub(box.getCenter(new THREE.Vector3()));
      const model = new THREE.Group();
      model.add(gltf.scene);
      model.userData.size = size;
      return model;
    }));
  }
  return models.get(url);
}

export function createStudio(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(0.3, 0.8, 1);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(-1, 0.4, -0.6);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(FOV, 0.8, 0.1, 50);
  camera.position.z = 4;
  const viewHeight = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const turn = new THREE.Group();
  scene.add(turn);

  return {
    renderer, scene, camera, turn, rim, viewHeight,
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    show(model) {
      const { size } = model.userData;
      const width = viewHeight * camera.aspect;
      model.scale.setScalar(Math.min((viewHeight * FILL_HEIGHT) / size.y, (width * FILL_WIDTH) / Math.max(size.x, size.z)));
      turn.clear();
      turn.add(model);
    },
    render() { renderer.render(scene, camera); },
  };
}
