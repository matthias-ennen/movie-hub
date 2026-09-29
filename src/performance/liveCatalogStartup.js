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
  waipuStationStatus = 'loading',
  joynStationStatus = 'loading',
  stationSelectionLoading = true,
  joynStationSelectionLoading = true,
  scheduleStatus = 'idle',
  hasHeroItems = false,
} = {}) {
  const stationCatalogsSettled = waipuStationStatus !== 'loading'
    && joynStationStatus !== 'loading'
  const stationSelectionsSettled = !stationSelectionLoading
    && !joynStationSelectionLoading
  const scheduleSettled = scheduleStatus !== 'idle' && scheduleStatus !== 'loading'

  return stationCatalogsSettled
    && stationSelectionsSettled
    && (hasHeroItems || scheduleSettled)
}
