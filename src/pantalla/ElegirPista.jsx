import { useState } from 'react'
import { PISTAS, miniaturaPista } from '../juego/datos.js'
import { useNavegacion } from '../juego/entradas.js'

export default function ElegirPista({ inicial = 0, aviso, alElegir, alVolver }) {
  const [foco, setFoco] = useState(inicial)
  useNavegacion((ev) => {
    if (ev === 'izq') setFoco((f) => (f + PISTAS.length - 1) % PISTAS.length)
    if (ev === 'der') setFoco((f) => (f + 1) % PISTAS.length)
    if (ev === 'ok') alElegir(foco)
    if (ev === 'atras') alVolver()
  })
  return (
    <div className="capa fondo-menu">
      <div className="titulo" style={{ fontSize: '7.5cqh' }}>Elijan la pista</div>
      <div className="pistas">
        {PISTAS.map((p, i) => (
          <button
            key={p.carpeta}
            className={'tarjeta pista' + (foco === i ? ' foco' : '')}
            onMouseEnter={() => setFoco(i)}
            onClick={() => alElegir(i)}
          >
            <img src={miniaturaPista(i)} alt="" />
            <span>{p.nombre}</span>
          </button>
        ))}
      </div>
      <div className="ayuda" style={{ marginTop: '4cqh' }}>
        ◀ ▶ elegir · A / Enter correr · B / Esc volver
        {aviso && (
          <>
            <br />
            {aviso}
          </>
        )}
      </div>
      <div className="esquina">
        <button className="boton" onClick={alVolver}>← Volver</button>
      </div>
    </div>
  )
}
