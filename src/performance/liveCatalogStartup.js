export function shouldLoadLiveTitles({
  homeReady = false,
  tvRequested = false,
} = {}) {
  return Boolean(homeReady || tvRequested)
}

export function shouldLoadLiveStations({
  tvRequested = false,
  settingsOpen = false,
} = {}) {
  return Boolean(tvRequested || settingsOpen)
}
