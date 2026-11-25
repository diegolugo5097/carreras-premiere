import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { COLOR_JUGADOR, MAX_JUGADORES } from '../juego/datos.js'
import { celulares, useNavegacion } from '../juego/entradas.js'
import { audio } from '../juego/recursos.js'
import { conectar, urlParaCelulares } from '../red.js'
import LobbyLocal from './LobbyLocal.jsx'
import LobbyCelular from './LobbyCelular.jsx'
import ElegirPista from './ElegirPista.jsx'
import JuegoCanvas from './Juego3D.jsx'

export default function Pantalla() {
  const [fase, setFase] = useState('inicio') // inicio | local | celular | pista | carrera
  const [modo, setModo] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [pista, setPista] = useState(0)
  const [partida, setPartida] = useState(0) // cambia para reiniciar la carrera

  // ---- estado de la sala de celulares
  const [sala, setSala] = useState(null) // { codigo, url, qr }
  const [cels, setCels] = useState({}) // clave -> { numero, vehiculo, listo, conectado }
  const [sinServidor, setSinServidor] = useState(false)
  const [comando, setComando] = useState(null) // último mensaje de un celular (para hijos)
  const socketRef = useRef(null)
  const estadoRef = useRef({})
  estadoRef.current = { fase, cels, jugadores }

  const anfitrion = useMemo(() => {
    const nums = Object.values(cels).filter((c) => c.conectado).map((c) => c.numero)
    return nums.length ? Math.min(...nums) : null
  }, [cels])

  // crear sala al entrar al modo celular
  useEffect(() => {
    if (modo !== 'celular') return
    const s = conectar()
    socketRef.current = s
    const crear = () =>
      (setSinServidor(false), s).emit('crear-sala', {}, async ({ codigo }) => {
        const url = await urlParaCelulares(codigo)
        const qr = await QRCode.toDataURL(url, { margin: 1, width: 512, color: { dark: '#2a1408', light: '#ffffff' } })
        setSala({ codigo, url, qr })
        setCels({})
      })
    if (s.connected) crear()
    s.on('connect', crear)
    const fallo = () => setSinServidor(true)
    s.on('connect_error', fallo)
    const entro = ({ clave, numero }) =>
      setCels((c) => ({ ...c, [clave]: { vehiculo: null, listo: false, ...c[clave], numero, conectado: true } }))
    const salio = ({ clave }) => {
      celulares.delete(clave)
      setCels((c) => (c[clave] ? { ...c, [clave]: { ...c[clave], conectado: false } } : c))
    }
    const control = ({ clave, botones }) => celulares.set(clave, botones)
    const mensaje = (m) => setComando({ ...m, n: Math.random() })
    s.on('celular-entro', entro)
    s.on('celular-salio', salio)
    s.on('control', control)
    s.on('mensaje', mensaje)
    return () => {
      s.off('connect', crear)
      s.off('connect_error', fallo)
      s.off('celular-entro', entro)
      s.off('celular-salio', salio)
      s.off('control', control)
      s.off('mensaje', mensaje)
    }
  }, [modo])

  // mensajes de celulares que maneja la pantalla directamente (lobby)
  useEffect(() => {
    if (!comando || modo !== 'celular') return
    const { clave, tipo, valor } = comando
    const yo = cels[clave]
    if (!yo) return
    if (fase === 'celular') {
      if (tipo === 'vehiculo') {
        const ocupado = Object.entries(cels).some(([k, c]) => k !== clave && c.conectado && c.vehiculo === valor)
        if (!ocupado) setCels((c) => ({ ...c, [clave]: { ...c[clave], vehiculo: valor, listo: false } }))
      } else if (tipo === 'listo' && yo.vehiculo != null) {
        setCels((c) => ({ ...c, [clave]: { ...c[clave], listo: !!valor } }))
      } else if (tipo === 'empezar' && yo.numero === anfitrion) {
        irAPistaDesdeCelulares()
      }
    } else if (fase === 'pista' && tipo === 'pista' && yo.numero === anfitrion) {
      empezar(valor)
    } else if (fase === 'pista' && tipo === 'volver' && yo.numero === anfitrion) {
      setFase('celular')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comando])

  // estado común enviado a todos los celulares
  useEffect(() => {
    if (modo !== 'celular' || !socketRef.current) return
    const lista = Object.values(cels).filter((c) => c.conectado)
    let f = fase === 'celular' ? 'lobby' : fase === 'pista' ? 'pista' : fase === 'carrera' ? 'carrera' : 'lobby'
    socketRef.current.emit('a-todos', {
      fase: f,
      anfitrion,
      pista,
      jugadores: lista.map((c) => ({ numero: c.numero, vehiculo: c.vehiculo, listo: c.listo })),
      enCarrera: fase === 'carrera' ? jugadores.map((j) => j.numero) : [],
    })
  }, [cels, fase, anfitrion, modo, pista, jugadores])

  const irAPistaDesdeCelulares = useCallback(() => {
    const lista = Object.entries(estadoRef.current.cels)
      .filter(([, c]) => c.conectado && c.listo && c.vehiculo != null)
      .sort((a, b) => a[1].numero - b[1].numero)
    if (!lista.length) return
    setJugadores(
      lista.map(([clave, c]) => ({
        numero: c.numero,
        color: COLOR_JUGADOR[c.numero - 1],
        vehiculo: c.vehiculo,
        fuente: { tipo: 'celular', clave },
      })),
    )
    setFase('pista')
  }, [])

  const empezar = (p) => {
    setPista(p)
    setPartida((n) => n + 1)
    setFase('carrera')
  }

  const alInicio = () => {
    socketRef.current?.disconnect()
    socketRef.current = null
    window.location.reload()
  }

  // ---- inicio
  const [focoModo, setFocoModo] = useState(0)
  useNavegacion(
    (ev) => {
      if (ev === 'izq' || ev === 'der') setFocoModo((f) => 1 - f)
      if (ev === 'ok') elegirModo(focoModo === 0 ? 'local' : 'celular')
    },
    fase === 'inicio',
  )
  const elegirModo = (m) => {
    audio()
    setModo(m)
    setFase(m)
  }

  return (
    <div className="escenario">
      {fase === 'inicio' && (
        <div className="capa fondo-menu">
          <div className="titulo" style={{ fontSize: '9cqh' }}>¿Cómo quieren jugar?</div>
          <div className="modos">
            <button className={'tarjeta modo' + (focoModo === 0 ? ' foco' : '')} onMouseEnter={() => setFocoModo(0)} onClick={() => elegirModo('local')}>
              <div className="icono">🎮</div>
              <h2>En esta pantalla</h2>
              <p>Teclado y controles (Xbox, PlayStation o cualquiera). Hasta {MAX_JUGADORES} jugadores con pantalla dividida.</p>
            </button>
            <button className={'tarjeta modo' + (focoModo === 1 ? ' foco' : '')} onMouseEnter={() => setFocoModo(1)} onClick={() => elegirModo('celular')}>
              <div className="icono">📱</div>
              <h2>Celulares como control</h2>
              <p>Esta pantalla muestra la carrera y cada uno maneja desde su celular. Hasta {MAX_JUGADORES} jugadores.</p>
            </button>
          </div>
          <div className="ayuda" style={{ marginTop: '6cqh' }}>
            Usa el mouse, las flechas + Enter, o la cruceta + A del control
          </div>
          <PantallaCompleta />
        </div>
      )}

      {fase === 'local' && (
        <LobbyLocal
          alListo={(js) => {
            setJugadores(js)
            setFase('pista')
          }}
          alVolver={() => setFase('inicio')}
        />
      )}

      {fase === 'celular' && (
        <LobbyCelular sala={sala} sinServidor={sinServidor} cels={cels} anfitrion={anfitrion} alEmpezar={irAPistaDesdeCelulares} alVolver={alInicio} />
      )}

      {fase === 'pista' && (
        <ElegirPista
          inicial={pista}
          aviso={modo === 'celular' ? `J${anfitrion ?? 1} también puede elegir desde su celular` : null}
          alElegir={empezar}
          alVolver={() => setFase(modo === 'celular' ? 'celular' : 'local')}
        />
      )}

      {fase === 'carrera' && (
        <JuegoCanvas
          key={partida}
          pista={pista}
          jugadores={jugadores}
          socket={modo === 'celular' ? socketRef.current : null}
          comando={comando}
          anfitrion={anfitrion}
          alRepetir={() => setPartida((n) => n + 1)}
          alOtraPista={() => setFase('pista')}
          alMenu={() => (modo === 'celular' ? setFase('celular') : setFase('local'))}
        />
      )}
    </div>
  )
}

function PantallaCompleta() {
  return (
    <div className="esquina">
      <button
        className="boton"
        onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
      >
        ⛶ Pantalla completa
      </button>
    </div>
  )
}
