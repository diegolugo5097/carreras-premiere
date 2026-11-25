// Línea central de un circuito cerrado (sacada de la malla "Via" del .glb).
// Coordenadas: s = distancia recorrida sobre la vía (m), d = desplazamiento lateral (m, + derecha).

export class Pista {
  constructor(datos) {
    const pts = datos.puntos
    this.ancho = datos.ancho
    this.medio = datos.ancho / 2
    const n = pts.length
    this.n = n
    this.x = new Float32Array(n)
    this.y = new Float32Array(n)
    this.z = new Float32Array(n)
    this.s = new Float32Array(n + 1)
    this.fi = new Float32Array(n + 1) // ángulo de la tangente (desenrollado)
    for (let i = 0; i < n; i++) {
      this.x[i] = pts[i][0]
      this.y[i] = pts[i][1]
      this.z[i] = pts[i][2]
    }
    let acum = 0
    let fiAnt = null
    for (let i = 0; i <= n; i++) {
      const a = i % n
      const b = (i + 1) % n
      const dx = this.x[b] - this.x[a]
      const dz = this.z[b] - this.z[a]
      this.s[i] = acum
      acum += Math.hypot(dx, dz)
      let f = Math.atan2(dz, dx)
      if (fiAnt !== null) {
        while (f - fiAnt > Math.PI) f -= 2 * Math.PI
        while (f - fiAnt < -Math.PI) f += 2 * Math.PI
      }
      this.fi[i] = f
      fiAnt = f
    }
    this.largo = this.s[n]
    this.paso = this.largo / n
  }

  _idx(s) {
    const L = this.largo
    const sm = ((s % L) + L) % L
    const f = sm / this.paso
    const i = Math.min(this.n - 1, Math.floor(f))
    return [i, f - i]
  }

  // posición en el mundo para (s, d) -> {x, y, z, fi}
  punto(s, d = 0, out = {}) {
    const [i, t] = this._idx(s)
    const j = (i + 1) % this.n
    const x = this.x[i] + (this.x[j] - this.x[i]) * t
    const y = this.y[i] + (this.y[j] - this.y[i]) * t
    const z = this.z[i] + (this.z[j] - this.z[i]) * t
    // ángulo suavizado entre segmentos para que la cámara no salte
    const fa = this._fiSuave(i)
    const fb = this._fiSuave(j)
    let df = fb - fa
    while (df > Math.PI) df -= 2 * Math.PI
    while (df < -Math.PI) df += 2 * Math.PI
    const fi = fa + df * t
    // derecha = (-sin fi, cos fi) en xz
    out.x = x - Math.sin(fi) * d
    out.z = z + Math.cos(fi) * d
    out.y = y
    out.fi = fi
    return out
  }

  _fiSuave(i) {
    // promedio entre el segmento que llega y el que sale de este punto
    const k = (i + this.n - 1) % this.n
    const a = this.fi[k]
    let b = this.fi[i]
    while (b - a > Math.PI) b -= 2 * Math.PI
    while (b - a < -Math.PI) b += 2 * Math.PI
    return (a + b) / 2
  }

  // curvatura dfi/ds en s
  curvatura(s) {
    const a = this.punto(s - 2).fi
    let b = this.punto(s + 2).fi
    while (b - a > Math.PI) b -= 2 * Math.PI
    while (b - a < -Math.PI) b += 2 * Math.PI
    return (b - a) / 4
  }

  // contorno normalizado para el minimapa: [[u, v], ...] en 0..1 y relación de aspecto
  contorno() {
    let minx = Infinity
    let maxx = -Infinity
    let minz = Infinity
    let maxz = -Infinity
    for (let i = 0; i < this.n; i++) {
      minx = Math.min(minx, this.x[i])
      maxx = Math.max(maxx, this.x[i])
      minz = Math.min(minz, this.z[i])
      maxz = Math.max(maxz, this.z[i])
    }
    const lado = Math.max(maxx - minx, maxz - minz)
    this.mapa = { minx, minz, lado, w: (maxx - minx) / lado, h: (maxz - minz) / lado }
    const lista = []
    for (let i = 0; i < this.n; i += 2) lista.push([(this.x[i] - minx) / lado, (this.z[i] - minz) / lado])
    return lista
  }

  aMapa(x, z) {
    const m = this.mapa
    return [(x - m.minx) / m.lado, (z - m.minz) / m.lado]
  }
}
