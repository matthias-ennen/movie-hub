export function shouldLoadLiveTitles({
  homeReady: _homeReady = false,
  tvRequested = false,
} = {}) {
  return Boolean(tvRequested)
}

export function shouldLoadLiveStations({
  tvRequested = false,
  settingsOpen = false,
} = {}) {
  return Boolean(tvRequested || settingsOpen)
}
