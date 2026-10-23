/**
 * Read-only deployment-report projection for G2's editorial playlist intake,
 * complete-catalog reconciliation and canonical TMDB movie metadata feed.
 *
 * Do NOT label playlist-classified watch links as independently verified
 * Germany playback offers. Missing output is UNKNOWN, not 0 imports.
 */
const number=n=>n.toLocaleString('de-DE')
const count=n=>Number.isInteger(n)&&n>=0
const validTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))
const tsFresh=(value,at)=>{
  const delta=Date.parse(at)-Date.parse(value)
  return Number.isFinite(delta)&&delta>=-60000&&delta<=12*3600000
}
export function summarizeYoutubeEditorialCatalogPublication({
  intake=null, reconciliation=null, films=null, hints=null,
  sourceStep='skipped', intakeStep='skipped', reconcileStep='skipped',
  metadataStep='skipped', filmStep='skipped', publishedStep='skipped',
  reportedAt=new Date().toISOString(),
}={}){
  const intakeValid=intake?.mode==='YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY'
    &&intake.fullScan===true&&intake.twoUserDefinedPlaylists===true
    &&intake.unaccountedForVideoIds===0
    &&count(intake.uniqueVideoIds)&&intake.uniqueVideoIds>0
    &&intake.processedVideoIds===intake.uniqueVideoIds
    &&count(intake.playlistClasses?.FREE)
    &&count(intake.playlistClasses?.['R&B'])
    &&intake.playlistClasses.FREE+intake.playlistClasses['R&B']===intake.uniqueVideoIds
    &&intake.publicationPermitted===false
    &&validTime(intake.generatedAt)&&tsFresh(intake.generatedAt,reportedAt)
  const reconciliationValid=reconciliation?.kind==='moviehub-youtube-full-catalog-reconciliation'
    &&reconciliation.privateArtifact===true
    &&reconciliation.publicationPermitted===false
    &&reconciliation.totalVideoIds===intake?.uniqueVideoIds
    &&reconciliation.processedVideoIds===intake?.uniqueVideoIds
    &&reconciliation.unaccountedForVideoIds===0
    &&count(reconciliation.catalogCandidateCount)
    &&validTime(reconciliation.generatedAt)
    &&tsFresh(reconciliation.generatedAt,reportedAt)
  const pairValid=hints?.kind==='moviehub-youtube-curated-editorial-title-hints'
    &&hints.schemaVersion===1&&hints.providerId==='youtube'
    &&hints.publicationAuthority==='editorial-playlist-only'
    &&hints.verifiedDEOffers===0&&hints.verifiedPlaybackRoutes===0
    &&hints.sourceVideoIds===intake?.uniqueVideoIds
    &&count(hints.count)&&Array.isArray(hints.entries)
    &&hints.entries.length===hints.count
    &&films?.kind==='moviehub-youtube-curated-new-film-metadata'
    &&films.schemaVersion===1&&films.providerId==='youtube'
    &&films.offerVerification==='editorial-only-not-independent'
    &&films.sourceVideoIds===intake?.uniqueVideoIds
    &&count(films.count)&&films.count<=hints.count&&films.count<=50
    &&Array.isArray(films.entries)&&films.entries.length===films.count
    &&films.generatedAt===hints.generatedAt&&validTime(films.generatedAt)
    &&tsFresh(films.generatedAt,reportedAt)
    &&new Set(hints.entries.map(e=>e?.videoId)).size===hints.count
    &&new Set(films.entries.map(e=>e?.tmdbId)).size===films.count
    &&films.entries.every(e=>e?.film?.type==='movie'
      &&e.film.source==='tmdb'&&e.film.metadataComplete===true
      &&e.film.tmdbId===e.tmdbId
      &&e.film.id==='tmdb-movie-'+e.tmdbId
      &&['FREE','R&B'].includes(e.playlistClass)
      &&hints.entries.some(x=>x.videoId===e.videoId
        &&x.key==='movie:'+e.tmdbId
        &&x.playlistMode===(e.playlistClass==='FREE'?'free':'rent-buy')))
  const scanMeasured=sourceStep==='success'&&intakeStep==='success'&&intakeValid
    &&reconcileStep==='success'&&reconciliationValid
  const published=scanMeasured&&metadataStep==='success'&&filmStep==='success'
    &&publishedStep==='success'&&pairValid
  const publishFailure=[sourceStep,intakeStep,reconcileStep,metadataStep,filmStep,publishedStep]
    .some(x=>x==='failure')
  return {
    intake:{
      area:'YouTube · vollständiger Playlist-Intake',
      status:publishFailure&&[sourceStep,intakeStep,reconcileStep].includes('failure')
        ?'❌ fehlgeschlagen':scanMeasured?'✅ erfolgreich':'⚠️ kein vollständiger Live-Nachweis',
      stock:scanMeasured
        ?number(intake.uniqueVideoIds)+'/'+number(intake.uniqueVideoIds)+' Videos geprüft'
        :'Playlist-Intake nicht bestätigt',
      activity:scanMeasured
        ?number(intake.playlistClasses.FREE)+' FREE · '+number(intake.playlistClasses['R&B'])+' R&B'
        :'Playlist-Klassifikation nicht nachgewiesen',
      open:scanMeasured
        ?number(reconciliation.catalogCandidateCount)+' kanonische Titelkandidaten im vollständigen Bestandsabgleich · 0 ausgelassen'
        :'Vollständigen Bestandsabgleich und Deckung aller Video-IDs prüfen',
    },
    films:{
      area:'YouTube → TMDB-Neutitel',
      status:publishFailure?'❌ fehlgeschlagen'
        :published?'✅ veröffentlicht und zurückgelesen'
          :'⚠️ Veröffentlichung nicht bestätigt',
      stock:published
        ?number(films.count)+' neue TMDB-Filme im MovieHub-Zusatzkatalog'
        :'Neutitel-Veröffentlichung nicht bestätigt',
      activity:published
        ?number(hints.count)+' konkrete YouTube-Playlist-Links'
        :'Keine belastbare Zahl veröffentlichter Playlist-Links',
      open:published
        ?'Redaktionelle FREE/R&B-Playlist-Zuordnung, keine unabhängig bestätigten deutschen DE-Playback-Angebote'
        :'Ohne erfolgreiche Publikation keine neuen Filmimporte oder Direktlinks behaupten',
    },
    publicationMeasured:published,
  }
}
