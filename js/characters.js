// Nhân vật đấu sĩ. Có hai loại cùng một giao diện (play / update / muzzle / chest):
//  - PuppetFighter: nhân vật dựng bằng code (bot, và nhân vật tạm của người chơi)
//  - GLBFighter: nhân vật nạp từ file GLB (có skeleton + animation sẵn)
// Tên animation chuẩn của game: idle, attack, hit, win, lose.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};
const easeOut = (k) => 1 - Math.pow(1 - k, 3);

/* ------------------------------------------------------------------ */
/*  Lớp nền                                                            */
/* ------------------------------------------------------------------ */
export class Fighter {
  /** dir = +1: nhìn về phía +x (người chơi, bên trái); -1: nhìn về phía -x (bot, bên phải) */
  constructor(dir) {
    this.dir = dir;
    this.root = new THREE.Group(); // đặt vị trí trong đấu trường
    this.holder = new THREE.Group(); // nhận các độ lệch: lao tới, bật lùi, nhảy
    this.root.add(this.holder);
    this.homeX = 0;
    this.anim = 'idle';
    this.t = 0;
    this.flashAmt = 0;
    this.height = 2.5;
    this.projColor = 0xffd23f;
    this.releaseDelay = 0.4; // giây từ lúc bắt đầu đòn đánh tới lúc tung chiêu / tung đấm trúng
    this.melee = false; // true: lao tới đấm tận nơi thay vì tung chiêu từ xa
    this.slide = 0; // độ lệch x do cảnh điều khiển (lao tới / lùi về)
    this.turn = 0; // góc xoay quanh trục y (quay lưng khi chạy về)
    this.knock = 1; // hệ số bật lùi khi trúng đòn
    this._mats = null;
  }

  setHome(x) {
    this.homeX = x;
    this.root.position.x = x;
  }

  /** Điểm tung chiêu (thế giới) */
  muzzle(out) {
    return this.holder.getWorldPosition(out).add(new THREE.Vector3(this.dir * 0.9, this.height * 0.62, 0));
  }

  /** Điểm trúng đòn ở ngực (thế giới) */
  chest(out) {
    return this.holder.getWorldPosition(out).add(new THREE.Vector3(0, this.height * 0.55, 0));
  }

  play(name) {
    this.anim = name;
    this.t = 0;
    if (name === 'hit') this.flashAmt = 1;
    this.onPlay(name);
  }

  // các lớp con ghi đè
  onPlay() {}
  poseUpdate() {}
  oneShotDuration(name) {
    return name === 'attack' ? 0.8 : name === 'hit' ? 0.6 : 0;
  }
  hasClip() {
    return true;
  }

  update(dt) {
    this.t += dt;
    const dur = this.oneShotDuration(this.anim);
    if (dur && this.t >= dur) {
      this.anim = 'idle';
      this.t = 0;
      this.onPlay('idle');
    }
    const k = dur ? Math.min(this.t / dur, 1) : 0;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    let rz = 0;
    if (this.anim === 'attack') {
      if (!this.melee) ox = this.dir * Math.sin(Math.PI * k) * 0.9;
    } else if (this.anim === 'hit') {
      ox = -this.dir * Math.sin(Math.PI * k) * 0.55 * this.knock;
      oz = Math.sin(this.t * 70) * 0.05 * (1 - k);
    } else if (this.anim === 'win' && !this.hasClip('win')) {
      oy = Math.abs(Math.sin(this.t * 5)) * 0.6;
    } else if (this.anim === 'lose' && !this.hasClip('lose')) {
      rz = this.dir * Math.min(this.t * 2, 1) * 0.35;
    }
    this.holder.position.set(ox + this.slide, oy, oz);
    this.holder.rotation.set(0, this.turn, rz);

    this.flashAmt = Math.max(0, this.flashAmt - dt * 3);
    this.applyFlash();
    this.poseUpdate(dt);
  }

