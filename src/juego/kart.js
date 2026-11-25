// Un kart en la carrera 3D (humano o rival): física sobre la vía, animación del sprite e IA.
import * as THREE from 'three'

const VEL_MAX = 24
const VEL_TURBO = 32
const ACEL = 13
const FRENO = 30
const G = 17
const SALTO = 5.6
const GIRO = 1.5 // rad/s de cambio de rumbo a buena velocidad
const TAM_SPRITE = 3.0

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const DUR_ACCION = { lanzar: 0.62, soltar: 0.62 }
const DUR_REACCION = [1.1, 1.1, 1.0] // costal, melao, guadua

let geoSombra = null
let matSombra = null

export class Kart {
  constructor(carrera, vehiculo, hojas, s0, d0, humano = null) {
    this.carrera = carrera
    this.pista = carrera.pista
    this.vehiculo = vehiculo
    this.humano = humano
    this.s = s0
    this.d = d0
    this.a = 0
    this.v = 0
    this.h = 0
    this.vh = 0
    this.giroSuave = 0
    this.factorVel = 1

    this.item = -1
    this.estado = 'normal' // normal | accion | reaccion
    this.accion = ''
    this.tEstado = 0
    this.reaccion = -1
    this.invulnerable = 0
    this.turbo = 1
    this.usandoTurbo = false
    this._lanzado = false

    this.termino = false
    this.tiempoFinal = 0
    this.mejorVuelta = 0

    this.c = { acelerar: false, frenar: false, giro: 0, saltar: false, turbo: false }

    this.iaBase = 0.86 + Math.random() * 0.09
    this.iaCarril = (Math.random() - 0.5) * 4
    this.iaTCarril = 2 + Math.random() * 3
    this.iaTItem = 0
    this.iaTTurbo = 0
    this.iaVistas = new Map()

    // sprite con una textura (hoja 4x4) por animación
    this.hojas = {}
    for (const [k, t] of Object.entries(hojas)) {
      const c = t.clone()
      c.repeat.set(0.25, 0.25)
      c.needsUpdate = true
      this.hojas[k] = c
    }
    this.mat = new THREE.SpriteMaterial({ map: this.hojas.marcha, transparent: true, alphaTest: 0.08, depthWrite: false })
    this.sprite = new THREE.Sprite(this.mat)
    this.sprite.center.set(0.5, 16 / 256)
    this.sprite.scale.set(TAM_SPRITE, TAM_SPRITE, 1)
    // si este kart queda pegado a la cámara de otro jugador, se vuelve semitransparente para no tapar
    this.sprite.onBeforeRender = (_r, _s, cam) => {
      const base = this._parpadeo ? 0.5 : 1
      if (cam.userData.kart && cam.userData.kart !== this) {
        const dist = cam.position.distanceTo(this.posMundo)
        this.mat.opacity = dist < 9 ? Math.min(base, 0.3 + (dist / 9) * 0.3) : base
      } else this.mat.opacity = base
    }
    this.anim = 'marcha'
    this.frameAnim = 0

    if (!geoSombra) {
      geoSombra = new THREE.CircleGeometry(1.15, 20)
      geoSombra.rotateX(-Math.PI / 2)
      matSombra = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
    }
    this.sombra = new THREE.Mesh(geoSombra, matSombra)
    this.sombra.scale.set(1, 1, 0.75)
    this.objeto = new THREE.Group()
    this.objeto.add(this.sprite)
    carrera.escena.add(this.objeto)
    carrera.escena.add(this.sombra)

    this._p = {}
    this.posMundo = new THREE.Vector3()
    this.rumbo = 0
    this.colocar()
  }

  get esHumano() {
    return !!this.humano
  }
  get vuelta() {
    return Math.floor(this.s / this.pista.largo) + 1
  }

  colocar() {
    const p = this.pista.punto(this.s, this.d, this._p)
    this.posMundo.set(p.x, p.y + this.h + 0.02, p.z)
    this.rumbo = p.fi + this.a
    this.objeto.position.copy(this.posMundo)
    this.sombra.position.set(p.x, p.y + 0.06, p.z)
    this.sombra.rotation.y = -this.rumbo
    const esc = 1 - Math.min(0.5, this.h * 0.15)
    this.sombra.scale.set(esc, 1, esc * 0.75)
  }

