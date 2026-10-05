// Hiệu ứng chiến đấu bằng Three.js: tia sáng, vòng xung kích, vệt chém, tia laser, thiên thạch,
// hào quang tụ lực, sóng đất, pháo hoa, pháo giấy. Mọi thứ đều dựng từ sprite/hình khối phát sáng (additive).
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const ADD = THREE.AdditiveBlending;

function canvasTexture(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Fx {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.items = [];

    // quầng sáng tròn mềm
    this.glowTex = canvasTexture((g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    });
    // ngôi sao 4 cánh dùng cho tia sáng lúc trúng đòn
    this.starTex = canvasTexture((g, s) => {
      g.translate(s / 2, s / 2);
      for (let i = 0; i < 4; i++) {
        g.save();
        g.rotate((i * Math.PI) / 2);
        const gr = g.createLinearGradient(0, 0, 0, -s / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(-s * 0.05, 0);
        g.lineTo(0, -s / 2);
        g.lineTo(s * 0.05, 0);
        g.closePath();
        g.fill();
        g.restore();
      }
      const core = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.18);
      core.addColorStop(0, 'rgba(255,255,255,1)');
      core.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = core;
      g.fillRect(-s / 2, -s / 2, s, s);
    });

    this.light = new THREE.PointLight(0xffffff, 0, 14, 2);
    this.lightLife = 0;
    this.lightMax = 1;
    this.lightPeak = 0;
    scene.add(this.light);
  }

  /* ---------- nền tảng ---------- */
  add(update, dispose) {
    this.items.push({ update, dispose });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.update(dt)) {
        it.dispose();
        this.items.splice(i, 1);
      }
    }
    if (this.lightLife > 0) {
      this.lightLife -= dt;
      this.light.intensity = this.lightPeak * Math.max(0, this.lightLife / this.lightMax);
    } else this.light.intensity = 0;
  }

  clear() {
    for (const it of this.items) it.dispose();
    this.items.length = 0;
    this.light.intensity = 0;
    this.lightLife = 0;
  }

  sprite(tex, color, size, pos, blending = ADD) {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending, toneMapped: false });
    const s = new THREE.Sprite(m);
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.scene.add(s);
    return s;
  }

  kill(obj) {
    this.scene.remove(obj);
    obj.material?.dispose();
    if (obj.isMesh) obj.geometry.dispose(); // sprite dùng chung geometry nên không giải phóng
  }

  flashLight(pos, color = 0xffffff, intensity = 80, life = 0.3) {
    this.light.position.copy(pos);
    this.light.color.set(color);
    this.lightPeak = intensity;
    this.lightMax = life;
    this.lightLife = life;
  }

  /* ---------- hiệu ứng đơn lẻ ---------- */
  /** Loé sáng tròn lớn dần rồi tắt. */
  flash(pos, color = 0xffffff, size = 3, life = 0.2) {
    const s = this.sprite(this.glowTex, color, size, pos);
    let t = 0;
    this.add(
      (dt) => {
        t += dt;
        const k = t / life;
        s.scale.setScalar(size * (0.5 + k));
        s.material.opacity = Math.max(0, 1 - k);
        return k >= 1;
      },
      () => this.kill(s),
    );
  }

  /** Ngôi sao 4 cánh xoay: dấu hiệu "trúng đòn". */
  star(pos, color = 0xffffff, size = 3.4, life = 0.4) {
    const s = this.sprite(this.starTex, color, size, pos);
    s.material.rotation = rnd(0, Math.PI);
    let t = 0;
    this.add(
      (dt) => {
        t += dt;
        const k = t / life;
        s.scale.setScalar(size * (0.35 + 0.9 * Math.sin(Math.min(k, 1) * Math.PI)));
        s.material.rotation += dt * 2.2;
        s.material.opacity = Math.max(0, 1 - k * k);
        return k >= 1;
      },
      () => this.kill(s),
    );
  }

  /** Tia lửa bắn ra theo mọi hướng, rơi dần xuống. */
  sparks(pos, { count = 24, color = 0xffffff, speed = 5, life = 0.7, grav = -9, size = 0.22, up = 0.3 } = {}) {
    const ps = [];
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.35, 1));
      v.y += up * speed;
      ps.push({ s: this.sprite(this.glowTex, color, size, pos), v, l: life * rnd(0.6, 1), dead: false });
    }
    let t = 0;
    this.add(
      (dt) => {
        t += dt;
        let alive = false;
        for (const p of ps) {
          if (p.dead) continue;
          const k = t / p.l;
          if (k >= 1) {
            this.kill(p.s);
            p.dead = true;
            continue;
          }
          alive = true;
          p.v.y += grav * dt;
          p.s.position.addScaledVector(p.v, dt);
          p.s.material.opacity = 1 - k;
          p.s.scale.setScalar(size * (1 - 0.6 * k));
        }
        return !alive;
      },
      () => ps.forEach((p) => !p.dead && this.kill(p.s)),
    );
  }

  /** Bụi bốc lên từ mặt đất. */
  dust(pos, { count = 10, size = 1.1, color = 0xf4efe6 } = {}) {
    const ps = [];
    for (let i = 0; i < count; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(0.8, 2.6);
      ps.push({
        s: this.sprite(this.glowTex, color, size * 0.4, pos, THREE.NormalBlending),
        v: new THREE.Vector3(Math.cos(a) * sp, rnd(0.3, 1.1), Math.sin(a) * sp * 0.6),
        l: rnd(0.5, 0.9),
        dead: false,
      });
    }
    let t = 0;
    this.add(
      (dt) => {
        t += dt;
        let alive = false;
        for (const p of ps) {
          if (p.dead) continue;
          const k = t / p.l;
          if (k >= 1) {
            this.kill(p.s);
            p.dead = true;
            continue;
          }
          alive = true;
          p.s.position.addScaledVector(p.v, dt);
          p.v.multiplyScalar(1 - dt * 2.2);
          p.s.material.opacity = 0.55 * (1 - k);
          p.s.scale.setScalar(size * (0.4 + 1.0 * k));
        }
        return !alive;
      },
      () => ps.forEach((p) => !p.dead && this.kill(p.s)),
    );
  }

  /** Vòng xung kích lan rộng. flat = nằm trên mặt đất, ngược lại luôn quay mặt về camera. */
  ring(pos, { color = 0xffffff, radius = 2.2, life = 0.5, flat = false, width = 0.14 } = {}) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(1 - width, 1, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    m.position.copy(pos);
    if (flat) m.rotation.x = -Math.PI / 2;
    this.scene.add(m);
    let t = 0;
    this.add(
      (dt) => {
        t += dt;
        const k = Math.min(t / life, 1);
        const e = 1 - Math.pow(1 - k, 3);
        m.scale.setScalar(0.2 + radius * e);
        m.material.opacity = 1 - k;
        if (!flat) m.quaternion.copy(this.camera.quaternion);
        return k >= 1;
      },
      () => this.kill(m),
    );
  }

  /** Vệt chém hình lưỡi liềm. */
  slash(pos, { color = 0xffffff, angle = rnd(-0.7, 0.7), size = 2.4, life = 0.28 } = {}) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.95, 40, 1, 0, Math.PI * 0.8),
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    m.position.copy(pos);
    this.scene.add(m);
    let t = 0;
    this.add(
      (dt) => {
        t += dt;
        const k = Math.min(t / life, 1);
        m.quaternion.copy(this.camera.quaternion);
        m.rotateZ(angle - 0.4 + k * 0.9);
        m.scale.setScalar(size * (0.65 + 0.5 * k));
        m.material.opacity = 1 - k * k;
        return k >= 1;
      },
      () => this.kill(m),
    );
  }

  /** Tia năng lượng thẳng từ điểm này tới điểm kia. */
  beam(from, to, { color = 0xff5d73, life = 0.32, width = 0.55 } = {}) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const mk = (c, op) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      m.position.copy(mid);
      m.quaternion.copy(q);
      this.scene.add(m);
      return m;
    };
    const outer = mk(color, 0.65);
    const inner = mk(0xffffff, 0.95);
    this.flash(from, color, 2.4, life);
    let t = 0;
    this.add(
      (dt) => {
        t += dt;
        const k = Math.min(t / life, 1);
        const w = width * (1 - k * 0.85) * (1 + 0.18 * Math.sin(t * 70));
        outer.scale.set(w, len, w);
        inner.scale.set(w * 0.38, len, w * 0.38);
        outer.material.opacity = 0.65 * (1 - k * k);
        inner.material.opacity = 0.95 * (1 - k * k);
        return k >= 1;
      },
      () => {
        this.kill(outer);
        this.kill(inner);
      },
    );
  }

  /** Vệt sáng mờ dần phía sau vật thể bay. */
  puff(pos, color, size, life = 0.3) {
    const s = this.sprite(this.glowTex, color, size, pos);
    let t = 0;
    this.add(
      (dt) => {
        t += dt;
        const k = t / life;
        s.scale.setScalar(size * (1 - 0.7 * k));
        s.material.opacity = 0.8 * (1 - k);
        return k >= 1;
      },
      () => this.kill(s),
    );
  }

  /** Quả cầu năng lượng bay từ from tới to. Trả về Promise khi tới nơi. */
  projectile(from, to, { color = 0xffd23f, dur = 0.34, arc = 0.6, size = 1.1 } = {}) {
    return new Promise((resolve) => {
      const core = this.sprite(this.glowTex, 0xffffff, size * 0.7, from);
      const halo = this.sprite(this.glowTex, color, size * 2, from);
      const pos = from.clone();
      let t = 0;
      let trail = 0;
      this.add(
        (dt) => {
          t += dt;
          trail += dt;
          const k = Math.min(t / dur, 1);
          pos.lerpVectors(from, to, k);
          pos.y += Math.sin(Math.PI * k) * arc;
          core.position.copy(pos);
          halo.position.copy(pos);
          halo.scale.setScalar(size * 2 * (1 + 0.12 * Math.sin(t * 40)));
          while (trail > 0.018) {
            trail -= 0.018;
            this.puff(pos, color, size * 1.1, 0.3);
          }
          if (k < 1) return false;
          resolve();
          return true;
        },
        () => {
          this.kill(core);
          this.kill(halo);
        },
      );
    });
  }

  /** Thiên thạch rơi từ trời xuống mục tiêu, có vòng cảnh báo trên mặt đất. Resolve lúc va chạm. */
  meteor(target, { color = 0xff7a3d, warn = 0.35, fall = 0.42, height = 9 } = {}) {
    return new Promise((resolve) => {
      const ground = new THREE.Vector3(target.x, 0.05, target.z);
      const warnRing = new THREE.Mesh(
        new THREE.RingGeometry(0.82, 1, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      warnRing.rotation.x = -Math.PI / 2;
      warnRing.position.copy(ground);
      this.scene.add(warnRing);
      const start = new THREE.Vector3(target.x + 2.6, height, target.z - 1.4);
      const core = this.sprite(this.glowTex, 0xffffff, 1.3, start);
      const halo = this.sprite(this.glowTex, color, 3.6, start);
      core.visible = halo.visible = false;
      const pos = start.clone();
      let t = 0;
      let trail = 0;
      this.add(
        (dt) => {
          t += dt;
          if (t < warn) {
            const k = t / warn;
            warnRing.scale.setScalar(2.4 - 1.2 * k);
            warnRing.material.opacity = 0.35 + 0.65 * k;
            return false;
          }
          core.visible = halo.visible = true;
          trail += dt;
          const k = Math.min((t - warn) / fall, 1);
          pos.lerpVectors(start, target, k * k);
          core.position.copy(pos);
          halo.position.copy(pos);
          while (trail > 0.012) {
            trail -= 0.012;
            this.puff(pos, color, 2.2, 0.35);
          }
          if (k < 1) return false;
          resolve();
          return true;
        },
        () => {
          this.kill(warnRing);
          this.kill(core);
          this.kill(halo);
        },
      );
    });
  }

  /** Hào quang tụ lực quanh một đấu sĩ trong dur giây (cột sáng + hạt xoáy lên). Trả về Promise. */
  aura(fighter, { color = 0xffd23f, dur = 0.8 } = {}) {
    return new Promise((resolve) => {
      const base = new THREE.Vector3();
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.15, 7, 28, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      this.scene.add(pillar);
      const glow = this.sprite(this.glowTex, color, 4, base);
      const ps = [];
      let t = 0;
      let spawn = 0;
      this.ring(fighter.root.position.clone().setY(0.05), { color, radius: 2.4, life: dur, flat: true });
      this.add(
        (dt) => {
          t += dt;
          const k = Math.min(t / dur, 1);
          fighter.holder.getWorldPosition(base);
          pillar.position.set(base.x, 3.5, base.z);
          pillar.material.opacity = 0.5 * Math.sin(k * Math.PI);
          pillar.scale.set(1 + 0.12 * Math.sin(t * 30), 1, 1 + 0.12 * Math.sin(t * 30));
          glow.position.set(base.x, base.y + fighter.height * 0.5, base.z);
          glow.scale.setScalar(3 + 2.2 * k);
          glow.material.opacity = 0.35 + 0.5 * k;
          spawn += dt;
          while (spawn > 0.011 && k < 1) {
            spawn -= 0.011;
            const a = rnd(0, Math.PI * 2);
            const r = rnd(1.0, 1.6);
            ps.push({ s: this.sprite(this.glowTex, 0xffffff, rnd(0.14, 0.3), new THREE.Vector3(base.x + Math.cos(a) * r, 0.1, base.z + Math.sin(a) * r)), a, r, y: 0.1, l: 0, life: rnd(0.35, 0.6), sp: rnd(3, 6) });
          }
          for (let i = ps.length - 1; i >= 0; i--) {
            const p = ps[i];
            p.l += dt;
            const pk = p.l / p.life;
            if (pk >= 1) {
              this.kill(p.s);
              ps.splice(i, 1);
              continue;
            }
            p.a += dt * 7;
            p.r *= 1 - dt * 1.4;
            p.y += p.sp * dt;
            p.s.position.set(base.x + Math.cos(p.a) * p.r, p.y, base.z + Math.sin(p.a) * p.r);
            p.s.material.opacity = 1 - pk;
          }
          if (k < 1) return false;
          resolve();
          return true;
        },
        () => {
          this.kill(pillar);
          this.kill(glow);
          ps.forEach((p) => this.kill(p.s));
        },
      );
    });
  }

  /** Sóng đất lan từ x này tới x kia: cả dải vòng nứt + bụi. Trả về Promise khi sóng tới nơi. */
  groundWave(fromX, toX, { color = 0xffb347, dur = 0.42 } = {}) {
    return new Promise((resolve) => {
      let t = 0;
      let next = 0;
      this.add(
        (dt) => {
          t += dt;
          const k = Math.min(t / dur, 1);
          while (next <= k) {
            const x = fromX + (toX - fromX) * next;
            this.ring(new THREE.Vector3(x, 0.05, 0), { color, radius: 1.3, life: 0.38, flat: true, width: 0.3 });
            if (Math.random() < 0.7) this.dust(new THREE.Vector3(x, 0.15, 0), { count: 3, size: 0.9 });
            next += 0.1;
          }
          if (k < 1) return false;
          resolve();
          return true;
        },
        () => {},
      );
    });
  }

  /** Pháo hoa nổ trên trời. */
  firework(pos, color) {
    this.flash(pos, color, 5, 0.35);
    this.ring(pos, { color, radius: 3.2, life: 0.8 });
    this.sparks(pos, { count: 70, color, speed: 6.5, life: 1.3, grav: -3.2, size: 0.34, up: 0 });
    this.sparks(pos, { count: 20, color: 0xffffff, speed: 4, life: 1.0, grav: -3.2, size: 0.2, up: 0 });
  }

  /** Mưa pháo giấy nhiều màu. */
  confetti() {
    const colors = [0xff5d73, 0xffd23f, 0x4fd18b, 0x4da3ff, 0xb05cff, 0xff9f43];
    const geo = new THREE.BoxGeometry(1, 0.6, 0.08);
    const ps = [];
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, side: THREE.DoubleSide }));
      m.position.set(rnd(-7, 7), rnd(6, 10), rnd(-3, 3));
      m.scale.setScalar(rnd(0.14, 0.26));
      this.scene.add(m);
      ps.push({ m, v: new THREE.Vector3(rnd(-0.8, 0.8), rnd(-3.5, -1.5), rnd(-0.5, 0.5)), s: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), dead: false });
    }
    let t = 0;
    const life = 4;
    this.add(
      (dt) => {
        t += dt;
        const k = t / life;
        for (const p of ps) {
          if (p.dead) continue;
          if (k >= 1) {
            this.scene.remove(p.m);
            p.m.material.dispose();
            p.dead = true;
            continue;
          }
          p.v.y -= 0.6 * dt;
          p.m.position.addScaledVector(p.v, dt);
          p.m.rotation.x += p.s.x * dt;
          p.m.rotation.y += p.s.y * dt;
          p.m.material.opacity = Math.min(1, (1 - k) * 2.5);
        }
        return k >= 1;
      },
      () => {
        ps.forEach((p) => {
          if (!p.dead) {
            this.scene.remove(p.m);
            p.m.material.dispose();
          }
        });
        geo.dispose();
      },
    );
  }
}
