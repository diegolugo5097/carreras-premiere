// Carga de imágenes, animaciones de vehículos, pistas y sonidos.
import { ITEM_CARPETA, ITEM_REACCION, PISTAS, base, rutaVehiculo, imgTrampa, imgCaja } from './datos.js'

const cacheImg = new Map()

export function imagen(src) {
  if (cacheImg.has(src)) return cacheImg.get(src)
  const p = new Promise((ok) => {
    const im = new Image()
    im.decoding = 'async'
    im.onload = () => ok(im)
    im.onerror = () => {
      console.warn('No cargó', src)
      ok(im)
    }
    im.src = src
  })
  cacheImg.set(src, p)
  return p
}

const n2 = (n) => String(n).padStart(2, '0')
const serie = (carpeta, n) => Array.from({ length: n }, (_, i) => `${carpeta}${n2(i + 1)}.webp`)

// definición de animaciones: nombre -> { rutas, fps, bucle }
function definicion(i) {
  const b = rutaVehiculo(i)
  const d = {
    marcha: { rutas: serie(b + 'marcha/', 8), fps: 12, bucle: true },
    caballito: { rutas: serie(b + 'caballito/', 8), fps: 12, bucle: true },
    salto: { rutas: serie(b + 'salto/', 8), fps: 9, bucle: false },
    frenada: { rutas: serie(b + 'frenada/', 8), fps: 14, bucle: false },
    recoger: { rutas: serie(b + 'interaccion/recoger_caja/', 6), fps: 12, bucle: false },
  }
  ITEM_CARPETA.forEach((c, k) => {
    d['sostener_' + k] = { rutas: [b + `interaccion/${c}/sostener.webp`], fps: 1, bucle: true }
    d['lanzar_' + k] = { rutas: serie(b + `interaccion/${c}/lanzar_delante/`, 8), fps: 16, bucle: false }
    d['soltar_' + k] = { rutas: serie(b + `interaccion/${c}/soltar_detras/`, 8), fps: 16, bucle: false }
    d['reaccion_' + k] = { rutas: serie(b + `reaccion/${ITEM_REACCION[k]}/`, 12), fps: 12, bucle: false }
  })
  return d
}

const cacheVeh = new Map()

export function cargarVehiculo(i, alAvanzar) {
  if (cacheVeh.has(i)) return cacheVeh.get(i)
  const def = definicion(i)
  const p = Promise.all(
    Object.entries(def).map(async ([nombre, a]) => {
      const frames = await Promise.all(a.rutas.map((r) => imagen(r).then((im) => (alAvanzar?.(), im))))
      return [nombre, { frames, fps: a.fps, bucle: a.bucle }]
    }),
  ).then((pares) => Object.fromEntries(pares))
  cacheVeh.set(i, p)
  return p
}

export const FRAMES_POR_VEHICULO = 125

export async function cargarPista(i, alAvanzar) {
  const carpeta = base(`pistas/${PISTAS[i].carpeta}/`)
  const suelo = await fetch(carpeta + 'suelo.json').then((r) => r.json())
  const tramos = await Promise.all(
    Array.from({ length: suelo.tramos }, (_, k) => imagen(`${carpeta}Tramo_${n2(k + 1)}.webp`).then((im) => (alAvanzar?.(), im))),
  )
  return { ...suelo, imgTramos: tramos }
}

export async function cargarComunes() {
  const trampas = await Promise.all([0, 1, 2].map((k) => imagen(imgTrampa(k, true))))
  const vuelo = await Promise.all([0, 1, 2].map((k) => imagen(imgTrampa(k, false))))
  const caja = await imagen(imgCaja(false))
  const cajaAbierta = await imagen(imgCaja(true))
  return { trampas, vuelo, caja, cajaAbierta }
}

// ---------------------------------------------------------------- sonido
let ctxAudio = null
const buffers = new Map()
let musica = null

export function audio() {
  if (!ctxAudio) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctxAudio = new AC()
  }
  if (ctxAudio.state === 'suspended') ctxAudio.resume()
  return ctxAudio
}

async function buffer(nombre) {
  const ctx = audio()
  if (!ctx) return null
  if (!buffers.has(nombre)) {
    buffers.set(
      nombre,
      fetch(base(`sonidos/${nombre}.mp3`))
        .then((r) => r.arrayBuffer())
        .then((ab) => ctx.decodeAudioData(ab))
        .catch(() => null),
    )
  }
  return buffers.get(nombre)
}

export async function sonido(nombre, volumen = 0.6) {
  const ctx = audio()
  const b = await buffer(nombre)
  if (!ctx || !b) return
  const src = ctx.createBufferSource()
  const g = ctx.createGain()
  g.gain.value = volumen
  src.buffer = b
  src.connect(g).connect(ctx.destination)
  src.start()
}

export async function musicaEmpezar(volumen = 0.25) {
  musicaParar()
  const ctx = audio()
  const b = await buffer('musica')
  if (!ctx || !b) return
  const src = ctx.createBufferSource()
  const g = ctx.createGain()
  g.gain.value = volumen
  src.buffer = b
  src.loop = true
  src.connect(g).connect(ctx.destination)
  src.start()
  musica = src
}

export function musicaParar() {
  try {
    musica?.stop()
  } catch {
    /* ya parada */
  }
  musica = null
}

;['beep', 'ya', 'caja', 'lanzar', 'golpe', 'salto', 'turbo', 'meta', 'musica'].forEach((n) => {
  // precarga perezosa al primer gesto
  window.addEventListener('pointerdown', () => buffer(n), { once: true })
  window.addEventListener('keydown', () => buffer(n), { once: true })
})
