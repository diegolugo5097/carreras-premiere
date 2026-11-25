// Carga de circuitos .glb, hojas de sprites de los karts y texturas de ítems.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { PISTAS, base, imgTrampa, imgCaja, rutaKart } from './datos.js'
import { Pista } from './pista3d.js'

export const ANIMS = ['marcha', 'giro_izquierdo', 'giro_derecho', 'salto', 'dano', 'resbalon', 'lanzar_poder', 'mirar_a_los_lados']

const cargadorTex = new THREE.TextureLoader()
const cacheTex = new Map()

export function textura(url, alAvanzar) {
  if (!cacheTex.has(url)) {
    cacheTex.set(
      url,
      new Promise((ok) =>
        cargadorTex.load(
          url,
          (t) => {
            t.colorSpace = THREE.SRGBColorSpace
            t.anisotropy = 4
            alAvanzar?.()
            ok(t)
          },
          undefined,
          () => {
            console.warn('No cargó', url)
            alAvanzar?.()
            ok(new THREE.Texture())
          },
        ),
      ),
    )
  } else alAvanzar?.()
  return cacheTex.get(url)
}

export async function cargarKart(i, alAvanzar) {
  const r = rutaKart(i)
  const lista = await Promise.all(ANIMS.map((a) => textura(`${r}${a}.webp`, alAvanzar)))
  return Object.fromEntries(ANIMS.map((a, k) => [a, lista[k]]))
}

const cacheCircuito = new Map()

export function cargarCircuito(i, alAvanzar) {
  if (cacheCircuito.has(i)) return cacheCircuito.get(i)
  const c = PISTAS[i].carpeta
  const p = (async () => {
    const datos = await fetch(base(`circuitos/${c}.json`)).then((r) => r.json())
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    const gltf = await new Promise((ok, mal) =>
      loader.load(base(`circuitos/${c}.glb`), ok, (e) => e.total && alAvanzar?.(e.loaded / e.total), mal),
    )
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.matrixAutoUpdate = false
        o.updateMatrix()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          if (m.map) m.map.anisotropy = 8
        }
      }
    })
    return { escena: gltf.scene, pista: new Pista(datos) }
  })()
  cacheCircuito.set(i, p)
  return p
}

export async function cargarComunes() {
  const [t0, t1, t2, v0, v1, v2, caja, abierta] = await Promise.all([
    textura(imgTrampa(0, true)),
    textura(imgTrampa(1, true)),
    textura(imgTrampa(2, true)),
    textura(imgTrampa(0, false)),
    textura(imgTrampa(1, false)),
    textura(imgTrampa(2, false)),
    textura(imgCaja(false)),
    textura(imgCaja(true)),
  ])
  return { trampas: [t0, t1, t2], vuelo: [v0, v1, v2], caja, cajaAbierta: abierta }
}

// textura de cuadros para la línea de meta
export function texturaCuadros() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 32
  const g = c.getContext('2d')
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fff'
      g.fillRect(x * 16, y * 16, 16, 16)
    }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.NearestFilter
  return t
}
