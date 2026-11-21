import React from 'react'
import { createRoot } from 'react-dom/client'
import './estilos.css'
import Pantalla from './pantalla/Pantalla.jsx'
import Control from './control/Control.jsx'

const esControl = window.location.pathname.startsWith('/control')
document.body.classList.add(esControl ? 'modo-control' : 'modo-pantalla')

createRoot(document.getElementById('root')).render(esControl ? <Control /> : <Pantalla />)
