// Đấu trường 3D: bầu trời, nền đấu, trang trí, ánh sáng, camera và điều phối các đòn đánh.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PuppetFighter, GLBFighter, buildHero, buildBot } from './characters.js';
import { LEVELS } from './battle.js';
import { Fx } from './fx.js';
import { sfx } from './audio.js';

const THEMES = {
  animals: { top: 0x3f9bff, bottom: 0xd6f7d2, ground: 0x6fcf6a, accent: 0xffd23f },
  food: { top: 0xff7f50, bottom: 0xffe7b8, ground: 0xf2b45a, accent: 0xff5d73 },
  school: { top: 0x5566ff, bottom: 0xc7dcff, ground: 0x7fa8ee, accent: 0xffd24d },
  family: { top: 0xff6fae, bottom: 0xffe3f0, ground: 0xf59ac0, accent: 0xfff09a },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export class ArenaScene {
  constructor(container, floaters) {
    this.floaters = floaters;
    this.time = 0;
    this.mode = 'menu';
    this.shake = 0;
    this.fovKick = 0;
    this.timeScale = 1; // < 1 khi hit-stop / quay chậm
    this.camFx = { x: 0, zoom: 0 }; // dịch tâm nhìn / zoom khi ra chiêu mạnh
    this.viewShift = 0;
    this.camDist = 9;
    this.tasks = [];
    this.celebrating = false;
    this.f = { hero: null, bot: null };
    this.flashEl = document.querySelector('#fxflash');
    this.linesEl = document.querySelector('#speedlines');

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    this.clock = new THREE.Clock();
    this.fx = new Fx(this.scene, this.camera);

    this.buildSky();
    this.buildLights();
    this.buildArena();
    this.buildDecor();
    this.buildSparkles();

    this.setTheme('animals');
    this.setHero(new PuppetFighter(1, buildHero()));
    this.setBotLevel('easy');
    this.layout();
    window.addEventListener('resize', () => this.layout());
    r.setAnimationLoop(() => this.tick());
  }

  /* ---------------- dựng cảnh ---------------- */
  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: `varying float vH; void main(){ vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // #include phải nằm trên dòng riêng
      fragmentShader: `uniform vec3 top;
uniform vec3 bottom;
varying float vH;
void main() {
  float t = smoothstep(-0.05, 0.65, vH);
  gl_FragColor = vec4(mix(bottom, top, t), 1.0);
  #include <colorspace_fragment>
}`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(120, 24, 16), this.skyMat));
    this.scene.fog = new THREE.Fog(0xffffff, 28, 90);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899bb, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    sun.position.set(5, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9db8ff, 1.2);
    rim.position.set(-6, 5, -7);
    this.scene.add(rim);
  }

  buildArena() {
    const g = new THREE.Group();
    this.scene.add(g);

    this.groundMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.3, 0.8, 64), this.groundMat);
    top.position.y = -0.4;
    top.receiveShadow = true;
    g.add(top);

    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(7.3, 6.5, 14),
      new THREE.MeshStandardMaterial({ color: 0x6b5b7a, roughness: 1, flatShading: true }),
    );
    rock.rotation.x = Math.PI;
    rock.position.y = -4.05;
    g.add(rock);

    this.ringMat = new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveIntensity: 0.55 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.05, 0.15, 12, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);

    this.inlayMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    for (const [a, b] of [[2.5, 2.65], [5.6, 5.72]]) {
      const inlay = new THREE.Mesh(new THREE.RingGeometry(a, b, 72), this.inlayMat);
      inlay.rotation.x = -Math.PI / 2;
      inlay.position.y = 0.012;
      g.add(inlay);
    }

    this.pads = [0, 1].map(() => {
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(1.5, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.02;
      g.add(pad);
      return pad;
    });
  }

  buildDecor() {
    this.orbMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 1.2, roughness: 0.3 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xe3e6f5, roughness: 0.7 });
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.1 + (0.8 * i) / 6);
      const x = Math.cos(a) * 8.6;
      const z = -Math.sin(a) * 8.6;
      const h = 2.2 + (i % 2) * 0.8;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, h, 10), stone);
      col.position.set(x, h / 2 - 0.2, z);
      col.castShadow = true;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), this.orbMat);
      orb.position.set(x, h + 0.2, z);
      this.scene.add(col, orb);
    }

    this.crystalMat = new THREE.MeshStandardMaterial({ roughness: 0.2, emissiveIntensity: 0.7, flatShading: true });
    this.crystals = [];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(rnd(0.3, 0.6)), this.crystalMat);
      // chỉ bay ở nửa sau đấu trường để không bao giờ che camera
      c.userData = { r: rnd(9.5, 14), a: Math.PI * (0.15 + 0.7 * (i / 8)), y: rnd(1.5, 6), sp: rnd(0.08, 0.2), ph: rnd(0, 6) };
      this.scene.add(c);
      this.crystals.push(c);
    }

    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.25 });
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.9, 1.6), 1), cloudMat);
        s.position.set(j * 1.3 - 2, rnd(-0.2, 0.4), rnd(-0.5, 0.5));
        s.scale.y = 0.65;
        c.add(s);
      }
      c.position.set(rnd(-40, 40), rnd(4, 12), -rnd(18, 32));
      c.userData.sp = rnd(0.25, 0.6);
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  buildSparkles() {
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([rnd(-10, 10), rnd(0, 8), rnd(-8, 6)], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkleMat = new THREE.PointsMaterial({ size: 0.11, transparent: true, opacity: 0.85, depthWrite: false });
    this.sparkles = new THREE.Points(geo, this.sparkleMat);
    this.scene.add(this.sparkles);
  }

  /* ---------------- chủ đề & nhân vật ---------------- */
  setTheme(id) {
    const t = THEMES[id] || THEMES.animals;
    this.skyMat.uniforms.top.value.set(t.top);
    this.skyMat.uniforms.bottom.value.set(t.bottom);
    this.scene.fog.color.set(t.bottom);
    this.groundMat.color.set(t.ground);
    for (const m of [this.ringMat, this.orbMat, this.crystalMat]) {
      m.color.set(t.accent);
      m.emissive.set(t.accent);
    }
    this.inlayMat.color.set(t.accent);
    this.sparkleMat.color.set(t.accent);
  }

  setFighter(key, fighter) {
    const old = this.f[key];
    if (old) {
      this.scene.remove(old.root);
      old.dispose();
    }
    this.f[key] = fighter;
    this.scene.add(fighter.root);
    fighter.play('idle');
    this.layout();
  }

  setHero(fighter) {
    this.setFighter('hero', fighter);
  }

  setBotLevel(level) {
    const color = LEVELS[level].color;
    this.setFighter('bot', new PuppetFighter(-1, buildBot(color), { color }));
  }

  /** Nạp nhân vật người chơi từ file GLB. rotDeg: xoay thêm quanh trục Y nếu model nhìn lệch hướng. */
  async loadHero(url, { rotDeg = 0, height = 2.85 } = {}) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const fighter = new GLBFighter(gltf, { height, rotY: THREE.MathUtils.degToRad(rotDeg) });
    this.setHero(fighter);
    return fighter;
  }

  setMode(mode) {
    this.mode = mode;
  }

  /* ---------------- bố cục & camera ---------------- */
  layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.renderer.setSize(w, h);
    this.camera.aspect = aspect;
    // Màn hình hẹp (điện thoại dọc): kéo hai đấu sĩ lại gần nhau và lùi camera ra
    const sep = THREE.MathUtils.clamp(aspect * 2.3, 1.9, 3.3);
    const tan = Math.tan(THREE.MathUtils.degToRad(40 / 2));
    this.camDist = Math.max(8.5, (sep + 1.5) / (tan * aspect));
    this.f.hero?.setHome(-sep);
    this.f.bot?.setHome(sep);
    this.pads[0].position.x = -sep;
    this.pads[1].position.x = sep;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(dt) {
    const cam = this.camera;
    const menu = this.mode === 'menu';
    const ang = menu ? Math.sin(this.time * 0.3) * 0.45 : Math.sin(this.time * 0.25) * 0.05;
    const D = this.camDist * (menu ? 1.08 : 1) * (1 - this.camFx.zoom);
    this.shake *= Math.pow(0.02, dt);
    this.fovKick *= Math.pow(0.003, dt);
    const s = this.shake;
    cam.position.set(Math.sin(ang) * D + this.camFx.x * 0.5 + (Math.random() - 0.5) * s, D * 0.27 + (Math.random() - 0.5) * s, Math.cos(ang) * D);
    cam.lookAt(this.camFx.x, 1.3, 0);
    const fov = 40 - this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    // Ở menu (màn rộng) đẩy cảnh sang phải để nhường chỗ cho bảng chọn bên trái
    const w = window.innerWidth;
    const h = window.innerHeight;
    const target = menu && w / h > 1.15 ? 0.17 : 0;
    this.viewShift += (target - this.viewShift) * Math.min(1, dt * 4);
    if (Math.abs(this.viewShift) > 0.0005) cam.setViewOffset(w, h, -w * this.viewShift, 0, w, h);
    else if (cam.view && cam.view.enabled) cam.clearViewOffset();
  }

  /* ---------------- vòng lặp ---------------- */
  tick() {
    const real = Math.min(this.clock.getDelta(), 0.05);
    this.time += real;
    const dt = real * this.timeScale;
    this.f.hero?.update(dt);
    this.f.bot?.update(dt);
    for (let i = this.tasks.length - 1; i >= 0; i--) if (this.tasks[i](dt)) this.tasks.splice(i, 1);
    this.fx.update(dt);
    this.updateDecor(real);
    this.updateCamera(real);
    this.renderer.render(this.scene, this.camera);
  }

  updateDecor(dt) {
    const t = this.time;
    for (const c of this.crystals) {
      const u = c.userData;
      const a = u.a + Math.sin(t * u.sp * 2 + u.ph) * 0.25;
      c.position.set(Math.cos(a) * u.r, u.y + Math.sin(t + u.ph) * 0.4, -Math.sin(a) * u.r - 1);
      c.rotation.y += dt;
      c.rotation.x += dt * 0.4;
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.sp * dt;
      if (c.position.x > 48) c.position.x = -48;
    }
    const p = this.sparkles.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.35;
      if (y > 8) y = 0;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }

  /* ---------------- tiện ích hiệu ứng ---------------- */
  tween(dur, fn) {
    return new Promise((resolve) => {
      let t = 0;
      this.tasks.push((dt) => {
        t += dt;
        const k = Math.min(t / dur, 1);
        fn(k);
        if (k < 1) return false;
        resolve();
        return true;
      });
    });
  }

  /** Dừng hình ngắn lúc trúng đòn để cú đánh có "lực". */
  hitStop(ms, scale = 0.06) {
    this.timeScale = scale;
    clearTimeout(this._stop);
    this._stop = setTimeout(() => (this.timeScale = 1), ms);
  }

  screenFlash(color = '#fff', ms = 180) {
    const el = this.flashEl;
    if (!el) return;
    el.style.background = color;
    el.style.setProperty('--ms', `${ms}ms`);
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  speedLines(ms = 700) {
    const el = this.linesEl;
    if (!el) return;
    el.style.setProperty('--ms', `${ms}ms`);
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  /** Chữ nổi (sát thương, combo...) tại một điểm trong không gian 3D. */
  floatText(pos, text, cls = '') {
    const v = pos.clone().project(this.camera);
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
    this.floaters.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  /** Chữ nổi phía trên đầu một đấu sĩ. */
  floatAbove(key, text, cls) {
    const p = this.f[key].chest(new THREE.Vector3());
    p.y += 1.4;
    this.floatText(p, text, cls);
  }

  /** Phản hồi nhẹ khi người chơi trả lời: đúng thì lấp lánh vàng, sai thì khói xám. */
  feedback(ok) {
    const p = this.f.hero.chest(new THREE.Vector3());
    if (ok) {
      this.fx.sparks(p, { count: 22, color: 0xffe066, speed: 3, life: 0.8, grav: 1.5, up: 1, size: 0.2 });
      this.fx.ring(p.clone().setY(0.05), { color: 0xffe066, radius: 1.8, life: 0.5, flat: true });
    } else {
      this.fx.dust(p, { count: 8, size: 0.9, color: 0x9aa0b8 });
      this.shake = Math.max(this.shake, 0.15);
    }
  }

  /* ---------------- đòn đánh ---------------- */
  /**
   * Một đòn đánh từ fromKey sang toKey.
   * opts: damage text, onImpact (chạy đúng lúc trúng), crit (trả lời cực nhanh), super (combo), ko (đòn kết liễu), kind (kiểu đòn của bot).
   */
  async attack(fromKey, toKey, opts = {}) {
    const a = this.f[fromKey];
    const d = this.f[toKey];
    if (a.melee) await this.meleeAttack(a, d, opts);
    else await this.rangedAttack(a, d, opts);
  }

  /** Nhân vật lao tới đấm: chạy lại gần → tung đòn → đối thủ bật lùi → chạy về chỗ cũ. */
  async meleeAttack(a, d, o) {
    const stopX = d.homeX - a.dir * 1.9;
    const travel = stopX - a.homeX;
    const color = o.super ? 0xff7a3d : a.projColor;

    if (o.super) {
      sfx.play('charge');
      this.speedLines(900);
      this.tween(0.9, (k) => (this.camFx.zoom = 0.16 * Math.sin(k * Math.PI * 0.5)));
      await this.fx.aura(a, { color: 0xffc83d, dur: 0.85 });
    }

    // lao tới
    a.play('run');
    sfx.play('dash');
    this.fx.dust(a.root.position.clone().setY(0.1), { count: 8 });
    await this.tween(o.super ? 0.38 : 0.46, (k) => {
      a.slide = travel * easeInOut(k);
      if (Math.random() < 0.35) this.fx.dust(new THREE.Vector3(a.homeX + a.slide - a.dir * 0.4, 0.1, 0), { count: 1, size: 0.7 });
    });
    a.slide = travel;

    // tung đòn
    a.play('attack');
    const until = a.releaseDelay;
    sfx.play('punch', { until });
    sfx.play(o.super ? 'boom' : 'heavyHit', { until });
    await wait(until * 1000);

    const hit = d.chest(new THREE.Vector3());
    hit.x -= a.dir * 0.55;
    this.impact(a, d, hit, o, { color, size: o.super ? 1.7 : 1 });
    this.fx.slash(hit, { color: 0xffffff, size: o.super ? 3.6 : 2.6 });
    if (o.super) this.fx.slash(hit, { color, size: 3, angle: rnd(0.9, 1.5) });

    // chạy về chỗ cũ trong lúc đối thủ còn đang trúng đòn
    wait(o.super ? 520 : 400).then(async () => {
      await this.tween(0.1, (k) => (a.turn = Math.PI * k));
      a.play('run');
      const from = a.slide;
      await this.tween(0.42, (k) => (a.slide = from * (1 - easeInOut(k))));
      a.slide = 0;
      await this.tween(0.1, (k) => (a.turn = Math.PI * (1 - k)));
      a.turn = 0;
      if (a.anim === 'run') a.play('idle');
    });
    await wait(o.ko ? 900 : 560);
  }

  /** Bot tung chiêu từ xa; mỗi lần chọn ngẫu nhiên một kiểu: cầu lửa, tia laser, thiên thạch, sóng đất. */
  async rangedAttack(a, d, o) {
    const kind = o.super ? 'meteor' : o.kind || pick(['fireball', 'beam', 'meteor', 'slam']);
    const color = a.projColor;
    a.play('attack');
    const until = a.releaseDelay;
    const target = d.chest(new THREE.Vector3());
    const muzzle = a.muzzle(new THREE.Vector3());
    let size = 1;

    if (kind === 'fireball') {
      sfx.play('magic', { until });
      sfx.play('smallHit', { until: until + 0.36 });
      await wait(until * 1000);
      await this.fx.projectile(muzzle, target, { color, dur: 0.36, size: 1.2 });
    } else if (kind === 'beam') {
      sfx.play('laser', { until });
      sfx.play('heavyHit', { until: until + 0.05 });
      await wait(until * 1000);
      this.fx.beam(muzzle, target, { color, life: 0.34, width: 0.6 });
      this.fx.sparks(muzzle, { count: 14, color, speed: 4 });
      await wait(60);
      size = 1.15;
    } else if (kind === 'meteor') {
      sfx.play('magic', { until });
      await wait(until * 1000);
      sfx.play('boom', { until: 0.35 + 0.42 });
      this.speedLines(500);
      await this.fx.meteor(target, { color: 0xff7a3d });
      size = 1.6;
    } else {
      // slam: dậm chân, sóng đất lan về phía đối thủ
      sfx.play('pop', { until });
      await wait(until * 1000);
      this.shake = Math.max(this.shake, 0.45);
      this.fx.dust(new THREE.Vector3(a.root.position.x, 0.1, 0), { count: 10, size: 1.3 });
      sfx.play('heavyHit', { until: 0.42 });
      await this.fx.groundWave(a.root.position.x + a.dir * 1.2, d.root.position.x, { color, dur: 0.42 });
      size = 1.25;
    }

    this.impact(a, d, target, o, { color: kind === 'meteor' ? 0xff7a3d : color, size: o.super ? size * 1.2 : size, ground: kind === 'meteor' || kind === 'slam' });
    await wait(o.ko ? 900 : 560);
  }

  /** Cảnh trúng đòn dùng chung: loé sáng, sao, vòng xung kích, tia lửa, bụi, rung màn hình, dừng hình. */
  impact(a, d, p, o, { color, size = 1, ground = false }) {
    const fx = this.fx;
    fx.flash(p, 0xffffff, 3.4 * size, 0.2);
    fx.star(p, color, 3.8 * size, 0.42);
    fx.ring(p, { color, radius: 2.4 * size, life: 0.5 });
    if (size > 1.3) fx.ring(p, { color: 0xffffff, radius: 3.6 * size, life: 0.7, width: 0.08 });
    fx.sparks(p, { count: Math.round(30 * size), color, speed: 6 * size });
    fx.sparks(p, { count: 10, color: 0xffffff, speed: 4, size: 0.14 });
    fx.flashLight(p, color, 70 * size, 0.28);
    const floor = new THREE.Vector3(p.x, 0.05, p.z);
    fx.ring(floor, { color, radius: 2.8 * size, life: 0.6, flat: true, width: 0.2 });
    fx.dust(floor, { count: ground ? 14 : 8, size: 1.2 });

    d.knock = o.super || o.ko ? 1.8 : size > 1.3 ? 1.4 : 1;
    d.play('hit');
    setTimeout(() => (d.knock = 1), 900);

    this.hitStop(o.ko ? 420 : o.super ? 170 : 85, o.ko ? 0.1 : 0.05);
    this.shake = Math.max(this.shake, o.super || o.ko ? 1.15 : 0.55 * size);
    this.fovKick = Math.max(this.fovKick, o.super ? 4 : 1.8);
    if (o.crit || o.super || o.ko) this.screenFlash(o.super || o.ko ? '#fff2cc' : '#ffffff', o.ko ? 320 : 200);
    if (o.ko) {
      fx.ring(p, { color: 0xffffff, radius: 6, life: 0.9, width: 0.05 });
      fx.sparks(p, { count: 80, color: 0xffd23f, speed: 9, life: 1.1 });
    }
    o.onImpact?.();
    if (o.text) this.floatText(p.clone().add(new THREE.Vector3(0, 0.9, 0)), o.text, o.super ? 'dmg big' : 'dmg');
    if (o.crit) this.floatText(p.clone().add(new THREE.Vector3(0, 1.7, 0)), 'CHÍ MẠNG!', 'crit');
    if (o.super) this.tween(0.5, (k) => (this.camFx.zoom = 0.16 * (1 - k)));
  }

  /** Hai bên đều trượt. */
  async miss(text) {
    if (text) this.floatText(new THREE.Vector3(0, 2.8, 0), text, 'miss');
    await wait(550);
  }

  /** Kết thúc trận: bên thắng ăn mừng, bên thua ngã xuống. */
  finish(winnerKey) {
    const loserKey = winnerKey === 'hero' ? 'bot' : 'hero';
    this.camFx.zoom = 0;
    if (winnerKey === 'draw') {
      this.resetPoses();
      return;
    }
    this.f[winnerKey].play('win');
    this.f[loserKey].play('lose');
    if (winnerKey === 'hero') {
      this.fx.confetti();
      this.celebrate();
    }
  }

  /** Bắn pháo hoa liên tục cho tới khi trận mới bắt đầu. */
  celebrate() {
    this.celebrating = true;
    const colors = [0xffd23f, 0xff5d73, 0x4fd18b, 0x4da3ff, 0xb05cff];
    const shot = (n) => {
      if (!this.celebrating || n <= 0) return;
      this.fx.firework(new THREE.Vector3(rnd(-6, 6), rnd(5, 9), rnd(-4, 0)), pick(colors));
      sfx.play('pop', { vol: 0.35, rate: rnd(0.9, 1.3) });
      setTimeout(() => shot(n - 1), rnd(350, 700));
    };
    shot(14);
  }

  resetPoses() {
    this.celebrating = false;
    this.tasks.length = 0;
    this.fx.clear();
    this.timeScale = 1;
    this.camFx.zoom = 0;
    for (const f of [this.f.hero, this.f.bot]) {
      if (!f) continue;
      f.slide = 0;
      f.turn = 0;
      f.knock = 1;
      f.play('idle');
    }
  }
}