  applyFlash() {
    if (!this._mats) {
      this._mats = [];
      this.root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.emissive && !m.userData.noFlash && !this._mats.includes(m)) {
            m.userData.e0 = m.emissive.clone();
            this._mats.push(m);
          }
        }
      });
    }
    const f = this.flashAmt;
    for (const m of this._mats) {
      const e = m.userData.e0;
      m.emissive.setRGB(e.r + f * 0.9, e.g + f * 0.12, e.b + f * 0.12);
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Nhân vật dựng bằng code                                            */
/* ------------------------------------------------------------------ */
export class PuppetFighter extends Fighter {
  constructor(dir, parts, { color = 0xffd23f, height = 2.5 } = {}) {
    super(dir);
    this.parts = parts;
    this.projColor = color;
    this.height = height;
    this.isPlaceholder = true;
    this.clock = Math.random() * 10;
    const model = new THREE.Group();
    model.rotation.y = dir < 0 ? Math.PI : 0;
    model.add(parts.rig);
    this.holder.add(model);
  }

  poseUpdate(dt) {
    const { rig, head, armL, armR, legL, legR } = this.parts;
    this.clock += dt;
    const T = this.clock;
    const t = this.t;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    rig.scale.set(1, 1, 1);
    for (const p of [head, armL, armR, legL, legR]) p.rotation.set(0, 0, 0);

    // Trong hệ toạ độ của nhân vật: +x là phía trước; xoay quanh z dương = vung tay ra trước.
    switch (this.anim) {
      case 'attack': {
        const k = t / 0.8;
        let arm;
        let lean;
        if (k < 0.4) {
          const e = easeOut(k / 0.4);
          arm = -1.4 * e;
          lean = 0.2 * e;
        } else if (k < 0.6) {
          const e = (k - 0.4) / 0.2;
          arm = -1.4 + 3.4 * e;
          lean = 0.2 - 0.5 * e;
        } else {
          const e = (k - 0.6) / 0.4;
          arm = 2 * (1 - e);
          lean = -0.3 * (1 - e);
        }
        armR.rotation.z = arm;
        armL.rotation.z = -arm * 0.3;
        rig.rotation.z = lean;
        break;
      }
      case 'hit': {
        const s = Math.sin(Math.PI * Math.min(t / 0.6, 1));
        rig.rotation.z = 0.5 * s;
        head.rotation.z = 0.3 * s;
        armL.rotation.z = armR.rotation.z = 1.2 * s;
        break;
      }
      case 'win': {
        rig.position.y = Math.abs(Math.sin(t * 6)) * 0.55;
        armL.rotation.z = 2.9 + Math.sin(t * 12) * 0.2;
        armR.rotation.z = 2.9 - Math.sin(t * 12) * 0.2;
        head.rotation.z = Math.sin(t * 6) * 0.1;
        break;
      }
      case 'lose': {
        const e = Math.min(t * 1.5, 1);
        rig.rotation.z = 0.45 * e;
        rig.position.y = -0.1 * e;
        head.rotation.z = 0.5 * e;
        armL.rotation.z = armR.rotation.z = 0.1;
        break;
      }
      default: {
        const s = Math.sin(T * 2.4);
        rig.position.y = s * 0.035;
        rig.scale.y = 1 + s * 0.015;
        armR.rotation.z = 0.12 + Math.sin(T * 2.4 + 1) * 0.08;
        armL.rotation.z = 0.12 + Math.sin(T * 2.4 + 2) * 0.08;
        head.rotation.z = Math.sin(T * 1.6) * 0.04;
      }
    }
  }
}

/** Nhân vật tạm của người chơi: cậu bé chiến binh cầm gậy phép. */
export function buildHero() {
  const rig = new THREE.Group();
  const skin = std(0xffd7b5);
  const blue = std(0x3d7bff);
  const dark = std(0x23305e);
  const red = std(0xff4d5e);
  const hair = std(0x5a3418);
  const white = std(0xffffff, { roughness: 0.3 });
  const black = std(0x1a1a2e, { roughness: 0.2 });
  const gold = std(0xffd23f, { emissive: 0xffa000, emissiveIntensity: 0.9 });
  gold.userData.noFlash = true;
  const wood = std(0x8a5a2b);

  const mkLeg = (z) => {
    const p = new THREE.Group();
    p.position.set(0, 0.78, z);
    p.add(mesh(new THREE.CapsuleGeometry(0.15, 0.42, 6, 12), dark, 0, -0.36, 0));
    p.add(mesh(new THREE.BoxGeometry(0.4, 0.16, 0.3), red, 0.08, -0.7, 0));
    rig.add(p);
    return p;
  };
  const legL = mkLeg(-0.2);
  const legR = mkLeg(0.2);

  rig.add(mesh(new THREE.CapsuleGeometry(0.36, 0.36, 8, 16), blue, 0, 1.2, 0));
  rig.add(mesh(new THREE.BoxGeometry(0.08, 0.95, 0.7), red, -0.4, 1.2, 0)); // áo choàng
  const emblem = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 20), gold, 0.36, 1.28, 0);
  emblem.rotation.z = Math.PI / 2;
  rig.add(emblem);

  const mkArm = (z, holdStaff) => {
    const p = new THREE.Group();
    p.position.set(0, 1.5, z);
    p.add(mesh(new THREE.CapsuleGeometry(0.1, 0.36, 6, 12), blue, 0, -0.28, 0));
    p.add(mesh(new THREE.SphereGeometry(0.12, 16, 12), skin, 0, -0.55, 0));
    if (holdStaff) {
      p.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 10), wood, 0.1, -0.2, 0));
      p.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), gold, 0.1, 0.58, 0));
    }
    rig.add(p);
    return p;
  };
  const armL = mkArm(-0.5, false);
  const armR = mkArm(0.5, true);

  const head = new THREE.Group();
  head.position.set(0, 2.15, 0);
  rig.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.5, 32, 24), skin));
  head.add(mesh(new THREE.SphereGeometry(0.53, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, -0.05, 0.03, 0));
  head.add(mesh(new THREE.ConeGeometry(0.14, 0.3, 10), hair, 0, 0.58, 0));
  const band = mesh(new THREE.TorusGeometry(0.52, 0.045, 8, 32), red, 0, 0.16, 0);
  band.rotation.x = Math.PI / 2;
  head.add(band);
  for (const z of [-0.18, 0.18]) {
    head.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), black, 0.43, 0.04, z));
    head.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), white, 0.49, 0.08, z * 0.85));
    const cheek = mesh(new THREE.SphereGeometry(0.08, 10, 8), std(0xff9aa8), 0.42, -0.1, z * 1.65);
    cheek.scale.x = 0.4;
    head.add(cheek);
  }
  const smile = new THREE.Group();
  smile.position.set(0.49, -0.12, 0);
  smile.rotation.y = Math.PI / 2;
  const arc = mesh(new THREE.TorusGeometry(0.08, 0.016, 8, 16, Math.PI), black);
  arc.rotation.z = Math.PI;
  smile.add(arc);
  head.add(smile);

  return { rig, head, armL, armR, legL, legR };
}

