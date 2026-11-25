// Datos fijos del juego: vehículos, pistas, ítems.
export const VEHICULOS = [
  '01_Guanteletes', '02_Gorra_roja', '03_Turbante', '04_Estrella', '05_Sol',
  '06_Oficial', '07_Capitan_Premier', '08_Tatuado', '10_Padre_e_hija', '11_Gafas_oscuras',
]
export const PADRE_E_HIJA = 8

export const PISTAS = [
  { nombre: 'Salento', carpeta: 'Salento', cielo: '#9fd3f0' },
  { nombre: 'Santa Lucía', carpeta: 'Santa_Lucia', cielo: '#a9d8f2' },
  { nombre: 'Guaduales', carpeta: 'Guaduales', cielo: '#b4dcef' },
]
export const VUELTAS = 3

// 0 costal de café, 1 melao de panela, 2 rollos de guadua
export const ITEM_CARPETA = ['costal_de_cafe', 'melao_de_panela', 'rollos_de_guadua']
export const ITEM_REACCION = ['derrape_cafe', 'frenazo_melao', 'rebote_guadua']

export const TOTAL_CORREDORES = 6
export const MAX_JUGADORES = 4

// Colores para distinguir a los jugadores humanos (J1..J4)
export const COLOR_JUGADOR = ['#ffd23f', '#3fc1ff', '#ff5a5f', '#7ce35a']

export const base = (p) => `/assets/${p}`
export const rutaKart = (i) => base(`karts/${VEHICULOS[i]}/`)
export const iconoVehiculo = (i) => rutaKart(i) + 'icono.webp'
export const imgTrampa = (item, enPista = true) =>
  base(`trampas/${ITEM_CARPETA[item]}/${enPista ? 'en_pista' : 'lanzamiento'}.webp`)
export const imgCaja = (abierta) => base(`trampas/caja_flor_de_cafe/${abierta ? 'abierta' : 'cerrada'}.webp`)
export const miniaturaPista = (i) => base(`miniaturas/${PISTAS[i].carpeta}.webp`)

export function formatoTiempo(t) {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(2).padStart(5, '0')
  return `${m}:${s}`
}
