import { COLOR_JUGADOR, MAX_JUGADORES, iconoVehiculo } from '../juego/datos.js'
import { useNavegacion } from '../juego/entradas.js'

export default function LobbyCelular({ sala, sinServidor, cels, anfitrion, alEmpezar, alVolver }) {
  const lista = Object.values(cels).filter((c) => c.conectado)
  const porNumero = Object.fromEntries(lista.map((c) => [c.numero, c]))
  const puede = lista.length > 0 && lista.every((c) => c.listo)

  useNavegacion((ev) => {
    if (ev === 'ok' && puede) alEmpezar()
    if (ev === 'atras') alVolver()
  })

  return (
    <div className="capa fondo-menu">
      <div className="titulo" style={{ fontSize: '6.5cqh' }}>Conecten sus celulares</div>
      {!sala ? (
        <div className="ayuda" style={{ marginTop: '6cqh' }}>
          {sinServidor
            ? 'No hay conexión con el servidor. El modo celular necesita correr el juego con “npm start” (o un servidor Node).'
            : 'Creando sala…'}
        </div>
      ) : (
        <div className="sala">
          <div className="qr">
            <img src={sala.qr} alt="Código QR" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6cqh', maxWidth: '80cqh' }}>
            <div className="ayuda" style={{ textAlign: 'left' }}>
              1. Conecta el celular al <b>mismo wifi</b> que esta pantalla.
              <br />
              2. Escanea el QR o entra a:
            </div>
            <div className="url">{sala.url}</div>
            <div className="ayuda" style={{ textAlign: 'left' }}>Código de sala:</div>
            <div className="codigo">{sala.codigo}</div>
          </div>
        </div>
      )}
      <div className="ranuras" style={{ marginTop: '3cqh' }}>
        {Array.from({ length: MAX_JUGADORES }, (_, i) => {
          const c = porNumero[i + 1]
          return (
            <div
              key={i}
              className={'tarjeta ranura' + (c ? ' foco' : ' vacia')}
              style={{ height: '27cqh', width: '30cqh', ...(c ? { borderColor: COLOR_JUGADOR[i], background: 'rgba(74,37,14,.92)' } : {}) }}
            >
              {c?.listo && <div className="listo" style={{ top: 'auto', bottom: '1.4cqh' }}>¡LISTO!</div>}
              <div className="num" style={{ color: COLOR_JUGADOR[i], fontSize: '3.4cqh' }}>
                J{i + 1} {c && c.numero === anfitrion ? '👑' : ''}
              </div>
              {c ? (
                c.vehiculo != null ? (
                  <img className="veh" style={{ width: '70%' }} src={iconoVehiculo(c.vehiculo)} alt="" />
                ) : (
                  <div className="estado">eligiendo…</div>
                )
              ) : (
                <div className="estado">libre</div>
              )}
            </div>
          )
        })}
      </div>
      <div className="ayuda" style={{ marginTop: '2.4cqh' }}>
        {puede
          ? `J${anfitrion} 👑 arranca desde su celular (o Enter / clic aquí)`
          : lista.length
            ? 'Esperando a que todos elijan vehículo y marquen “Listo”'
            : 'Esperando celulares…'}
      </div>
      {puede && (
        <button className="boton foco" style={{ marginTop: '1.4cqh' }} onClick={alEmpezar}>
          Elegir pista
        </button>
      )}
      <div className="esquina">
        <button className="boton" onClick={alVolver}>← Volver</button>
      </div>
    </div>
  )
}