  // ---------------------------------------------------------------- física
  actualizar(dt, activa) {
    const pista = this.pista
    if (!activa) {
      this.v = 0
      this.giroSuave = 0
      this._animar(dt, false)
      this.colocar()
      return
    }
    this.invulnerable = Math.max(0, this.invulnerable - dt)
    this.tEstado += dt
    const controla = this.estado !== 'reaccion' && !this.termino
    const acel = this.c.acelerar && controla
    const frenar = this.c.frenar && controla

    this.usandoTurbo = controla && this.c.turbo && this.turbo > 0.01
    if (this.usandoTurbo) this.turbo = Math.max(0, this.turbo - 0.33 * dt)
    else this.turbo = Math.min(1, this.turbo + 0.06 * dt)

    const fuera = Math.abs(this.d) > pista.medio - 0.5
    let tope = (this.usandoTurbo ? VEL_TURBO : VEL_MAX) * this.factorVel
    if (fuera) tope *= 0.55

    let a = 0
    if (acel || this.usandoTurbo) a += ACEL * (this.usandoTurbo ? 1.6 : 1) * clamp(1 - this.v / tope, -0.8, 1)
    else a -= 2.5 + this.v * 0.05
    if (this.v > tope) a -= (this.v - tope) * 2.2
    if (frenar) a -= FRENO
    if (this.termino) a -= 9
    if (this.estado === 'reaccion') a -= this.reaccion === 1 ? 26 : 9
    this.v = Math.max(0, this.v + a * dt)

    // dirección
    const g = controla ? clamp(this.c.giro, -1, 1) : 0
    this.giroSuave += (g - this.giroSuave) * Math.min(1, dt * 9)
    const rata = GIRO * Math.min(1, this.v / 7) * (fuera ? 0.85 : 1)
    this.a += this.giroSuave * rata * dt
    if (Math.abs(g) < 0.05 && controla) this.a *= 1 - Math.min(1, dt * 0.9) // se endereza solo un poco
    if (this.estado === 'reaccion' && this.reaccion === 0) this.a += Math.sin(this.tEstado * 14) * dt * 1.5

    const ds = this.v * Math.cos(this.a) * dt
    this.a -= pista.curvatura(this.s) * ds
    this.a = clamp(this.a, -0.95, 0.95)
    this.s += ds
    this.d += this.v * Math.sin(this.a) * dt

    // bordes (andén / barandas)
    const muro = pista.medio + 3.2
    if (Math.abs(this.d) > muro) {
      this.d = Math.sign(this.d) * muro
      this.a *= -0.25
      this.v *= 0.92
    }

    // salto
    if (this.h > 0 || this.vh > 0) {
      this.vh -= G * dt
      this.h += this.vh * dt
      if (this.h <= 0) {
        this.h = 0
        this.vh = 0
      }
    } else if (controla && this.c.saltar) {
      this.vh = SALTO
      this.h = 0.01
      this._tSalto = 0
      this.carrera.evento('salto', this)
    }
    if (this.h > 0) this._tSalto = (this._tSalto || 0) + dt

    // acciones con tiempo
    if (this.estado === 'accion') {
      if (!this._lanzado && this.tEstado > DUR_ACCION[this.accion] * 0.5) {
        this._lanzado = true
        const it = this.item
        this.item = -1
        if (this.accion === 'lanzar') this.carrera.lanzar(this, it)
        else this.carrera.soltar(this, it)
      }
      if (this.tEstado >= DUR_ACCION[this.accion]) this._normal()
    } else if (this.estado === 'reaccion' && this.tEstado >= DUR_REACCION[this.reaccion]) {
      this._normal()
      this.invulnerable = 1.2
    }

    this._animar(dt, true)
    this.colocar()
  }

  _normal() {
    this.estado = 'normal'
    this.accion = ''
    this.reaccion = -1
    this.tEstado = 0
  }

  // ---------------------------------------------------------------- animación
  _animar(dt, activa) {
    let anim
    let f
    if (this.estado === 'reaccion') {
      anim = this.reaccion === 2 ? 'dano' : 'resbalon'
      f = (this.tEstado / DUR_REACCION[this.reaccion]) * 16
    } else if (this.estado === 'accion') {
      anim = this.accion === 'lanzar' ? 'lanzar_poder' : 'mirar_a_los_lados'
      f = (this.tEstado / DUR_ACCION[this.accion]) * 16
    } else if (this.h > 0) {
      anim = 'salto'
      f = Math.min(15, ((this._tSalto || 0) / ((2 * SALTO) / G)) * 16)
    } else if (!activa || (this.v < 0.3 && !this.c.acelerar)) {
      anim = 'mirar_a_los_lados'
      this.frameAnim += dt * 9
      f = this.frameAnim
    } else if (Math.abs(this.giroSuave) > 0.18) {
      anim = this.giroSuave < 0 ? 'giro_izquierdo' : 'giro_derecho'
      f = Math.round(Math.min(1, Math.abs(this.giroSuave)) * 7)
    } else {
      anim = 'marcha'
      this.frameAnim += dt * (5 + this.v * 0.55)
      f = this.frameAnim
    }
    const fr = Math.floor(f) % 16
    if (anim !== this.anim) {
      this.anim = anim
      this.mat.map = this.hojas[anim]
    }
    const t = this.hojas[anim]
    t.offset.set((fr % 4) * 0.25, 1 - (Math.floor(fr / 4) + 1) * 0.25)
    this._parpadeo = this.invulnerable > 0 && Math.floor(this.invulnerable * 10) % 2 === 0
  }

