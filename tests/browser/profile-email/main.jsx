import React, { useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import ProfileView from '../../../src/components/ProfileView.jsx'
import { useDpadNavigation } from '../../../src/hooks/useDpadNavigation.js'
import '../../../src/index.css'
import '../../../src/styles/themes.css'
import '../../../src/styles/profile.css'
import '../../../src/styles/profiles.css'
import '../../../src/styles/provider-selection.css'
import '../../../src/styles/tv.css'

function Preview() {
  const back = useCallback(() => {}, [])
  useDpadNavigation({ detailOpen: false, profileMenuOpen: false, exitDialogOpen: false, onBack: back })
  return <div className="app-shell"><ProfileView user={{ uid: 'email-ui-owner', email: 'owner@example.org' }} onSignOut={() => {}} /></div>
}
createRoot(document.getElementById('root')).render(<Preview />)
