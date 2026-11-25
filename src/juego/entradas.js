// Entradas: teclado, controles (Gamepad API: Xbox, PlayStation, genéricos) y celulares.
import { useEffect, useRef } from 'react'

export const VACIO = { acelerar: false, frenar: false, izquierda: false, derecha: false, giro: 0, saltar: false, turbo: false, lanzar: false, soltar: false, pausa: false }

// ---------------------------------------------------------------- teclado
const teclas = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    teclas.add(e.code)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
  })
  // al soltar, la tecla sigue "pulsada" unos milisegundos para que un toque rápido no se pierda
  const soltadas = new Map()
  window.addEventListener('keydown', (e) => clearTimeout(soltadas.get(e.code)), true)
  window.addEventListener('keyup', (e) => {
    soltadas.set(e.code, setTimeout(() => teclas.delete(e.code), 45))
  })
  window.addEventListener('blur', () => teclas.clear())
}
const t = (...c) => c.some((k) => teclas.has(k))

export function estadoTeclado() {
  return {
    acelerar: t('ArrowUp', 'KeyW'),
    frenar: t('ArrowDown', 'KeyS'),
    izquierda: t('ArrowLeft', 'KeyA'),
    derecha: t('ArrowRight', 'KeyD'),
    giro: 0,
    saltar: t('Space'),
    turbo: t('ShiftLeft', 'ShiftRight', 'KeyL'),
    lanzar: t('KeyZ', 'KeyJ'),
    soltar: t('KeyC', 'KeyK', 'KeyX'),
    pausa: t('Escape', 'KeyP'),
  }
}

// ---------------------------------------------------------------- controles
export function mandos() {
  const lista = navigator.getGamepads ? navigator.getGamepads() : []
  return Array.from(lista || []).filter(Boolean)
}

function mandoPorIndice(i) {
  const lista = navigator.getGamepads ? navigator.getGamepads() : []
  return lista?.[i] || null
}

const bt = (g, i) => !!g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.4)

// Distribución "standard" (Xbox): A0 B1 X2 Y3 LB4 RB5 LT6 RT7 Back8 Start9 ... Cruceta 12-15
export function estadoMando(i) {
  const g = mandoPorIndice(i)
  if (!g) return { ...VACIO }
  const ax = g.axes[0] || 0
  return {
    acelerar: bt(g, 0) || bt(g, 12),
    frenar: bt(g, 1) || bt(g, 13),
    izquierda: bt(g, 14),
    derecha: bt(g, 15),
    giro: Math.abs(ax) > 0.15 ? ax : 0,
    saltar: bt(g, 4) || bt(g, 6),
    turbo: bt(g, 5) || bt(g, 7),
    lanzar: bt(g, 2),
    soltar: bt(g, 3),
    pausa: bt(g, 9) || bt(g, 8),
  }
}

// ---------------------------------------------------------------- celulares
export const celulares = new Map() // clave -> estado de botones

export function estadoCelular(clave) {
  return { ...VACIO, ...(celulares.get(clave) || {}) }
}

// ---------------------------------------------------------------- lectura unificada
export function leer(fuente) {
  if (!fuente) return { ...VACIO }
  if (fuente.tipo === 'teclado') return estadoTeclado()
  if (fuente.tipo === 'mando') return estadoMando(fuente.indice)
  if (fuente.tipo === 'celular') return estadoCelular(fuente.clave)
  return { ...VACIO }
}

// Lector con detección de "recién pulsado"
export class Lector {
  constructor(fuente) {
    this.fuente = fuente
    this.antes = { ...VACIO }
    this.estado = { ...VACIO }
    this.pulso = { ...VACIO }
  }
  actualizar() {
    const e = leer(this.fuente)
    for (const k in VACIO) this.pulso[k] = !!e[k] && !this.antes[k]
    this.antes = e
    this.estado = e
    return this
  }
}

export const idFuente = (f) => (f.tipo === 'mando' ? 'mando' + f.indice : f.tipo === 'celular' ? 'cel' + f.clave : 'teclado')

// ---------------------------------------------------------------- navegación de menús
// Llama a cb(evento, fuente) con evento: izq | der | arr | aba | ok | atras | pausa
export function useNavegacion(cb, activo = true) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    if (!activo) return
    const tecla = (e) => {
      if (e.repeat) return
      const m = {
        ArrowLeft: 'izq', KeyA: 'izq', ArrowRight: 'der', KeyD: 'der', ArrowUp: 'arr', KeyW: 'arr',
        ArrowDown: 'aba', KeyS: 'aba', Enter: 'ok', Space: 'ok', Escape: 'atras', Backspace: 'atras',
      }[e.code]
      if (m) {
        e.preventDefault()
        ref.current(m, { tipo: 'teclado' })
      }
    }
    window.addEventListener('keydown', tecla)
    const antes = new Map()
    let raf
    const sondeo = () => {
      for (const g of mandos()) {
        const ax = g.axes[0] || 0
        const ay = g.axes[1] || 0
        const ahora = {
          izq: bt(g, 14) || ax < -0.6, der: bt(g, 15) || ax > 0.6,
          arr: bt(g, 12) || ay < -0.6, aba: bt(g, 13) || ay > 0.6,
          ok: bt(g, 0), atras: bt(g, 1), pausa: bt(g, 9),
        }
        const prev = antes.get(g.index) || {}
        for (const k in ahora) if (ahora[k] && !prev[k]) ref.current(k, { tipo: 'mando', indice: g.index })
        antes.set(g.index, ahora)
      }
      raf = requestAnimationFrame(sondeo)
    }
    // esperar a que se suelten los botones que estaban pulsados al montar
    for (const g of mandos()) {
      antes.set(g.index, { izq: true, der: true, arr: true, aba: true, ok: bt(g, 0), atras: bt(g, 1), pausa: bt(g, 9) })
    }
    raf = requestAnimationFrame(sondeo)
    return () => {
      window.removeEventListener('keydown', tecla)
      cancelAnimationFrame(raf)
    }
  }, [activo])
}