  // ---------------------------------------------------------------- ítems
  puedeRecoger() {
    return this.item < 0 && this.estado === 'normal' && !this.termino
  }

  recoger(nuevo) {
    this.item = nuevo
    this.iaTItem = 0.8 + Math.random() * 2.2
  }

  usarItem(adelante) {
    if (this.item < 0 || this.estado !== 'normal') return
    this.estado = 'accion'
    this.accion = adelante ? 'lanzar' : 'soltar'
    this.tEstado = 0
    this._lanzado = false
  }

  recibirGolpe(tipo) {
    if (this.invulnerable > 0 || this.estado === 'reaccion' || this.termino) return false
    if (this.estado === 'accion' && !this._lanzado) this.item = -1
    this.estado = 'reaccion'
    this.accion = ''
    this.reaccion = tipo
    this.tEstado = 0
    if (tipo === 0) this.v *= 0.7
    else if (tipo === 1) this.v *= 0.5
    else {
      this.v *= 0.45
      if (this.h <= 0) {
        this.vh = 4.5
        this.h = 0.01
        this._tSalto = 0
      }
    }
    this.carrera.evento('golpe', this)
    return true
  }

  // ---------------------------------------------------------------- IA
  pensarIA(dt, karts, trampas, referenciaS) {
    const pista = this.pista
    this.c.acelerar = true
    this.c.frenar = false
    this.c.saltar = false
    const dif = referenciaS - this.s
    this.factorVel = this.iaBase + clamp(dif / 250, -0.12, 0.08)

    // carril que cambia de vez en cuando
    this.iaTCarril -= dt
    if (this.iaTCarril <= 0) {
      this.iaTCarril = 2 + Math.random() * 4
      this.iaCarril = (Math.random() - 0.5) * 5
    }
    let objetivo = this.iaCarril
    // esquivar trampas en el carril
    for (const t of trampas) {
      const ds = t.s - this.s
      if (ds > 2 && ds < 22 && Math.abs(t.d - this.d) < 1.8) {
        objetivo = t.d > 0 ? t.d - 3 : t.d + 3
        if (ds < 7 && this.h <= 0) {
          if (!this.iaVistas.has(t.id)) this.iaVistas.set(t.id, Math.random() < 0.5)
          if (this.iaVistas.get(t.id)) this.c.saltar = true
        }
        break
      }
    }
    const adelante = 12
    const kap = pista.curvatura(this.s + adelante * 0.5)
    const aDeseado = Math.atan2(objetivo - this.d, adelante)
    const rata = GIRO * Math.min(1, this.v / 7) || 1
    const necesito = (aDeseado - this.a) * 3 + kap * this.v
    this.c.giro = clamp(necesito / rata, -1, 1)

    // turbo
    if (this.iaTTurbo > 0) {
      this.iaTTurbo -= dt
      this.c.turbo = true
    } else {
      this.c.turbo = false
      if (this.turbo > 0.7 && Math.abs(kap) < 0.01 && Math.random() < 0.2 * dt) this.iaTTurbo = 1 + Math.random() * 1.3
    }

    // usar ítems
    if (this.item >= 0 && this.estado === 'normal') {
      this.iaTItem -= dt
      if (this.iaTItem <= 0) {
        let delante = false
        let detras = false
        for (const o of karts) {
          if (o === this) continue
          const dd = o.s - this.s
          if (dd > 4 && dd < 45) delante = true
          else if (dd < -3 && dd > -25) detras = true
        }
        if (delante) this.usarItem(true)
        else if (detras || this.iaTItem < -5) this.usarItem(false)
      }
    }
  }

  quitar() {
    this.carrera.escena.remove(this.objeto)
    this.carrera.escena.remove(this.sombra)
    this.mat.dispose()
    for (const t of Object.values(this.hojas)) t.dispose()
  }
}
