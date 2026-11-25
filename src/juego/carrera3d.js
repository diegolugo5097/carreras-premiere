// Carrera 3D: escena Three.js, karts, cajas, trampas, cámaras por jugador, vueltas y HUD.
import * as THREE from 'three'
import { Kart } from './kart.js'
import { TOTAL_CORREDORES, VEHICULOS, VUELTAS, formatoTiempo } from './datos.js'
import { sonido, musicaEmpezar } from './recursos.js'
import { texturaCuadros } from './recursos3d.js'

export const ANCHO = 1280
export const ALTO = 720
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export class Carrera3D {
  constructor({ circuito, comunes, hojas, humanos, rivales, alEvento, cielo = '#a9d8f2' }) {
    this.pista = circuito.pista
    this.comunes = comunes
    this.alEvento = alEvento || (() => {})
    this.L = this.pista.largo
    this.metaS = this.L * VUELTAS

    // ---- escena
    const e = new THREE.Scene()
    this.escena = e
    e.background = new THREE.Color(cielo)
    e.fog = new THREE.Fog(cielo, 90, 420)
    e.add(circuito.escena)
    e.add(new THREE.HemisphereLight(0xeaf6ff, 0x6b5a3a, 1.25))
    const sol = new THREE.DirectionalLight(0xfff1d6, 1.6)
    sol.position.set(120, 200, 80)
    e.add(sol)

    this._crearMeta()

    this.karts = []
    this.humanos = []
    this.cajas = []
    this.trampas = []
    this.proyectiles = []
    this._idTrampa = 0
    this.llegadas = []

    this.estado = 'cuenta' // cuenta | carrera | final | terminada
    this.tCuenta = 3.6
    this._ultimoNumero = 4
    this.textoCentro = ''
    this.tTextoCentro = 0
    this.tiempo = 0
    this.tFinal = 0
    this.pausado = false

    this._crearCajas()
    this._crearKarts(hojas, humanos, rivales)
    this.contorno = this.pista.contorno()

    this.camaras = this.humanos.map((h) => {
      const c = new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 900)
      c.userData.rumbo = h.rumbo
      c.userData.kart = h
      c.userData.pos = new THREE.Vector3()
      this._moverCamara(c, h, 1)
      return c
    })
  }

  // ---------------------------------------------------------------- montaje
  _crearMeta() {
    const p = this.pista.punto(0, 0)
    const tex = texturaCuadros()
    tex.wrapS = THREE.RepeatWrapping
    // franja en el piso
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(this.pista.ancho, 1.6),
      new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2 }),
    )
    piso.rotation.x = -Math.PI / 2
    const g = new THREE.Group()
    g.add(piso)
    // arco
    const madera = new THREE.MeshLambertMaterial({ color: 0x6b3a1c })
    const poste = new THREE.CylinderGeometry(0.22, 0.22, 6.5, 10)
    for (const lado of [-1, 1]) {
      const m = new THREE.Mesh(poste, madera)
      m.position.set(lado * (this.pista.medio + 1.2), 3.25, 0)
      g.add(m)
    }
    const tex2 = texturaCuadros()
    tex2.wrapS = THREE.RepeatWrapping
    tex2.repeat.set(2, 1)
    const banda = new THREE.Mesh(
      new THREE.PlaneGeometry(this.pista.ancho + 2.8, 1.3),
      new THREE.MeshBasicMaterial({ map: tex2, side: THREE.DoubleSide }),
    )
    banda.position.set(0, 6, 0)
    g.add(banda)
    g.position.set(p.x, p.y + 0.03, p.z)
    // la vía va en dirección fi; el arco queda atravesado
    g.rotation.y = -p.fi - Math.PI / 2
    this.escena.add(g)
  }

  _crearCajas() {
    const mat = new THREE.SpriteMaterial({ map: this.comunes.caja, transparent: true, alphaTest: 0.1 })
    this._matCajaAbierta = new THREE.SpriteMaterial({ map: this.comunes.cajaAbierta, transparent: true, alphaTest: 0.1 })
    for (const f of [0.17, 0.41, 0.65, 0.87]) {
      for (const d of [-3.6, -1.2, 1.2, 3.6]) {
        const s = this.L * f
        const spr = new THREE.Sprite(mat)
        spr.scale.set(1.9, 1.9, 1)
        spr.center.set(0.5, 0.25)
        const p = this.pista.punto(s, d)
        spr.position.set(p.x, p.y + 0.6, p.z)
        this.escena.add(spr)
        this.cajas.push({ s, d, spr, mat, activa: true, t: 0, fase: Math.random() * 6, y: p.y + 0.6 })
      }
    }
  }

  _crearKarts(hojas, humanos, rivales) {
    const total = Math.max(TOTAL_CORREDORES, humanos.length)
    // los humanos salen atrás (y así ningún rival queda pegado a su cámara)
    const puestosH = Array.from({ length: humanos.length }, (_, i) => total - 1 - i)
    let h = 0
    let r = 0
    for (let i = 0; i < total; i++) {
      const fila = Math.floor(i / 2)
      const s = -5 - fila * 5.5
      const d = i % 2 ? 2.4 : -2.4
      let k
      if (puestosH.includes(i) && h < humanos.length) {
        const hu = humanos[h++]
        k = new Kart(this, hu.vehiculo, hojas.get(hu.vehiculo), s, d, hu)
        this.humanos.push(k)
      } else {
        const v = rivales[r++ % rivales.length]
        k = new Kart(this, v, hojas.get(v), s, d, null)
      }
      this.karts.push(k)
    }
  }

  // ---------------------------------------------------------------- eventos
  evento(tipo, k) {
    const cerca = this.humanos.some((h) => Math.abs(h.s - k.s) < 60)
    if (tipo === 'salto' && k.esHumano) sonido('salto', 0.3)
    if (tipo === 'golpe') {
      if (cerca) sonido('golpe', 0.6)
      if (k.esHumano) this.alEvento('golpe', k)
    }
  }

  // ---------------------------------------------------------------- bucle
  actualizar(dt) {
    if (this.pausado) return
    if (this.tTextoCentro > 0) {
      this.tTextoCentro -= dt
      if (this.tTextoCentro <= 0) this.textoCentro = ''
    }
    if (this.estado === 'cuenta') {
      this.tCuenta -= dt
      const n = Math.ceil(this.tCuenta - 0.6)
      if (n < this._ultimoNumero && n >= 1) {
        this._ultimoNumero = n
        this.textoCentro = String(n)
        sonido('beep', 0.5)
      }
      if (this.tCuenta <= 0.6) {
        this.estado = 'carrera'
        this.textoCentro = '¡YA!'
        this.tTextoCentro = 0.9
        sonido('ya', 0.5)
        musicaEmpezar(0.22)
      }
    } else {
      this.tiempo += dt
    }
    const activa = this.estado !== 'cuenta'
    const lider = this.humanos.reduce((m, h) => Math.max(m, h.s), -Infinity)

    for (const k of this.karts) {
      if (k.esHumano) {
        const l = k.humano.lector.actualizar()
        const e = l.estado
        k.c.acelerar = e.acelerar
        k.c.frenar = e.frenar
        k.c.turbo = e.turbo
        k.c.giro = Math.abs(e.giro) > 0.15 ? e.giro : (e.derecha ? 1 : 0) - (e.izquierda ? 1 : 0)
        k.c.saltar = l.pulso.saltar
        if (activa && !k.termino) {
          if (l.pulso.lanzar) k.usarItem(true)
          else if (l.pulso.soltar) k.usarItem(false)
          if (l.pulso.turbo && k.turbo > 0.05) sonido('turbo', 0.3)
        }
      } else if (activa) {
        k.pensarIA(dt, this.karts, this.trampas, lider)
      }
      const vueltaAntes = k.vuelta
      k.actualizar(dt, activa)
      if (activa && k.esHumano && !k.termino && k.vuelta > vueltaAntes && k.vuelta <= VUELTAS && k.vuelta > 1) {
        sonido('caja', 0.4)
        k._aviso = k.vuelta === VUELTAS ? '¡Última vuelta!' : `Vuelta ${k.vuelta}`
        k._tAviso = 1.6
      }
      if (k._tAviso > 0) k._tAviso -= dt
      if (!k.termino && k.s >= this.metaS) this._llego(k)
    }
    if (activa) this._choques()
    this._actualizarCajas(dt)
    this._actualizarProyectiles(dt)
    this._actualizarTrampas()

    if (this.estado === 'final') {
      this.tFinal += dt
      const todos = this.humanos.every((h) => h.termino)
      if ((todos && this.tFinal > 3) || this.tFinal > 40) {
        this.estado = 'terminada'
        this.alEvento('fin', this.clasificacion())
      }
    }
  }

  _choques() {
    const ks = this.karts
    for (let i = 0; i < ks.length; i++)
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i]
        const b = ks[j]
        const ds = b.s - a.s
        const dd = b.d - a.d
        if (Math.abs(ds) < 2.1 && Math.abs(dd) < 1.7 && Math.abs(a.h - b.h) < 1) {
          const emp = (1.7 - Math.abs(dd)) / 2
          const sg = dd >= 0 ? 1 : -1
          a.d -= sg * emp
          b.d += sg * emp
          const atras = ds > 0 ? a : b
          atras.v *= 0.985
        }
      }
  }

  _llego(k) {
    k.termino = true
    k.tiempoFinal = this.tiempo
    this.llegadas.push(k)
    if (k.esHumano) {
      if (this.estado === 'carrera') this.estado = 'final'
      sonido('meta', 0.5)
      this.alEvento('llego', k)
    }
  }

  posicionDe(k) {
    return this.clasificacion().indexOf(k) + 1
  }

  clasificacion() {
    return [...this.karts].sort((a, b) => {
      if (a.termino && b.termino) return a.tiempoFinal - b.tiempoFinal
      if (a.termino !== b.termino) return a.termino ? -1 : 1
      return b.s - a.s
    })
  }

  tiempoEstimado(k) {
    if (k.termino) return k.tiempoFinal
    return this.tiempo + (this.metaS - k.s) / Math.max(k.v, 15)
  }

  // ---------------------------------------------------------------- cajas
  _dist(s1, s2) {
    // distancia más corta sobre un circuito cerrado
    let d = (((s1 - s2) % this.L) + this.L) % this.L
    if (d > this.L / 2) d -= this.L
    return d
  }

  _actualizarCajas(dt) {
    for (const b of this.cajas) {
      if (b.activa) {
        b.fase += dt * 3
        b.spr.position.y = b.y + Math.sin(b.fase) * 0.18
        for (const k of this.karts) {
          if (k.puedeRecoger() && Math.abs(this._dist(k.s, b.s)) < 1.6 && Math.abs(k.d - b.d) < 1.5 && k.h < 1.6) {
            b.activa = false
            b.t = 3.5
            b.spr.material = this._matCajaAbierta
            k.recoger(Math.floor(Math.random() * 3))
            if (k.esHumano) {
              sonido('caja', 0.45)
              this.alEvento('caja', k)
            }
            break
          }
        }
      } else {
        b.t -= dt
        b.spr.visible = b.t > 3.1 || b.t <= 0
        if (b.t <= 0) {
          b.activa = true
          b.spr.material = b.mat
          b.spr.visible = true
        }
      }
    }
  }

  // ---------------------------------------------------------------- ítems
  lanzar(k, item) {
    const mat = new THREE.SpriteMaterial({ map: this.comunes.vuelo[item], transparent: true, alphaTest: 0.1 })
    const spr = new THREE.Sprite(mat)
    spr.scale.set(1.5, 1.5, 1)
    this.escena.add(spr)
    this.proyectiles.push({ s: k.s + 2.5, d: k.d, v: k.v + 18, t: 0, tipo: item, dueno: k, spr })
    if (this.humanos.some((h) => Math.abs(h.s - k.s) < 60)) sonido('lanzar', 0.4)
  }

  soltar(k, item) {
    this._ponerTrampa(k.s - 2.6, k.d, item, k)
    if (this.humanos.some((h) => Math.abs(h.s - k.s) < 60)) sonido('lanzar', 0.3)
  }

  _ponerTrampa(s, d, item, dueno) {
    const mat = new THREE.SpriteMaterial({ map: this.comunes.trampas[item], transparent: true, alphaTest: 0.1 })
    const spr = new THREE.Sprite(mat)
    spr.scale.set(1.6, 1.6, 1)
    spr.center.set(0.5, 0.1)
    const p = this.pista.punto(s, d)
    spr.position.set(p.x, p.y + 0.02, p.z)
    this.escena.add(spr)
    this.trampas.push({ s, d, tipo: item, dueno, t: 0, id: ++this._idTrampa, spr, tCrea: this.tiempo })
    if (this.trampas.length > 30) this._quitarTrampa(this.trampas[0])
  }

  _quitarTrampa(t) {
    this.escena.remove(t.spr)
    t.spr.material.dispose()
    this.trampas.splice(this.trampas.indexOf(t), 1)
  }

  _actualizarProyectiles(dt) {
    const T = 1.1
    for (const p of [...this.proyectiles]) {
      p.t += dt
      p.s += p.v * dt
      const h = 1.2 + 4.2 * p.t - (4.2 / T) * p.t * p.t
      const q = this.pista.punto(p.s, p.d)
      p.spr.position.set(q.x, q.y + Math.max(0.3, h), q.z)
      p.spr.material.rotation += dt * 8
      let choco = false
      for (const k of this.karts) {
        if (k === p.dueno) continue
        if (Math.abs(this._dist(k.s, p.s)) < 1.9 && Math.abs(k.d - p.d) < 1.7 && k.recibirGolpe(p.tipo)) {
          choco = true
          break
        }
      }
      if (choco || p.t >= T) {
        this.escena.remove(p.spr)
        p.spr.material.dispose()
        this.proyectiles.splice(this.proyectiles.indexOf(p), 1)
        if (!choco) this._ponerTrampa(p.s, p.d, p.tipo, p.dueno)
      }
    }
  }

  _actualizarTrampas() {
    for (const t of [...this.trampas]) {
      for (const k of this.karts) {
        if (k === t.dueno && this.tiempo - t.tCrea < 1.2) continue
        if (Math.abs(this._dist(k.s, t.s)) > 1.4 || Math.abs(k.d - t.d) > 1.25 || k.h > 0.5) continue
        if (k.recibirGolpe(t.tipo)) {
          this._quitarTrampa(t)
          break
        }
      }
    }
  }

  // ---------------------------------------------------------------- cámaras y dibujo
  vistas() {
    const n = this.humanos.length
    if (n <= 1) return [{ x: 0, y: 0, w: ANCHO, h: ALTO }]
    if (n === 2)
      return [
        { x: 0, y: 0, w: ANCHO, h: 358 },
        { x: 0, y: 362, w: ANCHO, h: 358 },
      ]
    return [
      { x: 0, y: 0, w: 638, h: 358 },
      { x: 642, y: 0, w: 638, h: 358 },
      { x: 0, y: 362, w: 638, h: 358 },
      { x: 642, y: 362, w: 638, h: 358 },
    ]
  }

  _moverCamara(cam, k, t) {
    const u = cam.userData
    let dr = k.rumbo - u.rumbo
    while (dr > Math.PI) dr -= 2 * Math.PI
    while (dr < -Math.PI) dr += 2 * Math.PI
    u.rumbo += dr * t
    const fx = Math.cos(u.rumbo)
    const fz = Math.sin(u.rumbo)
    const p = k.posMundo
    const atras = 8.2 + k.v * 0.05
    const objetivo = new THREE.Vector3(p.x - fx * atras, p.y + 3.2 + k.h * 0.3, p.z - fz * atras)
    if (t >= 1) u.pos.copy(objetivo)
    else u.pos.lerp(objetivo, Math.min(1, t * 1.6))
    cam.position.copy(u.pos)
    cam.lookAt(p.x + fx * 8, p.y + 1.1, p.z + fz * 8)
    const fovObj = k.usandoTurbo ? 78 : 68
    cam.fov += (fovObj - cam.fov) * Math.min(1, t * 0.6)
    cam.updateProjectionMatrix()
  }

  dibujar(renderer, ctx, k, dt) {
    const vistas = this.vistas()
    const W = ANCHO * k
    const H = ALTO * k
    renderer.setScissorTest(true)
    renderer.setClearColor(0x1b0d05)
    renderer.setViewport(0, 0, W, H)
    renderer.setScissor(0, 0, W, H)
    renderer.clear()
    const suave = Math.min(1, (dt || 0) * 7)
    this.humanos.forEach((h, i) => {
      const v = vistas[i]
      const cam = this.camaras[i]
      cam.aspect = v.w / v.h
      this._moverCamara(cam, h, this.pausado ? 0 : suave)
      renderer.setViewport(v.x * k, H - (v.y + v.h) * k, v.w * k, v.h * k)
      renderer.setScissor(v.x * k, H - (v.y + v.h) * k, v.w * k, v.h * k)
      renderer.render(this.escena, cam)
    })
    renderer.setScissorTest(false)

    // HUD 2D
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.clearRect(0, 0, ANCHO, ALTO)
    if (this.humanos.length > 1) {
      ctx.fillStyle = '#1b0d05'
      if (this.humanos.length === 2) ctx.fillRect(0, 358, ANCHO, 4)
      else {
        ctx.fillRect(0, 358, ANCHO, 4)
        ctx.fillRect(638, 0, 4, ALTO)
      }
    }
    this.humanos.forEach((h, i) => this._hudVista(ctx, vistas[i], h, this.camaras[i]))
    if (this.humanos.length === 3) this._tablero(ctx, vistas[3])
    if (this.humanos.length > 1) this._texto(ctx, formatoTiempo(this.tiempo), ANCHO / 2, ALTO / 2 + 1, 24, '#fff', 'center', 'middle')
  }

  // ---------------------------------------------------------------- HUD
  _texto(ctx, txt, x, y, tam, color, alin = 'left', base = 'top', borde = 0.16) {
    ctx.font = `800 ${tam}px system-ui, "Segoe UI", sans-serif`
    ctx.textAlign = alin
    ctx.textBaseline = base
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(3, tam * borde)
    ctx.strokeStyle = '#2a1206'
    ctx.strokeText(txt, x, y)
    ctx.fillStyle = color
    ctx.fillText(txt, x, y)
  }

  _hudVista(ctx, v, h, cam) {
    const unico = this.humanos.length === 1
    const e = unico ? 1 : v.w < 700 ? 0.62 : 0.7
    ctx.save()
    ctx.beginPath()
    ctx.rect(v.x, v.y, v.w, v.h)
    ctx.clip()
    ctx.translate(v.x, v.y)

    // marcadores J1..J4 sobre los karts humanos (pantalla dividida)
    if (!unico) {
      const tmp = new THREE.Vector3()
      for (const o of this.humanos) {
        if (o === h) continue
        tmp.copy(o.posMundo)
        tmp.y += 3.7
        tmp.project(cam)
        if (tmp.z > 1 || tmp.z < -1) continue
        const sx = ((tmp.x + 1) / 2) * v.w
        const sy = ((1 - tmp.y) / 2) * v.h
        if (sx < -20 || sx > v.w + 20 || sy < -20 || sy > v.h + 20) continue
        ctx.fillStyle = o.humano.color
        ctx.beginPath()
        ctx.moveTo(sx - 9, sy - 12)
        ctx.lineTo(sx + 9, sy - 12)
        ctx.lineTo(sx, sy)
        ctx.closePath()
        ctx.fill()
        this._texto(ctx, 'J' + o.humano.numero, sx, sy - 14, 18, o.humano.color, 'center', 'bottom')
      }
    }

    const col = unico ? '#ffd23f' : h.humano.color
    this._texto(ctx, `${this.posicionDe(h)}º`, 20 * e, 10 * e, 78 * e, col)
    const vuelta = Math.min(VUELTAS, Math.max(1, h.vuelta))
    this._texto(ctx, `Vuelta ${vuelta}/${VUELTAS}`, 22 * e, 96 * e, 26 * e, '#fff')
    if (!unico) this._texto(ctx, 'J' + h.humano.numero, 22 * e, 126 * e, 24 * e, col)
    if (unico) this._texto(ctx, formatoTiempo(h.termino ? h.tiempoFinal : this.tiempo), v.w - 26, 18, 34, '#fff', 'right')

    // ítem + turbo
    const sz = 104 * e
    const sx = 20 * e
    const sy = v.h - sz - 20 * e
    ctx.fillStyle = 'rgba(40,18,6,.78)'
    ctx.strokeStyle = '#ffd23f'
    ctx.lineWidth = 4 * e
    redondeado(ctx, sx, sy, sz, sz, 14 * e)
    ctx.fill()
    ctx.stroke()
    if (h.item >= 0) {
      const im = this.comunes.trampas[h.item].image
      if (im) ctx.drawImage(im, sx + 6 * e, sy + 6 * e, sz - 12 * e, sz - 12 * e)
    }
    const tx = sx + sz + 14 * e
    const tw = 190 * e
    const th = 18 * e
    ctx.fillStyle = 'rgba(30,14,5,.8)'
    ctx.fillRect(tx, sy + 4 * e, tw, th)
    ctx.fillStyle = h.usandoTurbo ? '#ffe45c' : '#ff8c1a'
    ctx.fillRect(tx + 3 * e, sy + 7 * e, (tw - 6 * e) * h.turbo, th - 6 * e)
    ctx.strokeStyle = '#ffd23f'
    ctx.lineWidth = 2
    ctx.strokeRect(tx, sy + 4 * e, tw, th)
    this._texto(ctx, 'TURBO', tx, sy + 28 * e, 15 * e, '#fff')
    this._texto(ctx, `${Math.round(h.v * 3.6)} km/h`, tx, sy + 52 * e, 26 * e, '#fff')

    // minimapa
    this._minimapa(ctx, v.w - (unico ? 190 : 120 * e / 0.62) - 14, v.h - (unico ? 190 : 120 * e / 0.62) - 14, unico ? 180 : 120 * e / 0.62, h)

    // textos centrales
    let centro = this.textoCentro
    if (h.termino) centro = `¡Llegaste ${this.llegadas.indexOf(h) + 1}º!`
    else if (h._tAviso > 0) centro = h._aviso
    if (centro) {
      const tam = (centro.length > 4 ? 72 : 130) * (unico ? 1 : 0.62)
      this._texto(ctx, centro, v.w / 2, v.h * 0.36, tam, '#ffd23f', 'center', 'middle', 0.12)
    }
    ctx.restore()
  }

  _minimapa(ctx, x, y, lado, yo) {
    const m = this.pista.mapa
    const ox = x + (lado - lado * m.w) / 2
    const oy = y + (lado - lado * m.h) / 2
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.beginPath()
    this.contorno.forEach(([u, w], i) => (i ? ctx.lineTo(ox + u * lado, oy + w * lado) : ctx.moveTo(ox + u * lado, oy + w * lado)))
    ctx.closePath()
    ctx.strokeStyle = 'rgba(30,14,5,.85)'
    ctx.lineWidth = lado * 0.07
    ctx.stroke()
    ctx.strokeStyle = '#f3e3c3'
    ctx.lineWidth = lado * 0.035
    ctx.stroke()
    const orden = [...this.karts].sort((a, b) => (a === yo ? 1 : b === yo ? -1 : 0))
    for (const k of orden) {
      const [u, w] = this.pista.aMapa(k.posMundo.x, k.posMundo.z)
      ctx.beginPath()
      ctx.arc(ox + u * lado, oy + w * lado, k === yo ? lado * 0.05 : lado * 0.032, 0, 7)
      ctx.fillStyle = k.esHumano ? k.humano.color : '#fff'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#2a1206'
      ctx.stroke()
    }
    ctx.restore()
  }

  _tablero(ctx, v) {
    ctx.save()
    ctx.translate(v.x, v.y)
    ctx.fillStyle = '#2a1408'
    ctx.fillRect(0, 0, v.w, v.h)
    this._texto(ctx, 'Posiciones', v.w / 2, 16, 32, '#ffd23f', 'center')
    this.clasificacion().forEach((k, i) => {
      const y = 62 + i * 46
      ctx.fillStyle = k.esHumano ? k.humano.color + '55' : 'rgba(80,40,15,.6)'
      ctx.fillRect(60, y, v.w - 120, 40)
      this._texto(ctx, `${i + 1}º`, 76, y + 4, 28, '#fff')
      const ic = this.iconos?.get(k.vehiculo)
      if (ic) ctx.drawImage(ic, 150, y - 4, 46, 46)
      if (k.esHumano) this._texto(ctx, 'J' + k.humano.numero, 214, y + 6, 24, k.humano.color)
      this._texto(ctx, `V${Math.min(VUELTAS, Math.max(1, k.vuelta))}`, v.w - 76, y + 6, 24, '#fff', 'right')
    })
    ctx.restore()
  }

  destruir() {
    for (const k of this.karts) k.quitar()
    for (const t of [...this.trampas]) this._quitarTrampa(t)
    for (const p of this.proyectiles) this.escena.remove(p.spr)
  }
}

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function elegirRivales(humanosVeh, cantidad) {
  const libres = VEHICULOS.map((_, i) => i).filter((i) => !humanosVeh.includes(i))
  for (let i = libres.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[libres[i], libres[j]] = [libres[j], libres[i]]
  }
  return libres.slice(0, cantidad)
}
