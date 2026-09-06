import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/themes.css'
import './styles/profile.css'
import './styles/profiles.css'
import './styles/library.css'
import './styles/tv.css'
import './styles/tmdb.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
