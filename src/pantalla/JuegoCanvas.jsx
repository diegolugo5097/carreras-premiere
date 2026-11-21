import { useEffect, useRef, useState } from 'react'
import { Carrera, ANCHO, ALTO, elegirRivales } from '../juego/carrera.js'
import { TOTAL_CORREDORES, PISTAS, formatoTiempo, iconoVehiculo } from '../juego/datos.js'
import { Lector, useNavegacion } from '../juego/entradas.js'
import { FRAMES_POR_VEHICULO, cargarComunes, cargarPista, cargarVehiculo, musicaParar } from '../juego/recursos.js'

const PASO = 1 / 60

export default function JuegoCanvas({ pista, jugadores, socket, comando, anfitrion, alRepetir, alOtraPista, alMenu }) {
  const lienzo = useRef(null)
  const carreraRef = useRef(null)
  const [carga, setCarga] = useState(0)
  const [lista, setLista] = useState(false)
  const [pausado, setPausado] = useState(false)
  const pausadoRef = useRef(false)
  const ignorarPausa = useRef(0)
  const [resultados, setResultados] = useState(null)
  const [foco, setFoco] = useState(0)

  const pausar = (si) => {
    pausadoRef.current = si
    if (carreraRef.current) carreraRef.current.pausado = si
    setPausado(si)
    setFoco(0)
    if (!si) ignorarPausa.current = performance.now() + 350
  }

  // ---- carga y bucle
  useEffect(() => {
    let vivo = true
    let raf = 0
    const vehHumanos = jugadores.map((j) => j.vehiculo)
    const rivales = elegirRivales(vehHumanos, Math.max(0, TOTAL_CORREDORES - jugadores.length))
    const todos = [...new Set([...vehHumanos, ...rivales])]
    const total = todos.length * FRAMES_POR_VEHICULO + 40
    let hechos = 0
    const avance = () => {
      hechos++
      if (hechos % 10 === 0 && vivo) setCarga(Math.min(1, hechos / total))
    }

    ;(async () => {
      const [datosPista, comunes, ...anims] = await Promise.all([
        cargarPista(pista, avance),
        cargarComunes(),
        ...todos.map((v) => cargarVehiculo(v, avance)),
      ])
      if (!vivo) return
      const mapa = new Map(todos.map((v, i) => [v, anims[i]]))
      const carrera = new Carrera({
        pista: datosPista,
        comunes,
        anims: mapa,
        humanos: jugadores.map((j) => ({ ...j, lector: new Lector(j.fuente) })),
        rivales,
        alEvento: (tipo, datos) => {
          if (tipo === 'fin') {
            musicaParar()
            setResultados(datos.map((c) => ({ vehiculo: c.vehiculo, humano: c.humano, tiempo: carrera.tiempoEstimado(c), termino: c.termino })))
            setFoco(0)
          }
          if (tipo === 'golpe' && socket && datos.humano.fuente.tipo === 'celular') {
            socket.emit('a-celular', { clave: datos.humano.fuente.clave, datos: { vibrar: [120, 60, 160] } })
          }
          if (tipo === 'caja' && socket && datos.humano.fuente.tipo === 'celular') {
            socket.emit('a-celular', { clave: datos.humano.fuente.clave, datos: { vibrar: 40 } })
          }
        },
      })
      carreraRef.current = carrera
      setLista(true)

      // la pausa con teclado va por evento (ver abajo); aquí solo controles
      const lectoresPausa = jugadores.filter((j) => j.fuente.tipo === 'mando').map((j) => new Lector(j.fuente))
      const cv = lienzo.current
      const ctx = cv.getContext('2d')
      let k = 1
      const ajustar = () => {
        const r = cv.getBoundingClientRect()
        const nk = Math.max(1, Math.min(2, Math.round(((r.width * (window.devicePixelRatio || 1)) / ANCHO) * 4) / 4))
        if (nk !== k || cv.width !== ANCHO * nk) {
          k = nk
          cv.width = ANCHO * k
          cv.height = ALTO * k
        }
      }
      ajustar()
      let antes = performance.now()
      let acum = 0
      let tEnvio = 0
      const bucle = (ahora) => {
        if (!vivo) return
        const dt = Math.min(0.1, (ahora - antes) / 1000)
        antes = ahora
        // pausa desde cualquier jugador
        for (const l of lectoresPausa) {
          l.actualizar()
          if (l.pulso.pausa && !pausadoRef.current && ahora > ignorarPausa.current && carrera.estado !== 'terminada') pausar(true)
        }
        if (!pausadoRef.current) {
          acum += dt
          while (acum >= PASO) {
            carrera.actualizar(PASO)
            acum -= PASO
          }
        }
        ajustar()
        ctx.setTransform(k, 0, 0, k, 0, 0)
        ctx.imageSmoothingQuality = 'high'
        carrera.dibujar(ctx, pausadoRef.current ? 0 : dt)

        // estado para los celulares (5 veces por segundo)
        tEnvio += dt
        if (socket && tEnvio > 0.2) {
          tEnvio = 0
          for (const h of carrera.humanos) {
            if (h.humano.fuente.tipo !== 'celular') continue
            socket.emit('a-celular', {
              clave: h.humano.fuente.clave,
              datos: {
                posicion: carrera.posicionDe(h),
                total: carrera.corredores.length,
                item: h.item,
                turbo: Math.round(h.turbo * 100) / 100,
                termino: h.termino,
                pausado: pausadoRef.current,
                resultados: carrera.estado === 'terminada',
              },
            })
          }
        }
        raf = requestAnimationFrame(bucle)
      }
      raf = requestAnimationFrame(bucle)
    })()

    return () => {
      vivo = false
      cancelAnimationFrame(raf)
      musicaParar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- menús (pausa / resultados)
  const opcionesPausa = [
    ['Continuar', () => pausar(false)],
    ['Reiniciar carrera', alRepetir],
    ['Volver al menú', alMenu],
  ]
  const opcionesFin = [
    ['Repetir', alRepetir],
    ['Otra pista', alOtraPista],
    ['Menú', alMenu],
  ]
  const opciones = resultados ? opcionesFin : pausado ? opcionesPausa : null

  useNavegacion(
    (ev, fuente) => {
      if (!opciones) return
      const vertical = !resultados
      if ((vertical && ev === 'arr') || (!vertical && ev === 'izq')) setFoco((f) => (f + opciones.length - 1) % opciones.length)
      if ((vertical && ev === 'aba') || (!vertical && ev === 'der')) setFoco((f) => (f + 1) % opciones.length)
      if (ev === 'ok') opciones[foco][1]()
      if ((ev === 'atras' || ev === 'pausa') && fuente.tipo === 'mando' && pausado && !resultados) pausar(false)
    },
    !!opciones,
  )

  // pausa con teclado (Esc / P)
  useEffect(() => {
    const tecla = (e) => {
      if (e.repeat || !(e.code === 'Escape' || e.code === 'KeyP')) return
      const c = carreraRef.current
      if (!c || c.estado === 'terminada') return
      pausar(!pausadoRef.current)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  // ---- órdenes desde celulares
  useEffect(() => {
    if (!comando || !socket) return
    const j = jugadores.find((x) => x.fuente.tipo === 'celular' && x.fuente.clave === comando.clave)
    const esAnfitrion = j && j.numero === anfitrion
    if (!j) return
    if (comando.tipo === 'pausa' && !resultados) pausar(!pausadoRef.current)
    if (!esAnfitrion) return
    if (resultados) {
      if (comando.tipo === 'repetir') alRepetir()
      if (comando.tipo === 'otra-pista') alOtraPista()
      if (comando.tipo === 'menu') alMenu()
    } else if (pausado) {
      if (comando.tipo === 'reiniciar') alRepetir()
      if (comando.tipo === 'menu') alMenu()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comando])

  return (
    <>
      <canvas ref={lienzo} width={ANCHO} height={ALTO} />
      {!lista && (
        <div className="capa fondo-menu">
          <div className="titulo" style={{ fontSize: '7cqh' }}>{PISTAS[pista].nombre}</div>
          <div className="ayuda" style={{ marginTop: '2cqh' }}>Cargando…</div>
          <div className="barra-carga">
            <div style={{ width: `${Math.round(carga * 100)}%` }} />
          </div>
          <Controles celular={!!socket} />
        </div>
      )}
      {pausado && !resultados && (
        <div className="capa velo">
          <div className="titulo" style={{ fontSize: '10cqh' }}>PAUSA</div>
          <div className="menu-v">
            {opcionesPausa.map(([t, f], i) => (
              <button key={t} className={'boton' + (foco === i ? ' foco' : '')} onMouseEnter={() => setFoco(i)} onClick={f}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      {resultados && (
        <div className="capa velo">
          <div className="titulo" style={{ fontSize: '7.5cqh' }}>Resultados — {PISTAS[pista].nombre}</div>
          <div className="filas">
            {resultados.map((r, i) => (
              <div
                key={i}
                className="fila"
                style={r.humano ? { background: r.humano.color + 'cc', color: '#2a1206' } : undefined}
              >
                <span style={{ width: '7cqh' }}>{i + 1}º</span>
                <img src={iconoVehiculo(r.vehiculo)} alt="" />
                {r.humano && <span className="j">J{r.humano.numero}</span>}
                <span className="t">
                  {formatoTiempo(r.tiempo)}
                  {r.termino ? '' : ' *'}
                </span>
              </div>
            ))}
          </div>
          <div className="botonera">
            {opcionesFin.map(([t, f], i) => (
              <button key={t} className={'boton' + (foco === i ? ' foco' : '')} onMouseEnter={() => setFoco(i)} onClick={f}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function Controles({ celular }) {
  if (celular) return <div className="ayuda" style={{ marginTop: '5cqh' }}>¡Agarren los celulares de lado!</div>
  return (
    <div className="ayuda" style={{ marginTop: '5cqh' }}>
      <b>Teclado:</b> → acelerar · ← frenar · ↑ / Espacio saltar · Shift turbo · Z lanzar adelante · C soltar atrás · Esc pausa
      <br />
      <b>Control:</b> A acelerar · B saltar · LB / LT frenar · RB / RT turbo · X lanzar · Y soltar · Start pausa
    </div>
  )
}
