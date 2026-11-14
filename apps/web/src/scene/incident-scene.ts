import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { ThreatTag } from "@incident-commander/cards";

export type SceneState = {
  threatTag: ThreatTag | null;
  bleeds: number;
  stability: number;
  stabilityTarget: number;
  harm: number;
  shield: number;
  countered: boolean;
  round: number;
  cardsPlayed: number;
};

const CYAN = 0x50ffe2;
const ORANGE = 0xff5938;
const BLUE = 0x628bff;
const SERVICES = [
  { name: "GATEWAY", x: 0, z: -1.8, height: 2.6 },
  { name: "CHECKOUT", x: -3.9, z: .6, height: 1.8 },
  { name: "CATALOG", x: 3.7, z: -.3, height: 2.1 },
  { name: "DATABASE", x: -1.8, z: 4, height: 1.3 },
  { name: "PAYMENTS", x: 3.1, z: 3.7, height: 1.7 },
];
const TARGET: Record<ThreatTag, number> = { load: 0, deploy: 1, people: 2, infra: 3, sudden: 4 };
const EDGES = [[0, 1], [0, 2], [1, 3], [2, 3], [1, 4]] as const;

export function createIncidentScene(host: HTMLDivElement, initial: SceneState, onLost: () => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x050913);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050913, .023);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = .06;
  controls.minPolarAngle = .45;
  controls.maxPolarAngle = 1.15;
  controls.minAzimuthAngle = -.8;
  controls.maxAzimuthAngle = .8;
  controls.target.set(0, .6, .1);
  const resetCamera = () => {
    camera.position.set(11, 13, 19);
    controls.target.set(0, .6, .1);
    controls.update();
  };
  resetCamera();

  const renderTarget = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .75, .55, .9);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);

  scene.add(new THREE.HemisphereLight(0xa8caff, 0x132142, 2.3));
  const keyLight = new THREE.DirectionalLight(0xb7caff, 3.5);
  keyLight.position.set(4, 12, 6);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x807bff, 2.2);
  rimLight.position.set(-8, 4, -8);
  scene.add(rimLight);
  const threatLight = new THREE.PointLight(ORANGE, 35, 16, 2);
  threatLight.position.set(0, 4, -5.8);
  scene.add(threatLight);

  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  function material<T extends THREE.Material>(value: T): T { materials.add(value); return value; }
  function geometry<T extends THREE.BufferGeometry>(value: T): T { geometries.add(value); return value; }
  const dark = material(new THREE.MeshStandardMaterial({ color: 0x122036, metalness: .65, roughness: .32 }));
  const side = material(new THREE.MeshStandardMaterial({ color: 0x0b1528, metalness: .7, roughness: .28 }));
  const neon = material(new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(2) }));
  const violet = material(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x776dff).multiplyScalar(1.4) }));
  const orange = material(new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(2.5) }));
  const cube = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 6));
  const sphere = geometry(new THREE.SphereGeometry(.055, 8, 6));
  const ringGeometry = geometry(new THREE.TorusGeometry(1, .012, 6, 80));
  const platform = new THREE.Group();
  scene.add(platform);

  function box(parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }
  function ring(parent: THREE.Object3D, radius: number, y: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(ringGeometry, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(radius);
    mesh.position.y = y;
    parent.add(mesh);
    return mesh;
  }

  const deck = new THREE.Mesh(geometry(new THREE.CylinderGeometry(8.4, 8, .42, 64)), dark);
  deck.position.y = -.4;
  platform.add(deck);
  const underside = new THREE.Mesh(geometry(new THREE.CylinderGeometry(7.9, 6.6, .75, 64)), side);
  underside.position.y = -.95;
  platform.add(underside);
  ring(platform, 8.35, -.17, violet);
  ring(platform, 8, -.6, neon);
  ring(platform, 7.4, -.17, material(new THREE.MeshBasicMaterial({ color: 0x243d68 })));
  const grid = new THREE.GridHelper(12, 18, 0x3e658a, 0x223954);
  grid.position.y = -.15;
  grid.material.transparent = true;
  grid.material.opacity = .3;
  platform.add(grid);
  for (let i = 0; i < 64; i++) {
    const angle = i / 64 * Math.PI * 2;
    const tick = box(platform, Math.sin(angle) * 7.9, -.12, Math.cos(angle) * 7.9, .025, .015, i % 4 === 0 ? .3 : .12, i % 4 === 0 ? neon : violet);
    tick.rotation.y = angle;
  }

  const towers = SERVICES.map((service, index) => {
    const group = new THREE.Group();
    group.position.set(service.x, 0, service.z);
    platform.add(group);
    const glow = material(new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(1.5) }));
    const foundation = new THREE.Mesh(cylinder, side);
    foundation.scale.set(1.5, .22, 1.5);
    group.add(foundation);
    const base = new THREE.Mesh(cylinder, dark);
    base.position.y = .15;
    base.scale.set(1.3, .16, 1.3);
    group.add(base);
    ring(group, 1.38, .08, glow);
    const body = box(group, 0, service.height / 2 + .3, 0, 1.12, service.height, .95, dark);
    const outline = new THREE.LineSegments(geometry(new THREE.EdgesGeometry(cube)), material(new THREE.LineBasicMaterial({ color: 0x6684b8, transparent: true, opacity: .45 })));
    outline.scale.copy(body.scale);
    outline.position.copy(body.position);
    group.add(outline);
    for (let floor = 0; floor < service.height * 5; floor++) {
      const y = .43 + floor * .18;
      box(group, 0, y, .485, .9, .025, .015, glow);
      box(group, .568, y, 0, .015, .022, .68, floor % 3 === 0 ? glow : violet);
    }
    box(group, 0, service.height + .32, 0, 1.2, .12, 1.05, side);
    box(group, 0, service.height + .39, 0, .8, .015, .7, glow);
    // Satellite racks give each service its own little city block.
    for (let rack = 0; rack < 3; rack++) {
      const height = .3 + ((index + rack * 3) % 5) * .12;
      box(group, -.9 + rack * .35, height / 2 + .3, -.65, .22, height, .3, side);
      box(group, -.9 + rack * .35, height + .31, -.65, .2, .025, .28, violet);
    }
    const marker = new THREE.Mesh(geometry(new THREE.OctahedronGeometry(.15)), glow);
    marker.position.y = service.height + .9;
    group.add(marker);

    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 512;
    labelCanvas.height = 80;
    const ctx = labelCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(5,12,24,0.88)";
      ctx.fillRect(0, 0, 512, 80);
      ctx.strokeStyle = "#416384";
      ctx.strokeRect(1, 1, 510, 78);
      ctx.fillStyle = "#c2eaff";
      ctx.font = "500 32px monospace";
      ctx.textAlign = "center";
      ctx.fillText(service.name, 256, 51);
    }
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    const label = new THREE.Sprite(material(new THREE.SpriteMaterial({ map: texture, depthTest: false })));
    label.position.set(0, .35, 1.45);
    label.scale.set(2.15, .34, 1);
    group.add(label);
    const shield = new THREE.Mesh(geometry(new THREE.SphereGeometry(1.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), material(new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
    shield.position.y = .2;
    shield.scale.y = service.height / 1.4 + .5;
    shield.visible = false;
    group.add(shield);
    return { group, glow, marker, shield };
  });

  const routes = EDGES.map(([from, to]) => {
    const a = SERVICES[from]!;
    const b = SERVICES[to]!;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(a.x, .25, a.z),
      new THREE.Vector3(a.x, .25, (a.z + b.z) / 2),
      new THREE.Vector3(b.x, .25, (a.z + b.z) / 2),
      new THREE.Vector3(b.x, .25, b.z),
    ]);
    const mat = material(new THREE.MeshBasicMaterial({ color: 0x285c83 }));
    platform.add(new THREE.Mesh(geometry(new THREE.TubeGeometry(curve, 30, .027, 5, false)), mat));
    const packets = Array.from({ length: 3 }, () => {
      const packet = new THREE.Mesh(sphere, neon);
      platform.add(packet);
      return packet;
    });
    return { from, to, curve, packets, mat };
  });

  const adversary = new THREE.Group();
  adversary.position.set(0, 3.6, -5.7);
  scene.add(adversary);
  const core = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(.55, 1)), orange);
  adversary.add(core);
  const shell = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(.85, 1)), material(new THREE.MeshBasicMaterial({ color: ORANGE, wireframe: true, transparent: true, opacity: .4 })));
  adversary.add(shell);
  const haloA = new THREE.Mesh(geometry(new THREE.TorusGeometry(1.1, .018, 8, 80)), orange);
  haloA.rotation.x = .9;
  adversary.add(haloA);
  const haloB = new THREE.Mesh(geometry(new THREE.TorusGeometry(1.3, .012, 8, 80)), violet);
  haloB.rotation.y = 1.1;
  adversary.add(haloB);

  let beam: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial> | null = null;
  let beamCurve: THREE.QuadraticBezierCurve3 | null = null;
  const bolts = Array.from({ length: 5 }, () => {
    const packet = new THREE.Mesh(sphere, orange);
    packet.scale.setScalar(1.4);
    scene.add(packet);
    return packet;
  });
  const waveMaterial = material(new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const wave = ring(scene, 1, .3, waveMaterial);
  let waveAge = 10;
  const sparksGeometry = geometry(new THREE.BufferGeometry());
  const sparkPositions = new Float32Array(80 * 3);
  sparksGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparksMaterial = material(new THREE.PointsMaterial({ color: CYAN, size: .1, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sparks = new THREE.Points(sparksGeometry, sparksMaterial);
  sparks.frustumCulled = false;
  scene.add(sparks);

  const dustPositions = new Float32Array(220 * 3);
  for (let i = 0; i < 220; i++) {
    dustPositions[i * 3] = Math.sin(i * 127.1) * 24;
    dustPositions[i * 3 + 1] = Math.cos(i * 43.7) * 7 + 6;
    dustPositions[i * 3 + 2] = Math.sin(i * 63.9) * 24;
  }
  const dustGeometry = geometry(new THREE.BufferGeometry());
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, material(new THREE.PointsMaterial({ color: 0x819fff, size: .035, transparent: true, opacity: .65, depthWrite: false })));
  scene.add(dust);

  let state = initial;
  let target = -1;
  let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let paused = false;
  let visible = true;
  let dirty = true;
  let disposed = false;
  let elapsed = 0;
  let lastTime = 0;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionChanged = () => { reducedMotion = motion.matches; controls.enableDamping = !reducedMotion; dirty = true; };
  motionChanged();
  motion.addEventListener("change", motionChanged);
  controls.addEventListener("change", () => { dirty = true; });

  function update(next: SceneState) {
    const hurt = next.harm > state.harm;
    if (next.cardsPlayed !== state.cardsPlayed || next.round !== state.round || next.countered !== state.countered) {
      waveAge = 0;
      const color = hurt ? ORANGE : next.countered ? 0xc1a2ff : next.shield > state.shield ? BLUE : next.harm < state.harm ? 0x9dff70 : CYAN;
      waveMaterial.color.setHex(color);
      sparksMaterial.color.setHex(color);
    }
    const nextTarget = next.threatTag && !next.countered ? TARGET[next.threatTag] : -1;
    if (nextTarget !== target) {
      if (beam) { scene.remove(beam); beam.geometry.dispose(); beam = null; }
      beamCurve = null;
      if (nextTarget >= 0) {
        const destination = SERVICES[nextTarget]!;
        beamCurve = new THREE.QuadraticBezierCurve3(adversary.position.clone(), new THREE.Vector3(destination.x / 2, 5.5, destination.z - 2), new THREE.Vector3(destination.x, destination.height + .5, destination.z));
        beam = new THREE.Mesh(new THREE.TubeGeometry(beamCurve, 40, .025, 6, false), orange);
        scene.add(beam);
      }
      target = nextTarget;
    }
    towers.forEach((tower, i) => {
      const color = i === target ? ORANGE : next.bleeds > 0 && i === 3 ? 0xffc85c : next.stability / next.stabilityTarget > .5 ? CYAN : BLUE;
      tower.glow.color.setHex(color).multiplyScalar(1.8);
      tower.shield.visible = next.countered || (next.shield > 0 && i === (target < 0 ? 0 : target));
    });
    routes.forEach((route) => route.mat.color.setHex(route.from === target || route.to === target ? 0x953d31 : 0x285c83));
    core.material = next.countered ? neon : orange;
    threatLight.color.setHex(next.countered ? CYAN : ORANGE);
    state = next;
    dirty = true;
  }
  update(initial);

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const dpr = Math.min(window.devicePixelRatio, width < 700 ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.zoom = camera.aspect < 1.3 ? .78 : 1.1;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; dirty = true; });
  intersection.observe(host);
  resize();
  const lost = (event: Event) => { event.preventDefault(); renderer.setAnimationLoop(null); onLost(); };
  canvas.addEventListener("webglcontextlost", lost);

  renderer.setAnimationLoop((now: number) => {
    if (disposed || document.hidden || !visible || now - lastTime < 1000 / 30) return;
    const dt = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    const animate = !reducedMotion && !paused;
    if (!animate && !dirty) return;
    if (animate) {
      elapsed += dt;
      waveAge += dt;
      core.rotation.y = elapsed * .4;
      shell.rotation.y = -elapsed * .2;
      haloA.rotation.z = elapsed * .15;
      haloB.rotation.z = -elapsed * .22;
      dust.rotation.y = elapsed * .008;
      towers.forEach((tower, i) => {
        tower.marker.rotation.y = elapsed;
        tower.marker.position.y = SERVICES[i]!.height + .9 + Math.sin(elapsed * 1.5 + i) * .1;
      });
    }
    routes.forEach((route, i) => route.packets.forEach((packet, j) => packet.position.copy(route.curve.getPoint((elapsed * .22 + j / 3 + i * .13) % 1))));
    bolts.forEach((bolt, i) => {
      bolt.visible = beamCurve !== null;
      if (beamCurve) bolt.position.copy(beamCurve.getPoint((elapsed * .45 + i / 5) % 1));
    });
    const progress = Math.min(1, waveAge / 1.1);
    wave.scale.setScalar(.5 + progress * 11);
    waveMaterial.opacity = animate ? (1 - progress) * .65 : 0;
    sparksMaterial.opacity = animate ? 1 - progress : 0;
    if (progress < 1 && animate) {
      for (let i = 0; i < 80; i++) {
        const angle = i * 2.39996;
        const distance = progress * (3 + (i % 7));
        sparkPositions[i * 3] = Math.cos(angle) * distance;
        sparkPositions[i * 3 + 1] = .5 + Math.sin(progress * Math.PI) * (1 + i % 4);
        sparkPositions[i * 3 + 2] = Math.sin(angle) * distance;
      }
      sparksGeometry.attributes.position!.needsUpdate = true;
    }
    controls.update(dt);
    composer.render(dt);
    host.dataset.scene = "ready";
    dirty = false;
  });

  return {
    update,
    reset: () => { resetCamera(); dirty = true; },
    pause: (value: boolean) => { paused = value; dirty = true; },
    dispose: () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      intersection.disconnect();
      motion.removeEventListener("change", motionChanged);
      canvas.removeEventListener("webglcontextlost", lost);
      controls.dispose();
      if (beam) beam.geometry.dispose();
      geometries.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      textures.forEach((item) => item.dispose());
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      bloom.dispose();
      output.dispose();
      renderPass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
