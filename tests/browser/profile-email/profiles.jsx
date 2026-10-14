import { useState } from 'react'
const profiles = [
  { id: 'main', role: 'primary', displayName: 'Hauptprofil' },
  { id: 'family', role: 'member', displayName: 'Familie' },
]
// Profile listing is deterministic; ProfileView and its email component/hook
// are the production code, using real SDK transactions and snapshot listeners.
export function useProfiles() {
  const [id, setId] = useState('main')
  return { profiles, activeProfile: profiles.find((profile) => profile.id === id),
    selectProfile: setId, createProfile: async () => {}, renameProfile: async () => false }
}
