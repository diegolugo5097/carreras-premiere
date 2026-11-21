// Un vehículo en la carrera (humano o rival). Física propia sobre el perfil del suelo.

export const ESCALA = 1.15;
const SUELO_SPRITE = 227.5; // fila de contacto de las ruedas en la textura de 256
const VEL_MAX = 820;
const VEL_TURBO = 1150;
const ACEL = 640;
const FRENO = 1400;
const ARRASTRE = 0.12;
const G = 1750;
const G_PENDIENTE = 700;
const SALTO = 760;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpAng = (a, b, t) => a + (b - a) * t;

export class Corredor {
  constructor(carrera, vehiculo, anims, x0, humano = null) {
    this.carrera = carrera;
    this.vehiculo = vehiculo;
    this.anims = anims;
    this.humano = humano; // { numero, color, lector } o null si es rival
    this.x = x0;
    this.y = carrera.sueloY(x0);
    this.vx = 0;
    this.vy = 0;
    this.enSuelo = true;
    this.rot = Math.atan(carrera.pendiente(x0));
    this.factorVel = 1;

    this.item = -1;
    this._itemPendiente = -1;
    this.estado = "normal"; // normal | accion | reaccion
    this.accion = "";
    this.reaccion = -1;
    this.invulnerable = 0;
    this.turbo = 1;
    this.usandoTurbo = false;

    this.termino = false;
    this.tiempoFinal = 0;

    this.c = { acelerar: false, frenar: false, saltar: false, turbo: false };
    this._frenarAntes = false;

    this.iaBase = 0.86 + Math.random() * 0.09;
    this.iaTItem = 0;
    this.iaTTurbo = 0;
    this.iaVistas = new Map();

    this.anim = "marcha";
    this.frame = 0;
    this.vel = 0;
    this.animFin = false;
  }

  get esHumano() {
    return !!this.humano;
  }

  // ---------------------------------------------------------------- animación
  play(nombre, reiniciar = false) {
    if (this.anim !== nombre || reiniciar) {
      this.anim = nombre;
      this.frame = 0;
      this.animFin = false;
    }
  }

  _avanzarAnim(dt) {
    const a = this.anims[this.anim];
    if (!a) return;
    const n = a.frames.length;
    this.frame += dt * a.fps * this.vel;
    if (a.bucle) {
      this.frame %= n;
    } else if (this.frame >= n) {
      this.frame = n - 1;
      if (!this.animFin) {
        this.animFin = true;
        this._finAnimacion();
      }
    }
  }

  imagenActual() {
    const a = this.anims[this.anim];
    return a?.frames[Math.min(a.frames.length - 1, Math.floor(this.frame))];
  }

  // ---------------------------------------------------------------- física
  actualizar(dt, activa) {
    const car = this.carrera;
    // antes del "¡YA!" todos quietos en su puesto de salida (sin rodar por la pendiente)
    if (!activa) {
      this.vx = 0;
      this.vy = 0;
      this.enSuelo = true;
      this.y = car.sueloY(this.x);
      this.rot = Math.atan(car.pendiente(this.x));
      this.usandoTurbo = false;
      this.play("marcha");
      this.vel = 0;
      this.frame = 0;
      return;
    }
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const controla = activa && this.estado !== "reaccion" && !this.termino;
    const acel = this.c.acelerar && controla;
    const frenar = this.c.frenar && controla;

    this.usandoTurbo = controla && this.c.turbo && this.turbo > 0.01;
    if (this.usandoTurbo) this.turbo = Math.max(0, this.turbo - 0.38 * dt);
    else if (activa) this.turbo = Math.min(1, this.turbo + 0.065 * dt);

    const tope = (this.usandoTurbo ? VEL_TURBO : VEL_MAX) * this.factorVel;

    if (this.enSuelo) {
      const ang = Math.atan(car.pendiente(this.x));
      let a = 0;
      if (acel || this.usandoTurbo)
        a +=
          ACEL *
          (this.usandoTurbo ? 1.5 : 1) *
          clamp(1 - this.vx / tope, -0.6, 1);
      else if (this.vx > tope) a -= 300;
      if (frenar) a -= FRENO;
      a += G_PENDIENTE * Math.sin(ang);
      a -= ARRASTRE * this.vx;
      if (this.termino) a -= 900;
      if (this.estado === "reaccion") {
        if (this.reaccion === 0) a -= 700;
        else if (this.reaccion === 1) a -= this.vx > 60 ? 2600 : 0;
        else a -= 400;
      }
      this.vx = Math.max(0, this.vx + a * dt);
      this.x += this.vx * dt;
      const pend = car.pendiente(this.x);
      if (
        this.vx * this.vx * car.curvatura(this.x) > G * 1.1 &&
        this.vx > 350
      ) {
        this._despegar(this.vx * pend);
      } else {
        this.y = car.sueloY(this.x);
        this.vy = this.vx * pend;
      }
      if (controla && this.c.saltar && this.enSuelo) {
        this._despegar(-SALTO);
        car.evento("salto", this);
      }
    } else {
      if (acel || this.usandoTurbo)
        this.vx = Math.min(tope, this.vx + ACEL * 0.3 * dt);
      this.vy += G * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const h = car.sueloY(this.x);
      if (this.y >= h) {
        this.y = h;
        this.enSuelo = true;
        this.vy = this.vx * car.pendiente(this.x);
        this.vx *= 0.97;
      }
    }

    if (this.x > car.ancho - 60) {
      this.x = car.ancho - 60;
      this.vx = 0;
    }

    let objetivo = Math.atan(car.pendiente(this.x));
    if (!this.enSuelo)
      objetivo = clamp(
        Math.atan2(this.vy, Math.max(this.vx, 250)) * 0.3,
        -0.35,
        0.35,
      );
    this.rot = lerpAng(
      this.rot,
      objetivo,
      Math.min(1, dt * (this.enSuelo ? 12 : 4)),
    );

    this._animar(frenar);
    this._avanzarAnim(dt);
    this._frenarAntes = frenar;
  }

