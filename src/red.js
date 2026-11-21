// Conexión Socket.io (mismo origen; en desarrollo Vite la redirige al servidor).
import { io } from 'socket.io-client'

let socket = null
export function conectar() {
  if (!socket) socket = io({ transports: ['websocket', 'polling'] })
  return socket
}

export function claveCelular() {
  let c = localStorage.getItem('carreras-clave')
  if (!c) {
    c = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('carreras-clave', c)
  }
  return c
}

export async function urlParaCelulares(codigo) {
  const h = window.location.hostname
  let origen = window.location.origin
  if (h === 'localhost' || h === '127.0.0.1') {
    try {
      const info = await fetch('/api/info').then((r) => r.json())
      if (info.publico) origen = info.publico
      else origen = `${window.location.protocol}//${info.ip}:${window.location.port || info.puerto}`
    } catch {
      /* se queda con el origen actual */
    }
  }
  return `${origen}/control?sala=${codigo}`
}
