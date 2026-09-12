import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/themes.css'
import './styles/profile.css'
import './styles/profiles.css'
import './styles/library.css'
import './styles/issue128-detail-polish.css'
import './styles/media-controls.css'
import './styles/tv.css'
import './styles/tmdb.css'
import './styles/provider-selection.css'
import './styles/issue128-row-alignment.css'
import './styles/top-ten.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
