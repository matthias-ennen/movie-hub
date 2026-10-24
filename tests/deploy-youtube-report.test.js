import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { summarizeYoutubeDeployment } from '../scripts/deploy-youtube-report-model.mjs'
import { verifyYoutubePublishedReports } from '../scripts/verify-published-data.mjs'
import { buildWorkflowSummary, workflowSummaryMarkdown } from '../scripts/report-workflow-summary.mjs'
const at='2026-10-23T08:00:00.000Z'
const source={
  kind:'moviehub-youtube-curated-source-status',sourceId:'youtube',
  generatedAt:at,sourcePlaylistCount:2,
  playlistIds:['PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ','PLJWJS8p_IeEo'],
  inventoryVideoIds:37,videoDetailsResolved:28,
  reviewOnlyCandidates:37,approvedDEOfferRoutes:0,
  tmdbFirstApprovedInputRows:0,tmdbFirstVerifiedVideoRoutes:0,
  tmdbFirstBlockedVideoRoutes:0,
  playlistOverlapConflicts:1,fullyScanned:true,
  providerBadgeAuthority:'tmdb-preserved',
  unmatchedTitleBehavior:'original-youtube-search-link',
}
const badgeCoverage={
  kind:'moviehub-youtube-g2-bidirectional-coverage-baseline',
  schemaVersion:1,generatedAt:at,privateArtifact:true,
  publicationPermitted:false,status:'read-only-coverage-no-offer-or-match-approval',
  catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  publicRecordsExported:0,
  youtubeFirst:{sourceVideos:37,editorialDirectLinks:0,reviewOnlyVideos:37},
  tmdbFirst:{
    publicYoutubeBadgedMovies:3036,publicYoutubeBadgedSeries:4,
    canonicalAndPublicMovieBadges:1046,publicSearchOnlyMovieBadges:1990,
    movieBadgesWithCuratedPlaylistLinks:0,
    movieBadgesWithIndependentlyVerifiedRoutes:0,
    movieBadgesWithAnyExactRoute:0,movieBadgesStillUsingSearchFallback:3036,
    seriesBadgesWithIndependentlyVerifiedRoutes:0,
    seriesBadgesRequiringEpisodeOrSeriesReview:4,
  },
}
const routes={
  kind:'moviehub-youtube-verified-title-routes',schemaVersion:1,
  generatedAt:at,providerId:'youtube',count:0,entries:[],
}
const summary=(src=source,index=routes,sourceStep='success',routeStep='success')=>
  buildWorkflowSummary({
    youtubeStatus:src,youtubeRoutes:index,
    steps:{youtubeSync:sourceStep,youtubeRoutes:routeStep,
      tv14Day:'success',preparedVerify:'success',publication:'success',deploy:'success'},
    run:{number:444,reportedAt:'2026-10-23T08:20:00.000Z'},
    tv14DaySummary:{kind:'moviehub-tv-14-day-summary',
      count:2,sourceCount:3,candidateLimitPerRow:120,
      entries:[{hasPrimeTime:true},{hasPrimeTime:false}]},
  })
