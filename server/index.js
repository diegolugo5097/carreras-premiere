// Servidor: sirve el juego compilado y conecta la pantalla con los celulares (Socket.io).
import express from 'express'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')
const DEV = process.argv.includes('--dev')
const PUERTO = Number(process.env.PORT) || (DEV ? 3001 : 3000)
const MAX_CELULARES = 4

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

function ipLocal() {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address
    }
  }
  return 'localhost'
}

app.get('/api/info', (_req, res) => {
  res.json({ ip: ipLocal(), puerto: PUERTO, publico: process.env.URL_PUBLICA || null })
})

if (!DEV && fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

// ---------------------------------------------------------------- salas
// sala = { codigo, pantalla: socketId, jugadores: Map<clave, {clave, socket, numero}> }
const salas = new Map()

function nuevoCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let c
  do {
    c = Array.from({ length: 4 }, () => letras[Math.floor(Math.random() * letras.length)]).join('')
  } while (salas.has(c))
  return c
}

function numeroLibre(sala) {
  const usados = new Set([...sala.jugadores.values()].map((j) => j.numero))
  for (let n = 1; n <= MAX_CELULARES; n++) if (!usados.has(n)) return n
  return null
}

io.on('connection', (socket) => {
  // ---- pantalla
  socket.on('crear-sala', (_d, ack) => {
    const codigo = nuevoCodigo()
    salas.set(codigo, { codigo, pantalla: socket.id, jugadores: new Map() })
    socket.data.salaPantalla = codigo
    socket.join('p:' + codigo)
    ack?.({ codigo })
  })

  socket.on('a-celular', ({ clave, datos }) => {
    const sala = salas.get(socket.data.salaPantalla)
    const j = sala?.jugadores.get(clave)
    if (j?.socket) io.to(j.socket).emit('estado', datos)
  })

  socket.on('a-todos', (datos) => {
    const codigo = socket.data.salaPantalla
    if (codigo) io.to('c:' + codigo).emit('estado', datos)
  })

  socket.on('expulsar', ({ clave }) => {
    const sala = salas.get(socket.data.salaPantalla)
    const j = sala?.jugadores.get(clave)
    if (!j) return
    if (j.socket) io.to(j.socket).emit('sala-cerrada')
    sala.jugadores.delete(clave)
  })

  // ---- celular
  socket.on('unirse', ({ codigo, clave }, ack) => {
    codigo = String(codigo || '').toUpperCase().trim()
    const sala = salas.get(codigo)
    if (!sala) return ack?.({ ok: false, error: 'No existe esa sala' })
    let j = sala.jugadores.get(clave)
    if (!j) {
      const numero = numeroLibre(sala)
      if (!numero) return ack?.({ ok: false, error: 'La sala está llena' })
      j = { clave, numero, socket: null }
      sala.jugadores.set(clave, j)
    }
    j.socket = socket.id
    socket.data.sala = codigo
    socket.data.clave = clave
    socket.join('c:' + codigo)
    io.to(sala.pantalla).emit('celular-entro', { clave, numero: j.numero })
    ack?.({ ok: true, numero: j.numero })
  })

  socket.on('control', (botones) => {
    const sala = salas.get(socket.data.sala)
    if (sala) io.to(sala.pantalla).volatile.emit('control', { clave: socket.data.clave, botones })
  })

  socket.on('mensaje', (m) => {
    const sala = salas.get(socket.data.sala)
    if (sala) io.to(sala.pantalla).emit('mensaje', { clave: socket.data.clave, ...m })
  })

  socket.on('disconnect', () => {
    // pantalla cerrada -> se acaba la sala
    const cp = socket.data.salaPantalla
    if (cp && salas.get(cp)?.pantalla === socket.id) {
      io.to('c:' + cp).emit('sala-cerrada')
      salas.delete(cp)
    }
    const c = socket.data.sala
    const sala = salas.get(c)
    if (sala) {
      const j = sala.jugadores.get(socket.data.clave)
      if (j && j.socket === socket.id) {
        j.socket = null
        io.to(sala.pantalla).emit('celular-salio', { clave: j.clave })
      }
    }
  })
})

server.listen(PUERTO, '0.0.0.0', () => {
  console.log(`\n  Juego listo en  http://localhost:${PUERTO}`)
  console.log(`  En la red local: http://${ipLocal()}:${PUERTO}\n`)
})