/** Bot: quái vật tròn có sừng, đổi màu theo độ khó. */
export function buildBot(color) {
  const rig = new THREE.Group();
  const c = new THREE.Color(color);
  const body = std(color, { roughness: 0.35 });
  const belly = std(c.clone().offsetHSL(0, 0, 0.2), { roughness: 0.5 });
  const white = std(0xffffff, { roughness: 0.25 });
  const black = std(0x1a1730, { roughness: 0.2 });
  const horn = std(0xfff1c9);

  const b = mesh(new THREE.SphereGeometry(0.95, 32, 24), body, 0, 1.0, 0);
  b.scale.set(1, 1.02, 1.05);
  rig.add(b);
  const be = mesh(new THREE.SphereGeometry(0.62, 24, 16), belly, 0.5, 0.78, 0);
  be.scale.set(0.7, 1, 0.9);
  rig.add(be);

  const head = new THREE.Group();
  head.position.set(0, 1.0, 0);
  rig.add(head);
  for (const z of [-0.32, 0.32]) {
    head.add(mesh(new THREE.SphereGeometry(0.24, 20, 16), white, 0.74, 0.32, z));
    head.add(mesh(new THREE.SphereGeometry(0.12, 14, 10), black, 0.93, 0.32, z * 0.9));
    const brow = mesh(new THREE.BoxGeometry(0.06, 0.07, 0.3), black, 0.84, 0.62, z);
    brow.rotation.x = z > 0 ? -0.5 : 0.5; // lông mày chau lại
    head.add(brow);
    const h = mesh(new THREE.ConeGeometry(0.16, 0.5, 12), horn, 0, 0.98, z * 1.25);
    h.rotation.x = z > 0 ? 0.35 : -0.35;
    head.add(h);
  }
  head.add(mesh(new THREE.BoxGeometry(0.05, 0.1, 0.5), black, 0.92, -0.22, 0));
  for (const z of [-0.12, 0.12]) head.add(mesh(new THREE.BoxGeometry(0.06, 0.09, 0.1), white, 0.93, -0.16, z));

  const mkArm = (z) => {
    const p = new THREE.Group();
    p.position.set(0, 1.0, z);
    const arm = mesh(new THREE.CapsuleGeometry(0.13, 0.3, 6, 12), body, 0, -0.25, 0);
    p.add(arm);
    rig.add(p);
    return p;
  };
  const armL = mkArm(-0.92);
  const armR = mkArm(0.92);

  const mkLeg = (z) => {
    const p = new THREE.Group();
    p.position.set(0, 0.3, z);
    const foot = mesh(new THREE.SphereGeometry(0.28, 14, 10), belly, 0.08, -0.14, 0);
    foot.scale.set(1.3, 0.6, 1);
    p.add(foot);
    rig.add(p);
    return p;
  };
  const legL = mkLeg(-0.4);
  const legR = mkLeg(0.4);

  return { rig, head, armL, armR, legL, legR };
}


