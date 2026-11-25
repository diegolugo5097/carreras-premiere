// Carga de imágenes, animaciones de vehículos, pistas y sonidos.
import { base } from './datos.js'

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
