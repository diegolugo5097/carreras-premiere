# Carreras (React + Vite + Socket.io)

Juego de carreras de lado con las pistas Salento, Santa Lucía y Guaduales.

## Modos

1. **En esta pantalla**: teclado y hasta 4 controles (Xbox, PlayStation o genéricos por la Gamepad API).
   Cada jugador se une con **Enter** o **A**. Con 2 jugadores la pantalla se divide en dos; con 3 o 4, en cuatro.
2. **Celulares como control**: la pantalla muestra un QR y un código de 4 letras. Cada celular (hasta 4)
   elige vehículo y queda como control. El J1 (👑) elige la pista y decide qué sigue al terminar.

Siempre corren 6 en total: los que falten son rivales automáticos.

## Correr

```bash
npm install
npm run build
npm start            # http://localhost:3000  (la consola muestra también la IP de la red local)
```

Desarrollo con recarga automática: `npm run dev` (Vite en el puerto 5173 y el servidor en el 3001).

Para jugar con celulares, la pantalla y los celulares deben estar en **el mismo wifi**. Abre el juego en el
computador desde `http://localhost:3000`: el QR usa la IP local automáticamente.

### Publicarlo en internet
- **Vercel** sirve el modo de esta pantalla (teclado y controles), pero no permite WebSockets, así que el modo
  celular no funciona ahí.
- Para tener los dos modos en internet, publícalo como servicio Node (Render, Railway, Fly.io…):
  build `npm install && npm run build`, inicio `npm start`. El servidor usa `PORT` si existe.
  Opcional: `URL_PUBLICA=https://tu-dominio` para que el QR apunte ahí.

## Controles

| Acción | Teclado | Control | Celular |
|---|---|---|---|
| Acelerar | → / D | A, cruceta → | ACELERAR |
| Frenar | ← / A / ↓ | LB, LT, cruceta ← | FRENAR |
| Saltar | ↑ / W / Espacio | B, cruceta ↑ | SALTAR |
| Turbo | Shift / L | RB, RT | TURBO |
| Lanzar adelante | Z / J | X | LANZAR |
| Soltar atrás | C / K / X | Y | SOLTAR ATRÁS |
| Pausa | Esc / P | Start | ⏸ |

Las cajas flor de café dan un objeto al azar: el costal hace derrapar, el melao frena en seco y la guadua hace
rebotar. Saltando se esquivan las trampas.

## Estructura

```
server/index.js          Express + Socket.io: salas, reenvío de controles, sirve dist/
src/juego/datos.js       vehículos, pistas, ítems
src/juego/recursos.js    carga de imágenes/animaciones/pistas y sonido (Web Audio)
src/juego/entradas.js    teclado, controles, celulares y navegación de menús
src/juego/corredor.js    física sobre el perfil del suelo, animaciones e IA
src/juego/carrera.js     reglas de la carrera, cámaras, pantalla dividida y HUD (canvas)
src/pantalla/*           menús de la pantalla, salas y canvas del juego
src/control/Control.jsx  control táctil del celular
public/assets/           sprites (webp), pistas (webp + suelo.json) y sonidos
```
