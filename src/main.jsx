import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import InitialHomeFocus from './components/InitialHomeFocus.jsx'
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
import './styles/film-collections.css'
import './styles/series-navigation.css'
import './styles/issue218.css'
import './styles/waipu-tv.css'
import './styles/issue287-focus-detail.css'
import './styles/notifications.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <InitialHomeFocus />
    <App />
  </StrictMode>,
)
