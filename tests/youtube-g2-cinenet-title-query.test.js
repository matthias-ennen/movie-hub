import {describe,it,expect} from 'vitest'
import {prepareYouTubeMovieSearchTitle} from '../scripts/youtube-g2-title-query-prep.mjs'
import {scoreCandidate,classifyVideo} from '../scripts/youtube-g1-matcher-v1.mjs'

const sourceCases=[
 ['The Demon - Der Teuflische (1981) [Horror] Maskierter Killer auf Jagd Ganzer Film auf Deutsch','The Demon - Der Teuflische',1981],
 ['Iron Soldier (2011) [Action] [Sci-Fi] Die ultimative Kampfmaschine Ganzer Film auf Deutsch','Iron Soldier',2011],
 ['Cheerleaders Wild Weekend (1979) [Komödie] Wildes Entführungs-Chaos Ganzer Film auf Deutsch','Cheerleaders Wild Weekend',1979],
 ['Die Schöne und das Biest 2 (2012) [Komödie] [Romantik] Mischa Barton Ganzer Film auf Deutsch','Die Schöne und das Biest 2',2012],
 ['Battle of the Undead (2022) [Adventure] [Action] Ancient Tomb Exploration Full Movie','Battle of the Undead',2022],
 ['King of Comedy (1999) [Eastern] [Komödie] Stephen Chows Kult-Klassiker Ganzer Film auf Deutsch','King of Comedy',1999],
 ['Vollmacht zum Mord (1975) [Thriller] Ava Gardner im Spionage-Thriller Ganzer Film auf Deutsch','Vollmacht zum Mord',1975],
 ['Sharknado - More Sharks, More Nado! - 10th Anniversary (2023) [Horror] [Komödie] Hai-Kult in 4K!','Sharknado - More Sharks, More Nado! - 10th Anniversary',2023],
 ['Deadly Species (2002) [Abenteuer] [Horror] Tödliches Urwald-Monster Ganzer Film auf Deutsch','Deadly Species',2002],
 ['Exorcist 3 – The Song of Solomon (2017) [Horror] Extrem-Exorzismus Ganzer Film auf Deutsch','Exorcist 3 – The Song of Solomon',2017],
 ['Die Spur der zweiten Frau (1986) [Thriller] [Krimi] Verwirrspiel im Idyll Ganzer Film','Die Spur der zweiten Frau',1986],
 ['The Curse of El Charro (2005) [Horror] [Slasher] Blutiger Mythen-Terror Ganzer Film auf Deutsch','The Curse of El Charro',2005],
 ['Ohne Jeden Zweifel (1980) [Thriller] [Drama] True-Crime-Justizskandal Ganzer Film auf Deutsch','Ohne Jeden Zweifel',1980],
 ['Scream at the Devil (2015) [Horror] [Mystery] Teuflischer Albtraum Ganzer Film auf Deutsch','Scream at the Devil',2015],
]
describe('G2: CiNENET release-year + square-bracket genre + SEO-title normalization',()=>{
 it.each(sourceCases)('extracts exact TMDB film query from %s', (raw,title,year)=>{
  const p=prepareYouTubeMovieSearchTitle(raw)
  expect(p.rawTitle).toBe(raw)
  expect(p.queries[0]).toBe(title)
  expect(p.matchingTitle).toBe(title+' ('+year+')')
  expect(p.yearHint).toBe(year)
  expect(p.removed).toContain('source-year-genre-promotion-tail')
  expect(p.queries.length).toBeGreaterThanOrEqual(1)
  expect(p.queries.length).toBeLessThanOrEqual(2)
 })
 it('preserves authored film title/sequel/year when no genre-promotion sequence exists',()=>{
  for(const s of [
   '2010: The Year We Make Contact',
   'Dracula (1931)',
   'Film (1984) [Director’s Cut]',
   'Beauty and the Beast (2017) [Extended Edition]',
   'Friday the 13th Part II',
  ]){
   const p=prepareYouTubeMovieSearchTitle(s)
   expect(p.removed).not.toContain('source-year-genre-promotion-tail')
   expect(p.queries[0]).toBe(s)
  }
 })
 it('keeps explicit source year in matcher v1 input even though TMDB search excludes the year',()=>{
  const p=prepareYouTubeMovieSearchTitle(sourceCases[0][0])
  const oldFilm={id:155,title:'The Demon - Der Teuflische',original_title:'The Demon',
   runtime:88,release_date:'2023-01-01',
   alternative_titles:{titles:[]},credits:{crew:[]}}
  const video={title:p.matchingTitle,minutes:88,category:'30',region:'unknown'}
  const scored=scoreCandidate(video,oldFilm)
  expect(scored.yearHint).toBe(1981)
  expect(scored.yearMismatch).toBe(true)
  const verdict=classifyVideo(video,[scored],[],{asOfYear:2026})
  expect(verdict.status).toBe('review-explicit-year-conflict')
 })
})
