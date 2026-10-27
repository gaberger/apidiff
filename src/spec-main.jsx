// Entry point for the static spec site (spec.html → site-dist/index.html).
// Renders the Changeset Spec, Tools and Testing pages only, so the site needs no server functions.
import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ChangesetSpec from '@/pages/ChangesetSpec.jsx'
import Tools from '@/pages/Tools.jsx'
import Testing from '@/pages/Testing.jsx'
import '@/index.css'

document.documentElement.setAttribute('data-density', 'comfortable')

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/tools" element={<Tools />} />
      <Route path="/testing" element={<Testing />} />
      <Route path="*" element={<ChangesetSpec standalone />} />
    </Routes>
  </BrowserRouter>
)