/* ------------------------------------------------------------------ */
/*  Nhân vật từ file GLB                                               */
/* ------------------------------------------------------------------ */
// Cách gán clip trong GLB → animation của game (khớp theo tên, không phân biệt hoa thường).
//  speed: tốc độ phát; impact: giây (trong clip gốc) tại đó đòn đánh chạm đối thủ;
//  loop: lặp lại thay vì phát một lần; stripRoot: bỏ chuyển động tịnh tiến của xương hông (chạy tại chỗ).
const CLIP_RULES = {
  idle: { match: /idle/i, loop: true },
  run: { match: /^run/i, loop: true, speed: 1.6, stripRoot: true },
  attack: { match: /box|punch|attack|strike|kick/i, speed: 1.7, impact: 0.68 },
  hit: { match: /hit_to_head|hit|hurt|damage/i, speed: 1.5 },
  win: { match: /win|victory|triumph/i },
  win2: { match: /dance|cheer|celebrat/i, loop: true },
  lose: { match: /die|death|defeat|lose|fall/i, speed: 1.15 },
};

function stripRootMotion(clip) {
  for (const t of clip.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    const v = t.values;
    for (let i = 0; i < v.length; i += 3) {
      v[i] = v[0];
      v[i + 2] = v[2];
    }
  }
}

export class GLBFighter extends Fighter {
  constructor(gltf, { height = 2.5, rotY = 0 } = {}) {
    super(1);
    this.height = height;
    this.isPlaceholder = false;
    this.melee = true;
    this.projColor = 0xffc83d;

    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    // GLB thường nhìn về +z; xoay để nhìn về +x (phía đối thủ), rồi chỉnh thêm bằng rotY.
    const wrap = new THREE.Group();
    wrap.add(model);
    wrap.rotation.y = Math.PI / 2 + rotY;
    this.holder.add(wrap);

    // Co giãn về chiều cao chuẩn, đặt chân chạm đất, căn giữa theo x/z.
    wrap.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(wrap);
    const size = box.getSize(new THREE.Vector3());
    wrap.scale.setScalar(height / (size.y || 1));
    wrap.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(wrap);
    const center = box.getCenter(new THREE.Vector3());
    wrap.position.set(-center.x, -box.min.y, -center.z);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    this.cfg = {};
    this.current = null;
    this.mapClips(gltf.animations);
    const atk = this.cfg.attack;
    this.releaseDelay = atk ? (atk.impact ?? 0.4 * this.actions.attack.getClip().duration) / (atk.speed || 1) : 0.4;
    this.melee = !!this.actions.attack;
    this.play('idle');
  }

  mapClips(clips) {
    const free = [...clips];
    for (const [name, rule] of Object.entries(CLIP_RULES)) {
      const i = free.findIndex((c) => rule.match.test(c.name));
      if (i < 0) continue;
      const [clip] = free.splice(i, 1);
      if (rule.stripRoot) stripRootMotion(clip);
      const act = this.mixer.clipAction(clip);
      act.timeScale = rule.speed || 1;
      this.actions[name] = act;
      this.cfg[name] = rule;
    }
    if (!this.actions.idle && clips[0]) this.actions.idle = this.mixer.clipAction(clips[0]);
    console.info(
      '[GLB] Clip trong file:',
      clips.map((c) => c.name),
      '→ đã gán:',
      Object.fromEntries(Object.entries(this.actions).map(([k, a]) => [k, a.getClip().name])),
    );
  }

  hasClip(name) {
    return !!this.actions[name];
  }

  oneShotDuration(name) {
    const a = this.actions[name];
    if (name === 'attack' || name === 'hit') return a ? a.getClip().duration / a.timeScale : super.oneShotDuration(name);
    return 0;
  }

  onPlay(name) {
    let key = name;
    if (name === 'win' && this.actions.win2 && (!this.actions.win || Math.random() < 0.5)) key = 'win2';
    const act = this.actions[key];
    if (!act) return; // không có clip: giữ clip hiện tại, game vẫn có chuyển động giả lập
    const loop = this.cfg[key]?.loop;
    act.reset();
    act.timeScale = this.cfg[key]?.speed || 1;
    if (loop) {
      act.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
    }
    act.enabled = true;
    act.fadeIn(0.12).play();
    if (this.current && this.current !== act) this.current.fadeOut(0.12);
    this.current = act;
  }

  poseUpdate(dt) {
    this.mixer.update(dt);
  }
}