describe('data-flow ordered deploy report: YouTube source, verification, publishing',()=>{
  it('includes all real source numbers and distinguishes measured zero approved links',()=>{
    const result=summary()
    const rows=result.rows
    expect(rows.find(r=>r.area==='YouTube · 2 Playlists')).toMatchObject({
      status:'✅ erfolgreich',stock:'37 Video-IDs · 28 mit Metadaten · 2 Playlists',
    })
    expect(rows.find(r=>r.area==='YouTube · 2 Playlists').activity)
      .toContain('9 ohne Videodetails · 1 redaktionelle Überschneidungen')
    expect(rows.find(r=>r.area==='YouTube · 2 Playlists').open)
      .toContain('37 Playlist-Videos ohne unabhängig bestätigte DE-Angebotsroute')
    expect(rows.find(r=>r.area==='YouTube · 2 Playlists').open)
      .not.toContain('ungeprüfte IDs')
    expect(rows.find(r=>r.area==='YouTube · Direktlink-Freigabe')).toMatchObject({
      status:'✅ erfolgreich',stock:'0 verifizierte Filmrouten',
    })
    expect(rows.find(r=>r.area==='TV · 14-Tage-Vorschau').activity).toContain('1 mit Prime Time')
    const areas=rows.map(r=>r.area)
    const position=area=>areas.indexOf(area)
    expect(position('TMDB-Änderungen')).toBeLessThan(position('Waipu EPG'))
    expect(position('Waipu-Quelldaten')).toBeLessThan(position('Joyn EPG'))
    expect(position('Joyn-Quelldaten')).toBeLessThan(position('YouTube · 2 Playlists'))
    expect(position('YouTube · 2 Playlists')).toBeLessThan(position('YouTube · vollständiger Playlist-Intake'))
    expect(position('YouTube · vollständiger Playlist-Intake')).toBeLessThan(position('Kanonische Titelkandidaten'))
    expect(position('YouTube · 2 Playlists')).toBeLessThan(position('Kanonische Titelkandidaten'))
    expect(position('Kanonischer Executor')).toBeLessThan(position('Suchindex'))
    expect(position('Kanonischer Executor')).toBeLessThan(position('YouTube → TMDB-Neutitel'))
    expect(position('YouTube → TMDB-Neutitel')).toBeLessThan(position('Suchindex'))
    expect(rows.find(r=>r.area==='YouTube → TMDB-Neutitel').stock)
      .toBe('Neutitel-Veröffentlichung nicht bestätigt')
    expect(position('Suchindex')).toBeLessThan(position('TV · 14-Tage-Vorschau'))
    expect(position('Gemeinsame App-Daten')).toBeLessThan(position('YouTube · TMDB-first-Verifikation'))
    expect(position('YouTube · TMDB-first-Verifikation')).toBeLessThan(position('YouTube · Direktlink-Freigabe'))
    expect(position('YouTube · Direktlink-Freigabe')).toBeLessThan(position('App-Build'))
    expect(position('App-Build')).toBeLessThan(position('Vorabprüfung'))
    expect(position('Vorabprüfung')).toBeLessThan(position('Firebase'))
    expect(workflowSummaryMarkdown(result)).toContain('YouTube-Playlist-Mitgliedschaft ist kein bestätigtes Filmwerk')
  })

  it('reconciles independently approved TMDB-first routes outside the two playlist inventories',()=>{
    const approved={...source,
      tmdbFirstApprovedInputRows:2,tmdbFirstVerifiedVideoRoutes:1,
      tmdbFirstBlockedVideoRoutes:1,approvedDEOfferRoutes:1,
    }
    const index={...routes,count:1,entries:[{
      key:'movie:539892',verifiedVideoId:'Abc12345678',
      target:'https://www.youtube.com/watch?v=Abc12345678',
    }]}
    const result=summarizeYoutubeDeployment({status:approved,routes:index,
      sourceStep:'success',routeStep:'success',reportedAt:at})
    expect(result.source.status).toBe('✅ erfolgreich')
    expect(result.source.open).toContain('0 Playlist-Angebote bestätigt')
    expect(result.tmdbFirst.status).toBe('✅ erfolgreich')
    expect(result.tmdbFirst.stock).toContain('2 unabhängig geprüfte TMDB-first-Freigaben')
    expect(result.tmdbFirst.stock).toContain('1 aktuell verifizierte Filmrouten')
    expect(result.tmdbFirst.activity).toContain('1 nach aktuellem Video-/Quellenabgleich gesperrt')
    expect(result.routes.status).toBe('✅ erfolgreich')
    expect(result.routes.stock).toBe('1 verifizierte Filmrouten')
    const workflow=summary(approved,index)
    expect(workflow.rows.find(x=>x.area==='YouTube · TMDB-first-Verifikation').status)
      .toBe('✅ erfolgreich')
    const areas=workflow.rows.map(x=>x.area)
    expect(areas.indexOf('YouTube · TMDB-first-Verifikation'))
      .toBeLessThan(areas.indexOf('YouTube · Direktlink-Freigabe'))
  })
  it('reconciles mixed playlist + TMDB-first routes, rejecting impossible counts',()=>{
    const input={...source,reviewOnlyCandidates:36,approvedDEOfferRoutes:2,
      tmdbFirstApprovedInputRows:2,tmdbFirstVerifiedVideoRoutes:1,
      tmdbFirstBlockedVideoRoutes:1}
    const index={...routes,count:2,entries:[
      {key:'movie:101',verifiedVideoId:'Abc12345678',
        target:'https://www.youtube.com/watch?v=Abc12345678'},
      {key:'movie:102',verifiedVideoId:'Zbc12345678',
        target:'https://www.youtube.com/watch?v=Zbc12345678'},
    ]}
    const options={routes:index,sourceStep:'success',routeStep:'success',reportedAt:at}
    expect(summarizeYoutubeDeployment({...options,status:input}).source.status)
      .toBe('✅ erfolgreich')
    expect(summarizeYoutubeDeployment({...options,status:input}).routes.status)
      .toBe('✅ erfolgreich')
    for(const sourceInvalid of [
      {...input,tmdbFirstBlockedVideoRoutes:0},
      {...input,tmdbFirstVerifiedVideoRoutes:3},
      {...input,approvedDEOfferRoutes:1},
      {...input,tmdbFirstApprovedInputRows:undefined},
    ]){
      const out=summarizeYoutubeDeployment({...options,status:sourceInvalid})
      expect(out.source.status).not.toBe('✅ erfolgreich')
      expect(out.tmdbFirst.stock).toBe('TMDB-first-Verifikationsstand nicht verfügbar')
    }
  })
  it('reports verified current public TMDB badge coverage separately from offer approval',()=>{
    const props={status:source,routes,coverage:badgeCoverage,
      sourceStep:'success',routeStep:'success',coverageStep:'success',reportedAt:at}
    const result=summarizeYoutubeDeployment(props)
    expect(result.badges.status).toBe('✅ erfolgreich')
    expect(result.badges.stock).toBe('3.036 öffentliche Filme · 4 Serien mit YouTube-Badge')
    expect(result.badges.open).toContain('3.036 Filme weiterhin mit YouTube-Suchfallback')
    expect(result.badges.open).toContain('1.990 Badge-Filme nur im Suchindex')
    expect(result.badges.activity).toContain('0 mit unabhängig verifizierter DE-Route')
    const flow=buildWorkflowSummary({
      youtubeStatus:source,youtubeRoutes:routes,
      youtubeBidirectionalCoverage:badgeCoverage,
      steps:{youtubeSync:'success',youtubeRoutes:'success',youtubeCoverage:'success'},
      run:{reportedAt:at},
    })
    const areas=flow.rows.map(x=>x.area)
    expect(areas.indexOf('YouTube · TMDB-Badge-Abgleich'))
      .toBeLessThan(areas.indexOf('YouTube · TMDB-first-Verifikation'))
    expect(flow.rows.find(x=>x.area==='YouTube · TMDB-Badge-Abgleich').status)
      .toBe('✅ erfolgreich')
    expect(workflowSummaryMarkdown(flow)).toContain('3.036 öffentliche Filme')
    for(const bad of [
      {...badgeCoverage,generatedAt:'2026-10-20T01:00:00Z'},
      {...badgeCoverage,tmdbFirst:{...badgeCoverage.tmdbFirst,
        movieBadgesStillUsingSearchFallback:3035}},
      {...badgeCoverage,youtubeFirst:{...badgeCoverage.youtubeFirst,sourceVideos:36}},
    ]){
      const notVerified=summarizeYoutubeDeployment({...props,coverage:bad})
      expect(notVerified.badges.status).not.toBe('✅ erfolgreich')
      expect(notVerified.badges.stock).toBe('Aktueller TMDB-YouTube-Badge-Bestand nicht nachgewiesen')
    }
    expect(summarizeYoutubeDeployment({...props,coverageStep:'skipped'}).badges.stock)
      .toBe('Aktueller TMDB-YouTube-Badge-Bestand nicht nachgewiesen')
  })
  it('summarizes the real private review split without leaking video IDs, and fails closed',()=>{
    const entry=(id,state)=>({videoId:id,publicationStatus:state})
    const queue={
      kind:'moviehub-youtube-g2-actionable-review-queue',schemaVersion:1,
      privateArtifact:true,publicationPermitted:false,generatedAt:at,
      sourceVideoIds:3,accountedForVideos:3,missingVideos:0,
      publishedPlaylistLinks:1,pendingReview:2,newCanonicalMovies:1,
      independentVerifiedDEOffers:0,newUnverifiedDatabaseWrites:0,
      declaredClasses:{FREE:2,'R&B':1},
      lanes:{'ambiguous-work-identity':1,'missing-video-metadata':1},
      items:[entry('AAAAAAAAAA1','playlist-link-published'),
        entry('AAAAAAAAAA2','review-only'),entry('AAAAAAAAAA3','review-only')],
      prioritizedReview:[entry('AAAAAAAAAA2','review-only'),
        entry('AAAAAAAAAA3','review-only')],
    }
    const options={
      youtubeReviewQueue:queue,
      youtubeCompleteIntake:{uniqueVideoIds:3,processedVideoIds:3,
        unaccountedForVideoIds:0,playlistClasses:{FREE:2,'R&B':1}},
      youtubeCuratedHints:{sourceVideoIds:3,count:1},
      youtubeNewFilms:{sourceVideoIds:3,count:1},
      steps:{youtubeReviewQueue:'success'},
      run:{reportedAt:'2026-10-23T08:20:00.000Z'},
    }
    const find=props=>buildWorkflowSummary(props).rows
      .find(x=>x.area==='YouTube · offene Playlist-Prüfliste')
    const good=find(options)
    expect(good.status).toBe('✅ erfolgreich')
    expect(good.stock).toContain('3/3 Video-IDs erfasst · 2 zur Filmprüfung')
    expect(good.activity).toContain('1 redaktionelle Direktlinks · 1 neue TMDB-Filme')
    expect(good.open).toContain('1 mehrdeutige Werke')
    expect(JSON.stringify(good)).not.toContain('AAAAAAAAAA2')
    const bad=find({...options,youtubeReviewQueue:{...queue,pendingReview:1}})
    expect(bad.status).toContain('kein gültiger')
    expect(bad.stock).toContain('nicht nachgewiesen')
    const stale=find({...options,run:{reportedAt:'2026-10-26T12:00:00.000Z'}})
    expect(stale.status).toContain('kein gültiger')
    const absent=find({...options,youtubeReviewQueue:null})
    expect(absent.stock).toContain('nicht nachgewiesen')
  })

  it('does not claim 0 live offers on a missing, failed or stale source report',()=>{
    for(const [input,step] of [[null,'success'],[source,'failure'],
      [{...source,generatedAt:'2026-10-20T01:00:00Z'},'success']]){
      const y=summarizeYoutubeDeployment({status:input,routes,sourceStep:step,routeStep:'success',reportedAt:at})
      expect(y.source.stock).toBe('Quellenbestand nicht verfügbar')
      expect(y.source.status).not.toBe('✅ erfolgreich')
    }
    const missingSource=summarizeYoutubeDeployment({
      status:null,routes,sourceStep:'success',routeStep:'success',reportedAt:at,
    })
    expect(missingSource.routes.status).toBe('⚠️ Quellenabgleich nicht bestätigt')
    expect(missingSource.tmdbFirst.stock).toBe('TMDB-first-Verifikationsstand nicht verfügbar')
    const absent=summary(null,null,'failure','skipped')
    expect(absent.rows.find(r=>r.area==='YouTube · 2 Playlists').status).toContain('fehlgeschlagen')
    expect(absent.rows.find(r=>r.area==='YouTube · Direktlink-Freigabe').stock)
      .toBe('veröffentlichbare Filmrouten nicht verfügbar')
  })
  it('flags source-vs-route discrepancies instead of claiming a clean publication',()=>{
    const index={...routes,count:1,entries:[{
      key:'movie:1',verifiedVideoId:'0nBiidtN7ZU',target:'https://www.youtube.com/watch?v=0nBiidtN7ZU',
    }]}
    const y=summarizeYoutubeDeployment({status:source,routes:index,
      sourceStep:'success',routeStep:'success',reportedAt:at})
    expect(y.routes.status).toBe('⚠️ Zählabweichung zum Quellenlauf')
    expect(y.routes.open).toContain('Abweichung prüfen')
  })
  it('verifies the actually published YouTube report bytes, including valid empty route index',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'youtube-pub-report-'))
    try{
      await writeFile(join(directory,'youtube-curated-source-status.json'),JSON.stringify(source))
      await writeFile(join(directory,'youtube-verified-title-routes.json'),JSON.stringify(routes))
      const validFetch=async url=>({ok:true,json:async()=>url.pathname.includes('curated')
        ?structuredClone(source):structuredClone(routes)})
      expect(await verifyYoutubePublishedReports({
        directory,fetchImpl:validFetch,
      })).toEqual({directRoutes:0,sourceReportAvailable:true})
      const mismatch=async url=>({ok:true,json:async()=>url.pathname.includes('curated')
        ?{...source,inventoryVideoIds:11}:structuredClone(routes)})
      await expect(verifyYoutubePublishedReports({directory,fetchImpl:mismatch}))
        .rejects.toThrow('Published generation differs from build: youtube-curated-source-status.json')
      expect(await verifyYoutubePublishedReports({directory,prepared:true}))
        .toEqual({directRoutes:0,sourceReportAvailable:true})
    }finally{await rm(directory,{recursive:true,force:true})}
  })
  it('rejects a missing route manifest before deployment',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'youtube-pub-report-empty-'))
    try{
      await expect(verifyYoutubePublishedReports({directory,prepared:true}))
        .rejects.toThrow('YouTube-Routenmanifest im Build fehlt')
    }finally{await rm(directory,{recursive:true,force:true})}
  })
})
