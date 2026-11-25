import { useCallback, useEffect, useRef, useState } from 'react'
import { COLOR_JUGADOR, PISTAS, VEHICULOS, iconoVehiculo, imgTrampa, miniaturaPista } from '../juego/datos.js'
import { claveCelular, conectar } from '../red.js'

const BOTONES0 = { acelerar: false, frenar: false, izquierda: false, derecha: false, giro: 0, saltar: false, turbo: false, lanzar: false, soltar: false }

function vibrar(p) {
  try {
    navigator.vibrate?.(p)
  } catch {
    /* sin vibración */
  }
}

function pantallaCompleta() {
  const el = document.documentElement
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
      .catch(() => {})
  }
}

export default function Control() {
  const params = new URLSearchParams(window.location.search)
  const [codigo, setCodigo] = useState((params.get('sala') || '').toUpperCase())
  const [unido, setUnido] = useState(null) // { numero }
  const [error, setError] = useState('')
  const [comun, setComun] = useState({ fase: 'lobby', jugadores: [] })
  const [propio, setPropio] = useState({})
  const socketRef = useRef(null)
  const codigoRef = useRef(codigo)

  const unirse = useCallback((cod) => {
    const s = conectar()
    socketRef.current = s
    codigoRef.current = cod
    s.emit('unirse', { codigo: cod, clave: claveCelular() }, (r) => {
      if (r?.ok) {
        setUnido({ numero: r.numero })
        setError('')
        const u = new URL(window.location.href)
        u.searchParams.set('sala', cod)
        window.history.replaceState(null, '', u)
      } else {
        setUnido(null)
        setError(r?.error || 'No se pudo entrar')
      }
    })
  }, [])

  useEffect(() => {
    const s = conectar()
    socketRef.current = s
    const estado = (d) => {
      if ('fase' in d) setComun(d)
      else {
        if (d.vibrar) vibrar(d.vibrar)
        setPropio((p) => ({ ...p, ...d }))
      }
    }
    const cerrada = () => {
      setUnido(null)
      setError('La pantalla cerró la sala')
    }
    const reconectar = () => {
      if (codigoRef.current && unidoRef.current) unirse(codigoRef.current)
    }
    s.on('estado', estado)
    s.on('sala-cerrada', cerrada)
    s.on('connect', reconectar)
    if (codigo) unirse(codigo)
    return () => {
      s.off('estado', estado)
      s.off('sala-cerrada', cerrada)
      s.off('connect', reconectar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const unidoRef = useRef(unido)
  unidoRef.current = unido

  const enviar = (tipo, valor) => socketRef.current?.emit('mensaje', { tipo, valor })

  // ------------------------------------------------ sin sala
  if (!unido) {
    return (
      <div className="ctl">
        <div className="ctl-centro">
          <div className="titulo" style={{ fontSize: 30 }}>Control de carrera</div>
          <div>Escribe el código que aparece en la pantalla</div>
          <input
            value={codigo}
            maxLength={4}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
          />
          {error && <div className="error">{error}</div>}
          <button className="boton foco" disabled={codigo.length !== 4} onClick={() => unirse(codigo)}>
            Entrar
          </button>
        </div>
      </div>
    )
  }

  const numero = unido.numero
  const color = COLOR_JUGADOR[numero - 1]
  const soyAnfitrion = comun.anfitrion === numero
  const yo = comun.jugadores?.find((j) => j.numero === numero) || {}
  const enCarrera = comun.fase === 'carrera' && comun.enCarrera?.includes(numero)

  const cabecera = (
    <div className="ctl-cab">
      <span className="chip" style={{ background: color }}>J{numero}</span>
      {soyAnfitrion && <span>👑 Tú arrancas la carrera</span>}
    </div>
  )

  // ------------------------------------------------ en carrera
  if (enCarrera) {
    if (propio.resultados) {
      return (
        <div className="ctl">
          {cabecera}
          <div className="ctl-centro">
            <div className="titulo" style={{ fontSize: 34 }}>¡Llegaste {propio.posicion}º!</div>
            {soyAnfitrion ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="boton foco" onClick={() => enviar('repetir')}>Repetir</button>
                <button className="boton" onClick={() => enviar('otra-pista')}>Otra pista</button>
                <button className="boton" onClick={() => enviar('menu')}>Cambiar vehículos</button>
              </div>
            ) : (
              <div>Esperando a que J{comun.anfitrion} elija qué sigue…</div>
            )}
          </div>
        </div>
      )
    }
    return <Mando socket={socketRef.current} propio={propio} color={color} numero={numero} anfitrion={soyAnfitrion} enviar={enviar} />
  }

  if (comun.fase === 'carrera') {
    return (
      <div className="ctl">
        {cabecera}
        <div className="ctl-centro">Hay una carrera en curso. Entras en la siguiente.</div>
      </div>
    )
  }

  // ------------------------------------------------ elegir pista
  if (comun.fase === 'pista') {
    return (
      <div className="ctl">
        {cabecera}
        <div className="ctl-centro">
          {soyAnfitrion ? (
            <>
              <h1>Elige la pista</h1>
              <div className="ctl-pistas">
                {PISTAS.map((p, i) => (
                  <button key={p.carpeta} onClick={() => (pantallaCompleta(), enviar('pista', i))}>
                    <img src={miniaturaPista(i)} alt="" />
                    {p.nombre}
                  </button>
                ))}
              </div>
              <button className="boton" onClick={() => enviar('volver')}>← Volver</button>
            </>
          ) : (
            <h1>J{comun.anfitrion} está eligiendo la pista…</h1>
          )}
        </div>
      </div>
    )
  }

  // ------------------------------------------------ lobby: elegir vehículo
  const ocupados = Object.fromEntries((comun.jugadores || []).filter((j) => j.numero !== numero && j.vehiculo != null).map((j) => [j.vehiculo, j.numero]))
  const todosListos = (comun.jugadores || []).length > 0 && comun.jugadores.every((j) => j.listo)
  return (
    <div className="ctl">
      {cabecera}
      <div className="ctl-centro" style={{ justifyContent: 'flex-start', overflow: 'auto' }}>
        <div className="rejilla">
          {VEHICULOS.map((_, i) => (
            <button
              key={i}
              className={yo.vehiculo === i ? 'sel' : ''}
              disabled={ocupados[i] != null || yo.listo}
              onClick={() => enviar('vehiculo', i)}
            >
              {ocupados[i] != null && <span className="ocupado" style={{ color: COLOR_JUGADOR[ocupados[i] - 1] }}>J{ocupados[i]}</span>}
              <img src={iconoVehiculo(i)} alt="" />
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            className={'boton' + (yo.listo ? '' : ' foco')}
            disabled={yo.vehiculo == null}
            onClick={() => {
              pantallaCompleta()
              enviar('listo', !yo.listo)
            }}
          >
            {yo.vehiculo == null ? 'Elige un vehículo' : yo.listo ? 'Cambiar vehículo' : '¡Listo!'}
          </button>
          {soyAnfitrion && todosListos && (
            <button className="boton foco" onClick={() => (pantallaCompleta(), enviar('empezar'))}>
              Elegir pista ▶
            </button>
          )}
        </div>
        {yo.listo && !soyAnfitrion && <div>Esperando a que J{comun.anfitrion} arranque…</div>}
        {yo.listo && soyAnfitrion && !todosListos && <div>Esperando a que todos estén listos…</div>}
      </div>
    </div>
  )
}

// ======================================================================= mando
function Mando({ socket, propio, color, numero, anfitrion, enviar }) {
  const botones = useRef({ ...BOTONES0 })
  const [vista, setVista] = useState({ ...BOTONES0 })
  const [autoAcel, setAutoAcel] = useState(() => localStorage.getItem('carreras-auto') !== 'no')
  const [inclinar, setInclinar] = useState(false)
  const autoRef = useRef(autoAcel)
  autoRef.current = autoAcel

  const emitir = useCallback(() => {
    const b = { ...botones.current }
    if (autoRef.current) b.acelerar = !b.frenar
    socket?.emit('control', b)
  }, [socket])

  useEffect(() => {
    const id = setInterval(emitir, 200)
    const soltarTodo = () => {
      botones.current = { ...BOTONES0 }
      setVista({ ...BOTONES0 })
      emitir()
    }
    document.addEventListener('visibilitychange', soltarTodo)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', soltarTodo)
      soltarTodo()
    }
  }, [emitir])

  // girar inclinando el celular (como un timón)
  useEffect(() => {
    if (!inclinar) {
      botones.current = { ...botones.current, giro: 0 }
      return
    }
    let ultimo = 0
    const mover = (e) => {
      const ang = screen.orientation?.angle ?? window.orientation ?? 90
      const b = e.beta ?? 0
      let g = (ang === 270 || ang === -90 ? -b : b) / 28
      g = Math.max(-1, Math.min(1, g))
      if (Math.abs(g) < 0.1) g = 0
      botones.current = { ...botones.current, giro: Math.round(g * 100) / 100 }
      const ahora = performance.now()
      if (ahora - ultimo > 60) {
        ultimo = ahora
        emitir()
      }
    }
    window.addEventListener('deviceorientation', mover)
    return () => window.removeEventListener('deviceorientation', mover)
  }, [inclinar, emitir])

  const alternarInclinar = async () => {
    if (!inclinar && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      try {
        const r = await DeviceOrientationEvent.requestPermission()
        if (r !== 'granted') return
      } catch {
        return
      }
    }
    setInclinar((v) => !v)
  }

  const poner = (nombre, v) => {
    if (botones.current[nombre] === v) return
    botones.current = { ...botones.current, [nombre]: v }
    setVista(botones.current)
    emitir()
    if (v) vibrar(12)
  }

  const t = (nombre, etiqueta, icono, clase = '') => (
    <Tecla nombre={nombre} on={vista[nombre]} poner={poner} clase={clase}>
      <span className="ic">{icono}</span>
      {etiqueta}
    </Tecla>
  )

  return (
    <div className="ctl mando-envoltura">
      <div className="girar">
        <span className="ic">📱↻</span>
        Gira el celular de lado para manejar
        <button className="boton foco" onClick={pantallaCompleta}>Pantalla completa</button>
      </div>
      <div className="mando">
        <div className="lado izq">
          {inclinar ? (
            <div className="tecla" style={{ gridColumn: '1 / 3', fontSize: 16 }} onClick={alternarInclinar}>
              <span className="ic">🎡</span>Inclina el celular para girar
              <small style={{ opacity: 0.8 }}>(toca para usar botones)</small>
            </div>
          ) : (
            <>
              {t('izquierda', 'IZQUIERDA', '◀')}
              {t('derecha', 'DERECHA', '▶')}
            </>
          )}
        </div>
        <div className="medio">
          <span className="chip" style={{ background: color, color: '#1b0c04', fontWeight: 900, borderRadius: 10, padding: '2px 12px' }}>
            J{numero}
          </span>
          <div className="pos">{propio.posicion ? `${propio.posicion}º` : '–'}</div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Vuelta {propio.vuelta || 1}/3</div>
          <div className="item">{propio.item >= 0 && <img src={imgTrampa(propio.item, true)} alt="" />}</div>
          <div className="turbo">
            <div style={{ width: `${Math.round((propio.turbo ?? 1) * 100)}%` }} />
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="mini" onClick={alternarInclinar}>{inclinar ? '🔘 Botones' : '🎡 Inclinar'}</button>
            <button
              className="mini"
              onClick={() => {
                localStorage.setItem('carreras-auto', autoAcel ? 'no' : 'si')
                setAutoAcel(!autoAcel)
              }}
            >
              {autoAcel ? '⚡ Auto' : '⚡ Manual'}
            </button>
            <button className="mini" onClick={() => enviar('pausa')}>⏸</button>
          </div>
        </div>
        <div className={'lado der' + (autoAcel ? '' : ' manual')}>
          {t('soltar', 'SOLTAR ATRÁS', '⤺')}
          {t('lanzar', 'LANZAR', '⤻')}
          {t('turbo', 'TURBO', '🔥')}
          {t('frenar', 'FRENAR', '■', 'fren')}
          {t('saltar', 'SALTAR', '⤒')}
          {!autoAcel && t('acelerar', 'ACELERAR', '▲', 'acel')}
        </div>
      </div>
      {propio.pausado && (
        <div className="ctl-centro" style={{ position: 'fixed', inset: 0, background: 'rgba(20,9,3,.92)', zIndex: 4 }}>
          <div className="titulo" style={{ fontSize: 34 }}>PAUSA</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="boton foco" onClick={() => enviar('pausa')}>Continuar</button>
            {anfitrion && <button className="boton" onClick={() => enviar('reiniciar')}>Reiniciar</button>}
            {anfitrion && <button className="boton" onClick={() => enviar('menu')}>Menú</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function Tecla({ nombre, on, poner, clase, children }) {
  const activos = useRef(new Set())
  const abajo = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    activos.current.add(e.pointerId)
    poner(nombre, true)
  }
  const arriba = (e) => {
    activos.current.delete(e.pointerId)
    if (activos.current.size === 0) poner(nombre, false)
  }
  return (
    <div
      className={`tecla ${clase} ${on ? 'on' : ''}`}
      onPointerDown={abajo}
      onPointerUp={arriba}
      onPointerCancel={arriba}
      onLostPointerCapture={arriba}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}
