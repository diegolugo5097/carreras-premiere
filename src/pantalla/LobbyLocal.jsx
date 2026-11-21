import { useState } from 'react'
import { COLOR_JUGADOR, MAX_JUGADORES, PADRE_E_HIJA, VEHICULOS, iconoVehiculo } from '../juego/datos.js'
import { idFuente, mandos, useNavegacion } from '../juego/entradas.js'
import { sonido } from '../juego/recursos.js'

const N = VEHICULOS.length

export default function LobbyLocal({ alListo, alVolver }) {
  const [js, setJs] = useState([]) // { id, fuente, vehiculo, listo }

  const libreDesde = (desde, paso, lista, yo) => {
    const ocupados = new Set(lista.filter((j) => j.id !== yo).map((j) => j.vehiculo))
    let v = desde
    for (let k = 0; k < N; k++) {
      if (!ocupados.has(v)) return v
      v = (v + paso + N) % N
    }
    return desde
  }

  const todosListos = js.length > 0 && js.every((j) => j.listo)

  const accion = (ev, fuente) => {
    const id = idFuente(fuente)
    const yo = js.find((j) => j.id === id)
    if (!yo) {
      if (ev === 'ok' && js.length < MAX_JUGADORES) {
        const v = libreDesde(PADRE_E_HIJA, 1, js, id)
        setJs([...js, { id, fuente, vehiculo: v, listo: false }])
        sonido('caja', 0.4)
      } else if (ev === 'atras' && js.length === 0) alVolver()
      return
    }
    if (ev === 'izq' || ev === 'der') {
      if (yo.listo) return
      const paso = ev === 'der' ? 1 : -1
      const v = libreDesde((yo.vehiculo + paso + N) % N, paso, js, id)
      setJs(js.map((j) => (j.id === id ? { ...j, vehiculo: v } : j)))
    } else if (ev === 'ok') {
      if (yo.listo && todosListos) return terminar()
      setJs(js.map((j) => (j.id === id ? { ...j, listo: true } : j)))
      sonido('beep', 0.3)
    } else if (ev === 'atras') {
      if (yo.listo) setJs(js.map((j) => (j.id === id ? { ...j, listo: false } : j)))
      else setJs(js.filter((j) => j.id !== id))
    }
  }

  const terminar = () => {
    if (!todosListos) return
    sonido('ya', 0.4)
    alListo(js.map((j, i) => ({ numero: i + 1, color: COLOR_JUGADOR[i], vehiculo: j.vehiculo, fuente: j.fuente })))
  }

  useNavegacion(accion)

  const hayMandos = mandos().length > 0

  return (
    <div className="capa fondo-menu">
      <div className="titulo" style={{ fontSize: '7.5cqh' }}>Elijan vehículo</div>
      <div className="ayuda">
        Para unirse: <b>Enter</b> en el teclado o <b>A</b> en el control · ◀ ▶ cambiar · <b>A/Enter</b> listo · <b>B/Esc</b> atrás
      </div>
      <div className="ranuras">
        {Array.from({ length: MAX_JUGADORES }, (_, i) => {
          const j = js[i]
          if (!j)
            return (
              <button
                key={i}
                className="tarjeta ranura vacia"
                onClick={() => !js.some((x) => x.id === 'teclado') && accion('ok', { tipo: 'teclado' })}
              >
                <div className="num" style={{ color: COLOR_JUGADOR[i] }}>J{i + 1}</div>
                <div className="estado" style={{ marginTop: '2cqh' }}>
                  {i === js.length ? 'Pulsa A / Enter para unirte' : ''}
                </div>
              </button>
            )
          return (
            <div key={i} className="tarjeta ranura foco" style={{ borderColor: COLOR_JUGADOR[i], background: 'rgba(74,37,14,.92)' }}>
              {j.listo && <div className="listo">¡LISTO!</div>}
              <div className="num" style={{ color: COLOR_JUGADOR[i] }}>J{i + 1}</div>
              <img className="veh" src={iconoVehiculo(j.vehiculo)} alt="" />
              <div className="flechas">
                <button className="boton" disabled={j.listo} onClick={() => accion('izq', j.fuente)}>◀</button>
                <button className="boton" onClick={() => accion(j.listo ? 'atras' : 'ok', j.fuente)}>
                  {j.listo ? 'Cambiar' : 'Listo'}
                </button>
                <button className="boton" disabled={j.listo} onClick={() => accion('der', j.fuente)}>▶</button>
              </div>
              <div className="estado">{j.fuente.tipo === 'teclado' ? '⌨️ Teclado' : `🎮 Control ${j.fuente.indice + 1}`}</div>
            </div>
          )
        })}
      </div>
      <div style={{ height: '9cqh', marginTop: '3cqh', display: 'flex', alignItems: 'center' }}>
        {todosListos ? (
          <button className="boton foco" onClick={terminar}>
            ¡Todos listos! Elegir pista (A / Enter)
          </button>
        ) : (
          <div className="ayuda">
            {hayMandos ? '' : 'Si tienes un control, conéctalo y presiona cualquier botón para que el navegador lo detecte.'}
          </div>
        )}
      </div>
      <div className="esquina">
        <button className="boton" onClick={alVolver}>← Volver</button>
      </div>
    </div>
  )
}
