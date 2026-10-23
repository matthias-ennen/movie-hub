/**
 * Internal G2 pilot acceptance pack from two ORIGINAL read-only QA artifacts.
 * This is a reproducible manual test list, NEVER an approval bundle.
 * No YouTube/TMDB API calls and no catalog, badge, route or Firestore writes.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

export const PILOT_CASES=Object.freeze([
  Object.freeze({videoId:'1uf2AMrQMk0',mode:'free',purpose:'YouTube Movies FREE tariff'}),
  Object.freeze({videoId:'ucRKSNwzM_w',mode:'free',purpose:'Netzkino full-film / identity check'}),
  Object.freeze({videoId:'3csAkKfa6Vs',mode:'rent-buy',purpose:'YouTube Movies Rent/Buy storefront'}),
])
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/
const clean=x=>String(x??'').replace(/[<>\r\n|]/g,' ').replace(/\s+/g,' ').trim().slice(0,180)
const fail=code=>{throw Error(code)}
const sameSet=(a,b)=>a.length===b.length && new Set(a).size===a.length
  && a.every(x=>b.includes(x))

export function buildFirstOfferAcceptancePack(production,research,{
  cases=PILOT_CASES,
}={}) {
  const audit=production?.audit ?? production
  const summary=research?.summary
  if(audit?.mode!=='CURATED_TWO_PLAYLISTS_READ_ONLY'
    ||audit?.fullyScanned!==true||audit?.publicationPermitted!==false
    ||!Array.isArray(audit?.candidates)
    ||audit.uniqueVideoIds!==audit.candidates.length
    ||audit.candidates.some(c=>c?.accepted!==false||c?.toImport!==false
      ||c?.playbackRoute!==null||c?.verifiedOfferType!==null)
    ||summary?.mode!=='CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY'
    ||summary.publicationPermitted!==false
    ||summary.verifiedFilms!==0||summary.verifiedDEOffers!==0
    ||summary.newMovieImports!==0||summary.sourceQAObservedAt!==audit.observedAt
    ||summary.sourceVideoIds!==audit.uniqueVideoIds
    ||summary.processedRows!==audit.candidates.length
    ||!Array.isArray(research?.rows)
    ||research.rows.length!==audit.candidates.length
    ||!sameSet(audit.candidates.map(c=>c.videoId),research.rows.map(c=>c.videoId))) {
    fail('YOUTUBE_PILOT_ORIGINAL_QA_MISMATCH_OR_UNVERIFIED')
  }
  if(!Array.isArray(cases)||cases.length<1||cases.length>5
    ||new Set(cases.map(c=>c.videoId)).size!==cases.length) {
    fail('YOUTUBE_PILOT_CASE_SELECTION_INVALID')
  }
  const source=new Map(audit.candidates.map(c=>[c.videoId,c]))
  const membership=new Map(research.rows.map(c=>[c.videoId,c]))
  const candidates=cases.map(selected=>{
    const c=source.get(selected.videoId), r=membership.get(selected.videoId)
    if(!VIDEO_ID.test(String(selected.videoId||''))
      ||!['free','rent-buy'].includes(selected.mode)
      ||!c||!r||c.screened!==true||!c.videoTitle||!c.channelId
      ||c.deRegionSignal==='excluded'
      ||c.editorialOfferHint!==selected.mode
      ||r.editorialOfferHint!==selected.mode
      ||r.publicationPermitted!==false
      ||r.verifiedTmdbId!==null||r.playbackRoute!==null
      ||r.sourceStatus!==c.status
      ||!sameSet(c.playlistModes,r.playlistModes)) {
      fail('YOUTUBE_PILOT_CASE_NOT_SAFE_OR_MISSING')
    }
    return {
      videoId:c.videoId,
      watchUrl:'https://www.youtube.com/watch?v='+c.videoId,
      sourceTitle:clean(c.videoTitle),
      sourceChannel:clean(c.channelTitle),
      channelId:c.channelId,
      editorialOfferHint:c.editorialOfferHint,
      playlistModes:[...c.playlistModes],
      playlistIds:[...c.playlistIds],
      minutes:c.minutes,
      deRegionSignal:c.deRegionSignal,
      purpose:clean(selected.purpose),
      // Research hypotheses, NOT identity or offer verification.
      researchStatus:r.matchStatus,
      identityHypotheses:(r.topCandidates||[]).slice(0,3)
        .map(x=>({tmdbId:x.tmdbId,score:x.score,runtimeDelta:x.runtimeDelta})),
      // All real human observations remain UNRECORDED until tested.
      observations:{
        dePlaybackOnAndroid:null,
        dePlaybackOnFireTv:null,
        exactVideoAndFilmCutConfirmed:null,
        observedOfferType:null,
        independentSourceUseReview:null,
      },
      verificationStatus:'not-tested',
      verifiedOfferType:null,
      approved:false,
      playbackRoute:null,
    }
  })
  return {
    kind:'moviehub-youtube-g2-internal-manual-acceptance-pack',
    version:1,
    sourceObservedAt:audit.observedAt,
    tmdbResearchAt:summary.generatedAt,
    processedSourceIds:audit.uniqueVideoIds,
    approvalBundleCreated:false,
    verifiedOffers:0,
    publicationPermitted:false,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,routeWrites:0,
    candidates,
  }
}

export function renderFirstOfferAcceptancePack(pack) {
  if(pack?.kind!=='moviehub-youtube-g2-internal-manual-acceptance-pack'
    ||pack.publicationPermitted!==false||pack.approvalBundleCreated!==false) {
    fail('YOUTUBE_PILOT_REPORT_UNTRUSTED')
  }
  const lines=[
    '# MovieHub YouTube G2 – erstes reales Filmangebot: Geräte-Abnahme',
    '',
    '- Quellenzeit: '+pack.sourceObservedAt,
    '- TMDB-Recherchezeit: '+pack.tmdbResearchAt,
    '- Quelle: '+pack.processedSourceIds+' vollständig geprüfte Playlist-Video-IDs',
    '- **Nur interne manuelle Abnahme. Keine Freigabe, keine neuen Direktlinks.**',
    '- Playlist FREE/R&B und YouTube-DE-Region-Signal beweisen KEINEN Tarif oder eine abspielbare Fassung.',
    '- Die Hypothesen zum Filmwerk beweisen KEINE identische Filmfassung.',
    '',
  ]
  for(const c of pack.candidates){
    lines.push(
      '## '+c.sourceTitle+' – '+c.videoId,
      '',
      '- Originalvideo: '+c.watchUrl,
      '- Kanal: '+c.sourceChannel+' ('+c.channelId+')',
      '- Quellkategorie: '+c.editorialOfferHint+' (nur Playlist-Hinweis)',
      '- Videolaufzeit laut API: '+c.minutes+' Min.; DE-Signal: '+c.deRegionSignal,
      '- TMDB-Status: '+c.researchStatus+'; **keine bestätigte Filmidentität**',
      '- TMDB-Hypothesen (nur Review): '+(c.identityHypotheses.map(x=>x.tmdbId).join(', ')||'keine'),
      '- Prüfzweck: '+c.purpose,
      '',
      '- [ ] Auf Android in Deutschland genau diese Video-ID in der YouTube-App öffnen, Abspielen bzw. Preis-Anzeige notieren',
      '- [ ] Angebotsart konkret notieren: kostenlos, kostenlos mit Werbung, Leihen, Kaufen, Login/Paywall, nicht verfügbar oder unklar',
      '- [ ] Werk und vollständige Fassung anhand Laufzeit, Anfang und Szenen/Ende nachvollziehbar prüfen (kein Trailer/Ausschnitt)',
      '- [ ] Dieselbe Video-ID auf Fire TV in der YouTube-App öffnen; Start und eventuelle Geräteabweichung beobachten',
      '- [ ] Filmwerk-ID und Quelle/Herkunft separat fachlich bewerten; Nutzungsberechtigung darf nicht behauptet werden',
      '- [ ] Datum/Uhrzeit, verwendetes Gerät, Google-Login-Status und konkrete Beobachtung bei Issue #388 festhalten',
      '',
      '**Status: NICHT GETESTET.** Kein workIdentityVerified, dePlaybackVerified,',
      'offerTypeVerified oder sourceUseAuthorized aus diesem Pack ableiten.',
      '',
    )
  }
  return lines.join('\n')+'\n'
}

export async function writeFirstOfferAcceptancePack({
  sourcePath='artifacts/youtube-g2/curated-playlists/qa.json',
  researchPath='artifacts/youtube-g2/curated-tmdb-membership/qa.json',
  outputDir='artifacts/youtube-g2/first-offer-manual-acceptance',
}={}) {
  const [production,research]=await Promise.all([
    readFile(sourcePath,'utf8').then(JSON.parse),
    readFile(researchPath,'utf8').then(JSON.parse),
  ])
  const pack=buildFirstOfferAcceptancePack(production,research)
  await mkdir(outputDir,{recursive:true})
  await writeFile(outputDir+'/qa.json',JSON.stringify(pack,null,2)+'\n',{mode:0o600})
  await writeFile(outputDir+'/checklist.md',renderFirstOfferAcceptancePack(pack),{mode:0o600})
  console.log(JSON.stringify({
    internalManualCaseCount:pack.candidates.length,
    sourceVideoIds:pack.processedSourceIds,
    verifiedOffers:pack.verifiedOffers,
    publicationPermitted:false,
  }))
  return pack
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  writeFirstOfferAcceptancePack().catch(e=>{
    console.error('G2 internal manual acceptance pack refused: '+e.message)
    process.exitCode=1
  })
}
