export function shouldLoadLiveTitles() {
  // Full provider title catalogs contain all future broadcast lists and are too
  // heavy for the Android/Fire TV WebView. TV is built from the selected day
  // shard instead; missing title metadata is hydrated on demand.
  return false
}

export function shouldLoadLiveStations({
  tvRequested = false,
  settingsOpen = false,
} = {}) {
  return Boolean(tvRequested || settingsOpen)
}

export function isTvPresentationReady({
  catalogStatus = 'loading',
  liveAvailabilityStatus = 'idle',
  stationSelectionLoading = true,
  joynStationSelectionLoading = true,
} = {}) {
  const catalogSettled = catalogStatus !== 'loading'
  const liveAvailabilitySettled = liveAvailabilityStatus === 'ready'
    || liveAvailabilityStatus === 'unavailable'
  const stationSelectionsSettled = !stationSelectionLoading
    && !joynStationSelectionLoading

  return catalogSettled
    && liveAvailabilitySettled
    && stationSelectionsSettled
}
