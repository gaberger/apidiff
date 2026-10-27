// Entry point for the static spec site (spec.html → site-dist/index.html).
// Renders only the Changeset Spec page, so the site needs no server functions.
import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import ChangesetSpec from '@/pages/ChangesetSpec.jsx'
import '@/index.css'

document.documentElement.setAttribute('data-density', 'comfortable')

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ChangesetSpec standalone />
  </BrowserRouter>
)
