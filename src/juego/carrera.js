// Lógica y dibujo de una carrera: pista, corredores, cajas, trampas, cámaras y HUD.
import { Corredor } from './corredor.js'
import { TOTAL_CORREDORES, VEHICULOS, formatoTiempo } from './datos.js'
import { sonido, musicaEmpezar } from './recursos.js'

export const ANCHO = 1280
export const ALTO = 720
const G_PROYECTIL = 1500

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export class Carrera {
  /**
   * @param {object} o
   * @param {object} o.pista      datos de cargarPista()
   * @param {object} o.comunes    imágenes de cargarComunes()
   * @param {Map}    o.anims      vehiculo -> animaciones
   * @param {Array}  o.humanos    [{ vehiculo, numero, color, lector }]
   * @param {Array}  o.rivales    lista de vehículos rivales
   * @param {Function} o.alEvento (tipo, datos) para avisar a la interfaz (celulares, fin, etc.)
   */
  constructor({ pista, comunes, anims, humanos, rivales, alEvento }) {
    this.pista = pista
    this.comunes = comunes
    this.alEvento = alEvento || (() => {})
    this.ancho = pista.ancho
    this.alto = pista.alto
    this.alturas = pista.alturas
    this.paso = pista.paso
    this.xSalida = pista.salida
    this.xMeta = pista.meta

    this.corredores = []
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
    this._crearCorredores(anims, humanos, rivales)
    this.camaras = this.humanos.map((h) => ({ x: h.x, y: h.y }))
  }

  // ---------------------------------------------------------------- suelo
  sueloY(px) {
    const f = clamp(px, 0, this.ancho) / this.paso
    const i = Math.floor(f)
    const a = this.alturas
    if (i >= a.length - 1) return a[a.length - 1]
    return a[i] + (a[i + 1] - a[i]) * (f - i)
  }
  pendiente(px) {
    return (this.sueloY(px + 20) - this.sueloY(px - 20)) / 40
  }
  curvatura(px) {
    const d = 56
    return (this.sueloY(px + d) - 2 * this.sueloY(px) + this.sueloY(px - d)) / (d * d)
  }

  // ---------------------------------------------------------------- montaje
  _crearCajas() {
    for (let bx = 2200; bx < this.xMeta - 1400; bx += 2700) {
      for (let k = 0; k < 3; k++) {
        const x = bx + k * 240
        this.cajas.push({ x, y: this.sueloY(x) - 125, activa: true, t: 0, fase: Math.random() * 6.28 })
      }
    }
  }

  _crearCorredores(anims, humanos, rivales) {
    const total = Math.max(TOTAL_CORREDORES, humanos.length)
    const nRivales = total - humanos.length
    // posiciones en la parrilla: los humanos salen repartidos atrás/medio
    const puestos = Array.from({ length: total }, (_, i) => i)
    const puestosHumanos = []
    for (let k = 0; k < humanos.length; k++) puestosHumanos.push(Math.min(total - 1, 1 + k * 2 - (k > 1 ? 1 : 0)))
    let r = 0
    let h = 0
    for (const i of puestos) {
      const x = this.xSalida + i * 140
      const esH = puestosHumanos.includes(i) && h < humanos.length
      let c
      if (esH) {
        const hu = humanos[h++]
        c = new Corredor(this, hu.vehiculo, anims.get(hu.vehiculo), x, hu)
        this.humanos.push(c)
      } else if (r < nRivales) {
        const v = rivales[r++ % rivales.length]
        c = new Corredor(this, v, anims.get(v), x, null)
      } else continue
      this.corredores.push(c)
    }
  }

  // ---------------------------------------------------------------- eventos
  evento(tipo, c) {
    const cerca = this.humanos.some((h) => Math.abs(h.x - c.x) < 1300)
    if (tipo === 'salto' && c.esHumano) sonido('salto', 0.35)
    if (tipo === 'golpe') {
      if (cerca) sonido('golpe', 0.6)
      if (c.esHumano) this.alEvento('golpe', c)
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

    // entradas de humanos
    const lider = this.humanos.reduce((m, h) => (h.x > m ? h.x : m), 0)
    for (const c of this.corredores) {
      if (c.esHumano) {
        const l = c.humano.lector.actualizar()
        c.c.acelerar = l.estado.acelerar
        c.c.frenar = l.estado.frenar
        c.c.turbo = l.estado.turbo
        c.c.saltar = l.pulso.saltar
        if (activa && !c.termino) {
          if (l.pulso.lanzar) c.usarItem(true)
          else if (l.pulso.soltar) c.usarItem(false)
          if (l.pulso.turbo && c.turbo > 0.05) sonido('turbo', 0.3)
        }
      } else if (activa) {
        c.pensarIA(dt, this.corredores, this.trampas, lider)
      } else {
        c.c.acelerar = false
      }
      c.actualizar(dt, activa)
      if (!c.termino && c.x >= this.xMeta) this._llego(c)
    }

    this._actualizarCajas(dt)
    this._actualizarProyectiles(dt)
    this._actualizarTrampas(dt)

    if (this.estado === 'final') {
      this.tFinal += dt
      const todos = this.humanos.every((h) => h.termino)
      if ((todos && this.tFinal > 3) || this.tFinal > 30) {
        this.estado = 'terminada'
        this.alEvento('fin', this.clasificacion())
      }
    }
  }

  _llego(c) {
    c.termino = true
    c.tiempoFinal = this.tiempo
    this.llegadas.push(c)
    if (c.esHumano) {
      if (this.estado === 'carrera') this.estado = 'final'
      sonido('meta', 0.5)
      this.alEvento('llego', c)
    }
  }

  posicionDe(c) {
    return this.clasificacion().indexOf(c) + 1
  }

  clasificacion() {
    return [...this.corredores].sort((a, b) => {
      if (a.termino && b.termino) return a.tiempoFinal - b.tiempoFinal
      if (a.termino !== b.termino) return a.termino ? -1 : 1
      return b.x - a.x
    })
  }

  tiempoEstimado(c) {
    if (c.termino) return c.tiempoFinal
    return this.tiempo + (this.xMeta - c.x) / Math.max(c.vx, 450)
  }

  // ---------------------------------------------------------------- cajas
  _actualizarCajas(dt) {
    for (const b of this.cajas) {
      if (b.activa) {
        b.fase += dt * 3
        b.yy = b.y + Math.sin(b.fase) * 8
        for (const c of this.corredores) {
          if (c.puedeRecoger() && Math.abs(c.x + 30 - b.x) < 80 && Math.abs(c.y - 90 - b.yy) < 120) {
            b.activa = false
            b.t = 3.5
            c.recoger(Math.floor(Math.random() * 3))
            if (c.esHumano) {
              sonido('caja', 0.45)
              this.alEvento('caja', c)
            }
            break
          }
        }
      } else {
        b.t -= dt
        if (b.t <= 0) b.activa = true
      }
    }
  }

  // ---------------------------------------------------------------- ítems
  lanzar(c, item) {
    this.proyectiles.push({ x: c.x + 140, y: c.y - 110, vx: c.vx + 650, vy: -380, tipo: item, dueno: c, rot: 0 })
    if (this.humanos.some((h) => Math.abs(h.x - c.x) < 1300)) sonido('lanzar', 0.4)
  }

  soltar(c, item) {
    this._ponerTrampa(c.x - 140, item, c)
    if (this.humanos.some((h) => Math.abs(h.x - c.x) < 1300)) sonido('lanzar', 0.3)
  }

  _ponerTrampa(px, item, dueno) {
    px = clamp(px, 50, this.ancho - 50)
    this.trampas.push({ x: px, tipo: item, dueno, t: 0, id: ++this._idTrampa, rot: Math.atan(this.pendiente(px)) })
    if (this.trampas.length > 40) this.trampas.shift()
  }

  _actualizarProyectiles(dt) {
    for (const p of [...this.proyectiles]) {
      p.vy += G_PROYECTIL * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += dt * 8
      let choco = false
      for (const c of this.corredores) {
        if (c === p.dueno) continue
        if (Math.abs(c.x - p.x) < 85 && Math.abs(c.y - 80 - p.y) < 85 && c.recibirGolpe(p.tipo)) {
          choco = true
          break
        }
      }
      if (choco) this.proyectiles.splice(this.proyectiles.indexOf(p), 1)
      else if (p.y >= this.sueloY(p.x) - 10) {
        this.proyectiles.splice(this.proyectiles.indexOf(p), 1)
        this._ponerTrampa(p.x, p.tipo, p.dueno)
      }
    }
  }

  _actualizarTrampas(dt) {
    for (const t of [...this.trampas]) {
      t.t += dt
      for (const c of this.corredores) {
        if (c === t.dueno && t.t < 1.2) continue
        if (Math.abs(c.x + 20 - t.x) > 85) continue
        if (c.y < this.sueloY(c.x) - 45) continue // la está saltando
        if (c.recibirGolpe(t.tipo)) {
          this.trampas.splice(this.trampas.indexOf(t), 1)
          break
        }
      }
    }
  }

  // ---------------------------------------------------------------- dibujo
  vistas() {
    const n = this.humanos.length
    if (n <= 1) return [{ x: 0, y: 0, w: ANCHO, h: ALTO, zoom: 0.72 }]
    if (n === 2)
      return [
        { x: 0, y: 0, w: ANCHO, h: 358, zoom: 0.5 },
        { x: 0, y: 362, w: ANCHO, h: 358, zoom: 0.5 },
      ]
    const w = 638
    const h = 358
    return [
      { x: 0, y: 0, w, h, zoom: 0.4 },
      { x: 642, y: 0, w, h, zoom: 0.4 },
      { x: 0, y: 362, w, h, zoom: 0.4 },
      { x: 642, y: 362, w, h, zoom: 0.4 },
    ]
  }

  dibujar(ctx, dt) {
    ctx.fillStyle = '#1b0d05'
    ctx.fillRect(0, 0, ANCHO, ALTO)
    const vistas = this.vistas()
    this.humanos.forEach((h, i) => this._dibujarVista(ctx, vistas[i], h, i, dt))
    if (this.humanos.length === 3) this._dibujarTablero(ctx, vistas[3])
    if (this.humanos.length > 1) {
      // tiempo centrado entre vistas
      ctx.save()
      this._texto(ctx, formatoTiempo(this.tiempo), ANCHO / 2, ALTO / 2 + 1, 26, '#fff', 'center', 'middle')
      ctx.restore()
    }
  }

  _dibujarVista(ctx, v, h, idx, dt) {
    const z = v.zoom
    const mw = v.w / z
    const mh = v.h / z
    // cámara suave
    const cam = this.camaras[idx]
    const objX = h.x + mw * 0.18
    const objY = h.y - mh * 0.12
    const k = Math.min(1, (dt || 0.016) * 7)
    cam.x += (objX - cam.x) * k
    cam.y += (objY - cam.y) * k
    const izq = clamp(cam.x - mw / 2, 0, this.ancho - mw)
    const arriba = clamp(cam.y - mh / 2, 0, Math.max(0, this.alto - mh))

    ctx.save()
    ctx.beginPath()
    ctx.rect(v.x, v.y, v.w, v.h)
    ctx.clip()
    ctx.translate(v.x, v.y)
    ctx.scale(z, z)
    ctx.translate(-izq, -arriba)

    // pista
    const at = this.pista.anchoTramo
    const t0 = Math.max(0, Math.floor(izq / at))
    const t1 = Math.min(this.pista.imgTramos.length - 1, Math.floor((izq + mw) / at))
    for (let t = t0; t <= t1; t++) {
      ctx.drawImage(this.pista.imgTramos[t], t * at, 0, at + 1, this.alto)
    }
    this._lineas(ctx, izq, mw)

    // cajas
    for (const b of this.cajas) {
      if (b.x < izq - 200 || b.x > izq + mw + 200) continue
      const abierta = !b.activa && b.t > 3.1
      if (!b.activa && !abierta) continue
      const im = abierta ? this.comunes.cajaAbierta : this.comunes.caja
      const s = 128 * 1.6
      ctx.drawImage(im, b.x - s / 2, (b.yy ?? b.y) - s / 2, s, s)
    }
    // trampas
    for (const t of this.trampas) {
      if (t.x < izq - 200 || t.x > izq + mw + 200) continue
      const s = 128 * 1.35
      ctx.save()
      ctx.translate(t.x, this.sueloY(t.x) + 4)
      ctx.rotate(t.rot)
      ctx.drawImage(this.comunes.trampas[t.tipo], -s / 2, -s / 2 - 50 * 1.35, s, s)
      ctx.restore()
    }
    // corredores (el de esta vista encima)
    const orden = this.corredores.filter((c) => c !== h && c.x > izq - 400 && c.x < izq + mw + 400)
    orden.sort((a, b) => (a.esHumano === b.esHumano ? 0 : a.esHumano ? 1 : -1))
    orden.push(h)
    for (const c of orden) {
      c.dibujar(ctx)
      if (c.esHumano && this.humanos.length > 1) this._marcador(ctx, c, z)
    }
    // proyectiles
    for (const p of this.proyectiles) {
      const s = 128 * 1.2
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.drawImage(this.comunes.vuelo[p.tipo], -s / 2, -s / 2, s, s)
      ctx.restore()
    }
    ctx.restore()

    this._hudVista(ctx, v, h)
  }

  _marcador(ctx, c, z) {
    const y = c.y - 290
    const s = 1 / z
    ctx.save()
    ctx.translate(c.x - 20, y)
    ctx.scale(s * 0.5, s * 0.5)
    ctx.fillStyle = c.humano.color
    ctx.strokeStyle = '#1b0d05'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(-18, -26)
    ctx.lineTo(18, -26)
    ctx.lineTo(0, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.font = 'bold 26px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.lineWidth = 6
    ctx.strokeText('J' + c.humano.numero, 0, -30)
    ctx.fillText('J' + c.humano.numero, 0, -30)
    ctx.restore()
  }

  _lineas(ctx, izq, mw) {
    const cuadros = (px) => {
      const lado = 17
      for (let f = 0; f < 4; f++)
        for (let c = 0; c < 2; c++) {
          ctx.fillStyle = (f + c) % 2 === 0 ? '#fff' : '#000'
          ctx.fillRect(px + c * lado, this.sueloY(px) - 4 + f * lado, lado, lado)
        }
    }
    if (this.xSalida + 90 > izq - 100 && this.xSalida < izq + mw) cuadros(this.xSalida + 90)
    if (this.xMeta > izq - 200 && this.xMeta < izq + mw + 200) {
      cuadros(this.xMeta)
      const base = this.sueloY(this.xMeta)
      const i = this.xMeta - 10
      const d = this.xMeta + 44
      ctx.fillStyle = '#5a3319'
      ctx.fillRect(i - 8, base - 420, 12, 420)
      ctx.fillRect(d, base - 420, 12, 420)
      for (let f = 0; f < 3; f++)
        for (let c = 0; c < 6; c++) {
          ctx.fillStyle = (f + c) % 2 === 0 ? '#fff' : '#000'
          ctx.fillRect(i - 8 + c * 10.67, base - 420 + f * 18, 10.67, 18)
        }
    }
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

  _hudVista(ctx, v, h) {
    const s = Math.max(0.5, Math.min(1, v.h / 720 + (v.w < 700 ? 0.12 : 0.15)))
    ctx.save()
    ctx.beginPath()
    ctx.rect(v.x, v.y, v.w, v.h)
    ctx.clip()
    ctx.translate(v.x, v.y)
    const unico = this.humanos.length === 1
    const esc = unico ? 1 : s

    // posición
    const pos = this.posicionDe(h)
    const colPos = this.humanos.length > 1 ? h.humano.color : '#ffd23f'
    this._texto(ctx, `${pos}º/${this.corredores.length}`, 20 * esc, 10 * esc, 64 * esc, colPos)
    if (this.humanos.length > 1) this._texto(ctx, 'J' + h.humano.numero, 20 * esc, 82 * esc, 26 * esc, '#fff')

    // barra de progreso
    const bx = unico ? 250 : 210 * esc
    const bw = v.w - bx - (unico ? 250 : 40 * esc)
    const by = unico ? 64 : 48 * esc
    ctx.fillStyle = 'rgba(30,14,5,.8)'
    ctx.fillRect(bx, by - 4 * esc, bw, 8 * esc)
    ctx.fillStyle = '#fff'
    ctx.fillRect(bx + bw - 6 * esc, by - 18 * esc, 8 * esc, 36 * esc)
    const lista = [...this.corredores].sort((a, b) => (a === h ? 1 : b === h ? -1 : a.esHumano - b.esHumano))
    for (const c of lista) {
      const f = clamp((c.x - this.xSalida) / (this.xMeta - this.xSalida), 0, 1)
      const px = bx + f * bw
      const yo = c === h ? 1.3 : 1
      const iw = 44 * esc * yo
      const ih = 42 * esc * yo
      if (c.esHumano) {
        ctx.fillStyle = c.humano.color
        ctx.beginPath()
        ctx.arc(px, by, 8 * esc * yo, 0, 7)
        ctx.fill()
      }
      const im = c.anims.marcha.frames[0]
      ctx.drawImage(im, 40, 60, 180, 172, px - iw / 2, by - ih + 8 * esc, iw, ih)
    }

    // tiempo (vista única)
    if (unico) this._texto(ctx, formatoTiempo(h.termino ? h.tiempoFinal : this.tiempo), v.w - 30, 18, 34, '#fff', 'right')

    // casilla de ítem + turbo
    const sx = 20 * esc
    const sy = v.h - 128 * esc
    const sz = 108 * esc
    ctx.fillStyle = 'rgba(40,18,6,.78)'
    ctx.strokeStyle = '#ffd23f'
    ctx.lineWidth = 4 * esc
    redondeado(ctx, sx, sy, sz, sz, 14 * esc)
    ctx.fill()
    ctx.stroke()
    if (h.item >= 0) ctx.drawImage(this.comunes.trampas[h.item], sx + 6 * esc, sy + 6 * esc, sz - 12 * esc, sz - 12 * esc)
    const tx = sx + sz + 14 * esc
    const tw = 200 * esc
    const th = 20 * esc
    ctx.fillStyle = 'rgba(30,14,5,.8)'
    ctx.fillRect(tx, sy + 4 * esc, tw, th)
    ctx.fillStyle = h.usandoTurbo ? '#ffe45c' : '#ff8c1a'
    ctx.fillRect(tx + 3 * esc, sy + 7 * esc, (tw - 6 * esc) * h.turbo, th - 6 * esc)
    ctx.strokeStyle = '#ffd23f'
    ctx.lineWidth = 2
    ctx.strokeRect(tx, sy + 4 * esc, tw, th)
    this._texto(ctx, 'TURBO', tx + tw + 8 * esc, sy + 4 * esc, 16 * esc, '#fff')

    // textos centrales
    const centro = h.termino && this.estado !== 'cuenta' ? `¡Llegaste ${this.llegadas.indexOf(h) + 1}º!` : this.textoCentro
    if (centro) {
      const tam = (centro.length > 4 ? 84 : 130) * (unico ? 1 : Math.max(0.5, v.h / 720 + 0.1))
      this._texto(ctx, centro, v.w / 2, v.h * 0.42, tam, '#ffd23f', 'center', 'middle', 0.12)
    }
    ctx.restore()
  }

  _dibujarTablero(ctx, v) {
    ctx.save()
    ctx.translate(v.x, v.y)
    ctx.fillStyle = '#2a1408'
    ctx.fillRect(0, 0, v.w, v.h)
    this._texto(ctx, 'Posiciones', v.w / 2, 18, 34, '#ffd23f', 'center')
    const lista = this.clasificacion()
    lista.forEach((c, i) => {
      const y = 70 + i * 46
      ctx.fillStyle = c.esHumano ? c.humano.color + '55' : 'rgba(80,40,15,.6)'
      ctx.fillRect(60, y, v.w - 120, 40)
      this._texto(ctx, `${i + 1}º`, 76, y + 4, 28, '#fff')
      ctx.drawImage(c.anims.marcha.frames[0], 40, 60, 180, 172, 150, y - 2, 46, 44)
      if (c.esHumano) this._texto(ctx, 'J' + c.humano.numero, 214, y + 6, 24, c.humano.color)
    })
    ctx.restore()
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
