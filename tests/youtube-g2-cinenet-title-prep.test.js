import {describe,it,expect} from 'vitest'
import {prepareYouTubeMovieSearchTitle as prepare} from '../scripts/youtube-g2-title-query-prep.mjs'

// Real title-pattern regressions from the successful 125-ID G2 Actions report
// #39754462653. No API call, no YouTube data import, no frozen matcher change.
const CINENET_CASES = [
 ['Iron Soldier (2011) [Action] [Sci-Fi] Die ultimative Kampfmaschine Ganzer Film auf Deutsch','Iron Soldier (2011)','Iron Soldier'],
 ['Cheerleaders Wild Weekend (1979) [Komödie] Wildes Entführungs-Chaos Ganzer Film auf Deutsch','Cheerleaders Wild Weekend (1979)','Cheerleaders Wild Weekend'],
 ['Die Schöne und das Biest 2 (2012) [Komödie] [Romantik] Mischa Barton Ganzer Film auf Deutsch','Die Schöne und das Biest 2 (2012)','Die Schöne und das Biest 2'],
 ['Battle of the Undead (2022) [Adventure] [Action] Ancient Tomb Exploration Full Movie','Battle of the Undead (2022)','Battle of the Undead'],
 ['Vampire Twilight (2006) [Horror] Düsteres Vampir-Ritual Ganzer Film auf Deutsch','Vampire Twilight (2006)','Vampire Twilight'],
 ['Deadly Species (2002) [Abenteuer] [Horror] Tödliches Urwald-Monster Ganzer Film auf Deutsch','Deadly Species (2002)','Deadly Species'],
 ['Vollmacht zum Mord (1975) [Thriller] Ava Gardner im Spionage-Thriller Ganzer Film auf Deutsch','Vollmacht zum Mord (1975)','Vollmacht zum Mord'],
 ['King of Comedy (1999) [Eastern] [Komödie] Stephen Chows Kult-Klassiker Ganzer Film auf Deutsch','King of Comedy (1999)','King of Comedy'],
 ['Exorcist 3 – The Song of Solomon (2017) [Horror] Extrem-Exorzismus Ganzer Film auf Deutsch','Exorcist 3 – The Song of Solomon (2017)','Exorcist 3 – The Song of Solomon'],
 ['Scream at the Devil (2015) [Horror] [Mystery] Teuflischer Albtraum Ganzer Film auf Deutsch','Scream at the Devil (2015)','Scream at the Devil'],
 ['Dracula Reborn (2012) [Horror] Vampir-Schrecken im modernen Gewand Ganzer Film auf Deutsch','Dracula Reborn (2012)','Dracula Reborn'],
 ['Sharknado - More Sharks, More Nado! - 10th Anniversary (2023) [Horror] [Komödie] Hai-Kult in 4K!','Sharknado - More Sharks, More Nado! - 10th Anniversary (2023)','Sharknado - More Sharks, More Nado! - 10th Anniversary'],
 ['The Demon - Der Teuflische (1981) [Horror] Maskierter Killer auf Jagd Ganzer Film auf Deutsch','The Demon - Der Teuflische (1981)','The Demon - Der Teuflische'],
 ['The Curse of El Charro (2005) [Horror] [Slasher] Blutiger Mythen-Terror Ganzer Film auf Deutsch','The Curse of El Charro (2005)','The Curse of El Charro'],
 ['Zeugenschutzprogramm (1984) [Eastern] [Komödie] Gastauftritt Jackie Chan Ganzer Film auf Deutsch','Zeugenschutzprogramm (1984)','Zeugenschutzprogramm'],
]
describe('G2 CiNENET 125-ID live-regression: bracketed genre + advertising',()=>{
 it.each(CINENET_CASES)('retains source year for matcher and strips genre/SEO from TMDB query: %s',(original,title,search)=>{
  const result=prepare(original)
  expect(result.rawTitle).toBe(original)
  expect(result.matchingTitle).toBe(title)
  expect(result.queries[0]).toBe(search)
  expect(result.removed).toContain('publisher-bracketed-genre-and-marketing-suffix')
  expect(result.queries.length).toBeLessThanOrEqual(2)
 })
 it('preserves safe alternate film-title segment and original release year',()=>{
  const result=prepare('The Demon - Der Teuflische (1981) [Horror] Ganzer Film auf Deutsch')
  expect(result.matchingTitle).toBe('The Demon - Der Teuflische (1981)')
  expect(result.queries).toEqual(['The Demon - Der Teuflische','The Demon'])
 })
 it('never strips real [OV]/cut labels, bracketed director names or genuine number-first titles',()=>{
  for(const title of [
   '2010: The Year We Make Contact (1984)',
   'Film [OV] (1984)',
   "Film [Director's Cut] (1997)",
   'The Movie [Film Festival Award] (1984)',
   'Alien 3 [Filmversion 1992]',
  ]){
   const r=prepare(title)
   expect(r.matchingTitle).toBe(title)
   expect(r.queries[0]).toBe(title)
   expect(r.removed).not.toContain('publisher-bracketed-genre-and-marketing-suffix')
  }
 })
 it('keeps tested Netzkino-style queries unchanged, including sequels',()=>{
  expect(prepare('Presidio (ACTION THRILLER mit SEAN CONNERY Filme Deutsch komplett)').queries[0])
    .toBe('Presidio')
  expect(prepare('UND WIEDER 48 STUNDEN – EDDIE MURPHY & NICK NOLTE sind zurück! (Action Komödie ganzer Film Deutsch)').queries[0])
    .toBe('UND WIEDER 48 STUNDEN')
  expect(prepare('Freitag der 13. - Jason kehrt zurück (TEIL 2 der KULT HORRORFILM REIHE, Horrorfilme in voller Länge)').queries[0])
    .toBe('Freitag der 13. - Jason kehrt zurück')
 })
})