  _despegar(v) {
    this.enSuelo = false;
    this.vy = v;
    this.y += v * 0.016;
    if (this.estado === "normal") this.play("salto", true);
  }

  _animar(frenar) {
    if (this.estado !== "normal") {
      this.vel = 1;
      return;
    }
    let anim = "marcha";
    if (!this.enSuelo) anim = "salto";
    else if (this.usandoTurbo) anim = "caballito";
    else if (this.c.frenar && this.vx > 40 && !this.termino) anim = "frenada";
    else if (this.item >= 0) anim = "sostener_" + this.item;
    this.play(anim, anim === "frenada" && frenar && !this._frenarAntes);
    this.vel =
      anim === "marcha" || anim === "caballito"
        ? clamp(this.vx / 520, 0, 2)
        : 1;
  }

  // ---------------------------------------------------------------- ítems
  puedeRecoger() {
    return this.item < 0 && this.estado === "normal" && !this.termino;
  }

  recoger(nuevo) {
    this._itemPendiente = nuevo;
    this.estado = "accion";
    this.accion = "recoger";
    this.play("recoger", true);
    this.iaTItem = 0.8 + Math.random() * 2.2;
  }

  usarItem(adelante) {
    if (this.item < 0 || this.estado !== "normal") return;
    this.accion = adelante ? "lanzar" : "soltar";
    this.estado = "accion";
    this.play(`${this.accion}_${this.item}`, true);
  }

  recibirGolpe(tipo) {
    if (this.invulnerable > 0 || this.estado === "reaccion" || this.termino)
      return false;
    if (this.estado === "accion") {
      if (this.accion === "recoger") this.item = this._itemPendiente;
      else this.item = -1;
    }
    this.estado = "reaccion";
    this.accion = "";
    this.reaccion = tipo;
    this.play("reaccion_" + tipo, true);
    if (tipo === 0) this.vx *= 0.8;
    else if (tipo === 1) this.vx *= 0.6;
    else {
      this.vx *= 0.55;
      if (this.enSuelo) {
        this.enSuelo = false;
        this.vy = -420;
      }
    }
    this.carrera.evento("golpe", this);
    return true;
  }

  _finAnimacion() {
    if (this.estado === "accion") {
      const it = this.item;
      if (this.accion === "recoger") this.item = this._itemPendiente;
      else if (this.accion === "lanzar") {
        this.item = -1;
        this.carrera.lanzar(this, it);
      } else if (this.accion === "soltar") {
        this.item = -1;
        this.carrera.soltar(this, it);
      }
      this.estado = "normal";
      this.accion = "";
    } else if (this.estado === "reaccion") {
      this.estado = "normal";
      this.reaccion = -1;
      this.invulnerable = 1.2;
    }
  }

  // ---------------------------------------------------------------- IA
  pensarIA(dt, corredores, trampas, referenciaX) {
    this.c.acelerar = true;
    this.c.frenar = false;
    this.c.saltar = false;
    const d = referenciaX - this.x;
    this.factorVel = this.iaBase + clamp(d / 3000, -0.12, 0.08);

    if (this.iaTTurbo > 0) {
      this.iaTTurbo -= dt;
      this.c.turbo = true;
    } else {
      this.c.turbo = false;
      if (this.turbo > 0.7 && Math.random() < 0.18 * dt)
        this.iaTTurbo = 1 + Math.random() * 1.2;
    }

    if (this.enSuelo && this.estado === "normal") {
      for (const t of trampas) {
        const dist = t.x - this.x;
        if (dist > 130 && dist < 240) {
          if (!this.iaVistas.has(t.id))
            this.iaVistas.set(t.id, Math.random() < 0.55);
          if (this.iaVistas.get(t.id)) this.c.saltar = true;
          break;
        }
      }
    }

    if (this.item >= 0 && this.estado === "normal") {
      this.iaTItem -= dt;
      if (this.iaTItem <= 0) {
        let adelante = false;
        let atras = false;
        for (const o of corredores) {
          if (o === this) continue;
          const dd = o.x - this.x;
          if (dd > 180 && dd < 1200) adelante = true;
          else if (dd < -100 && dd > -700) atras = true;
        }
        if (adelante) this.usarItem(true);
        else if (atras || this.iaTItem < -5) this.usarItem(false);
      }
    }
  }

  // ---------------------------------------------------------------- dibujo
  dibujar(ctx) {
    const im = this.imagenActual();
    if (!im) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    if (this.invulnerable > 0 && Math.floor(this.invulnerable * 10) % 2 === 0)
      ctx.globalAlpha = 0.55;
    const s = 256 * ESCALA;
    ctx.drawImage(im, -128 * ESCALA, -SUELO_SPRITE * ESCALA, s, s);
    ctx.restore();
  }
}
