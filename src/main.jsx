import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const storedDensity = localStorage.getItem('apidiff:density')
document.documentElement.setAttribute(
  'data-density',
  storedDensity === 'compact' ? 'compact' : 'comfortable'
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
