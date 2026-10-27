import { describe, it, expect } from 'vitest'
import { planCuratedTmdbQueries } from '../scripts/youtube-g2-curated-title-query-plan.mjs'

describe('G2 curated playlists: conservative observed title query repairs', () => {
  it('looks for the actual film Heat, not the promotional phrase "Heat in HD"', () => {
    const query = planCuratedTmdbQueries('Heat (ganzer Film auf Deutsch) in HD')
    expect(query.curatedQueryReason).toBe('remove-promotional-hd-suffix')
    expect(query.matchingTitle).toBe('Heat')
    expect(query.queries[0]).toBe('Heat')
    expect(query.queries).toContain('Heat in HD')
    expect(query.queries).toHaveLength(2)
  })
  it('recognizes a fixed collection label and preserves the explicit release year', () => {
    const query = planCuratedTmdbQueries(
      'Alte Deutsche Spielfilme ~ Knockin on Heaven s Door ~ 1997')
    expect(query).toMatchObject({
      matchingTitle:'Knockin on Heaven s Door (1997)',
      queries:['Knockin on Heaven s Door'],
      curatedQueryReason:'explicit-german-movie-collection-label-with-year',
    })
  })
  it('avoids the observed Rambo III false lead for the exact First Blood source title',()=>{
    const q=planCuratedTmdbQueries('Rambo - First Blood')
    expect(q).toMatchObject({
      rawTitle:'Rambo - First Blood',matchingTitle:'First Blood',
      queries:['First Blood'],
      curatedQueryReason:'first-blood-franchise-work-disambiguation',
    })
    expect(q.verifiedTmdbId).toBeUndefined()
    expect(q.playbackRoute).toBeUndefined()
    // Never strip actual franchise sequels or vaguely related publisher labels.
    for(const raw of ['Rambo: First Blood Part II','Rambo III',
      'Rambo - First Blood - Trailer','First Blood']){
      const other=planCuratedTmdbQueries(raw)
      expect(other.curatedQueryReason).not.toBe('first-blood-franchise-work-disambiguation')
    }
  })
  it('does not strip genuine title words or rewrite ordinary titles', () => {
    for (const raw of ['The Amateur', 'Terrified', 'Heat in HD', 'Heat (1995)']) {
      const p=planCuratedTmdbQueries(raw)
      expect(p.curatedQueryReason).toBeNull()
      expect(p.queries.length).toBeLessThanOrEqual(2)
    }
  })
  it.each([
    ['Wishmaster 2: Evil Never Dies FANTASY, HORROR Full Movie in English',
      'Wishmaster 2: Evil Never Dies', 'english-genre-and-full-movie-tail'],
    ['Stalingrad [1993] Ganzer FIlm mit Thomas Kretschmann, Jochen Nickel, Dominique Horwitz',
      'Stalingrad', 'explicit-source-year-and-cast-tail'],
    ['So Weit Die Füße Tragen (bewegender Abenteuerfilm und Kriegsdrama mit 7,3 IMDb-Bewertung)',
      'So Weit Die Füße Tragen', 'imdb-description-tail'],
    ['The Watcher Thriller mit Keanu Reeves Ganzer Film',
      'The Watcher', 'genre-actor-and-full-film-tail'],
    ['Nürnberg (2026)', 'Nuremberg', 'official-original-title-alias-release-year-review'],
  ])('repairs real 58-ID source searches without modifying video-title provenance: %s',
    (source, firstQuery, reason) => {
      const result = planCuratedTmdbQueries(source)
      expect(result.rawTitle).toBe(source)
      expect(result.queries[0]).toBe(firstQuery)
      expect(result.queries.length).toBeLessThanOrEqual(2)
      expect(result.curatedQueryReason).toBe(reason)
    })

  it.each([
    ['BASIC Kompletter Film Deutsch','BASIC','complete-film-deutsch-ad-tail'],
    ['Grandioser Survival-Thriller mit STARBESETZUNG: Transsiberian (2008) (HD)',
     'Transsiberian','survival-starbesetzung-year-hd-wrapper'],
  ])('repairs additional LIVE 62-ID FREE title wrapper without changing the source: %s',
    (source, expectedSearch, reason) => {
      const p=planCuratedTmdbQueries(source)
      expect(p.rawTitle).toBe(source)
      expect(p.queries).toEqual([expectedSearch])
      expect(p.curatedQueryReason).toBe(reason)
    })

  it('retains an explicit year for Transsiberian only as a review clue', () => {
    const p=planCuratedTmdbQueries(
      'Grandioser Survival-Thriller mit STARBESETZUNG: Transsiberian (2008) (HD)')
    expect(p.matchingTitle).toBe('Transsiberian (2008)')
  })

  it('treats the German 2026 theatrical year as provenance, NOT confirmed original-film release year', () => {
    const result = planCuratedTmdbQueries('Nürnberg (2026)')
    expect(result.matchingTitle).toBe('Nuremberg')
    expect(result.queries).toEqual(['Nuremberg', 'Nürnberg'])
    expect(result.reportedYear).toBe(2026)
  })

  it.each([
    ['So ein geiler Film mit Keanu Reeves: Street Kings (Ganzer Film in HD)',
      'Street Kings','actor-promo-colon-film-title'],
    ['STARBESETZUNG! Dieser Thriller lässt das Blut in den Adern gefrieren! (Ganzer Film: The Calling)',
      'The Calling','publisher-genre-promo-film-title-parentheses'],
    ['Die Zeit Maschine - 1960','Die Zeit Maschine','quoted-original-title-with-year'],
    ['JFK - TATORT DALLAS - Meisterwerk mit Kevin Costner - Ganzer Film bei Moviedome',
      'JFK - TATORT DALLAS','actor-promo-meisterwerk-moviedome'],
    ['Sleepy Hollow 1999 (Ungekürzte Fassung) Deutsch',
      'Sleepy Hollow','unverified-cut-language-promo-with-year'],
    ['Marvins Töchter 4K Leonardo DiCaprio & Meryl Streep Kostenloser Film in voller Länge',
      'Marvins Töchter','actors-4k-free-length-promo'],
    ['Ein Amerikanischer Werwolf in London HORROR Ganzer Film Film Komplett auf Deutsch',
      'Ein Amerikanischer Werwolf in London','genre-full-german-film-promo'],
    ['Der Außenseiter 4K Brendan Fraser & Matt Damon Ganzer Film auf Deutsch',
      'Der Außenseiter','actors-4k-german-full-film-promo'],
    ['Stephen Kings Stark Horrorfilm Ganzer Film',
      'Stephen Kings Stark','genre-horror-full-film-promo'],
    ['Dawn of the dead 1978 (Zombie) ganzer Film auf deutsch',
      'Dawn of the dead','year-zombie-full-german-promo'],
    ['Blair Witch Project (deutsch)',
      'Blair Witch Project','language-dub-parenthetical'],
    ['From Dusk Till Dawn ,1996 - Bootleg, Unradet, 100% iger Uncut, Deutsch',
      'From Dusk Till Dawn','explicit-bootleg-cut-and-year-review'],
  ])('recovers the film-title search from a live 86-ID YouTube publisher heading: %s',
    (title,expected,reason)=>{
      const plan=planCuratedTmdbQueries(title)
      expect(plan.rawTitle).toBe(title)
      expect(plan.curatedQueryReason).toBe(reason)
      expect(plan.queries[0]).toBe(expected)
      expect(plan.queries.length).toBeGreaterThan(0)
      expect(plan.queries.length).toBeLessThanOrEqual(2)
      expect(plan.verifiedTmdbId).toBeUndefined()
      expect(plan.playbackRoute).toBeUndefined()
    })

  it('uses years only as reported review context, preserves alternate query for German Time Machine',()=>{
    expect(planCuratedTmdbQueries('Die Zeit Maschine - 1960')).toMatchObject({
      matchingTitle:'Die Zeit Maschine (1960)',
      queries:['Die Zeit Maschine','Die Zeitmaschine'],
      reportedYear:1960,
    })
    expect(planCuratedTmdbQueries('Sleepy Hollow 1999 (Ungekürzte Fassung) Deutsch'))
      .toMatchObject({matchingTitle:'Sleepy Hollow (1999)',reportedYear:1999})
    expect(planCuratedTmdbQueries('Dawn of the dead 1978 (Zombie) ganzer Film auf deutsch'))
      .toMatchObject({matchingTitle:'Dawn of the dead (1978)',reportedYear:1978})
    expect(planCuratedTmdbQueries(
      'From Dusk Till Dawn ,1996 - Bootleg, Unradet, 100% iger Uncut, Deutsch'))
      .toMatchObject({matchingTitle:'From Dusk Till Dawn (1996)',reportedYear:1996})
  })

  it('uses real FREE playlist headings to search TMDB by film name only',()=>{
    const cases=[
      [
        "John Carpenter's Sie leben – ganzer Film auf Deutsch kostenlos schauen in HD",
        'Sie leben','director-billing-and-free-full-movie-promo',
      ],
      [
        'Vendetta - Alles was ihm blieb war Rache - mit Arnold Schwarzenegger - Ganzer Film kostenlos in HD',
        'Vendetta - Alles was ihm blieb war Rache',
        'actor-billing-and-free-hd-promo',
      ],
    ]
    for (const [source,title,reason] of cases) {
      const plan=planCuratedTmdbQueries(source)
      expect(plan).toMatchObject({
        rawTitle:source,matchingTitle:title,queries:[title],
        curatedQueryReason:reason,
      })
      expect(plan.verifiedTmdbId).toBeUndefined()
      expect(plan.playbackRoute).toBeUndefined()
      expect(plan.queries).toHaveLength(1)
    }
  })
  it('does not strip genuine director billing, actor names or ambiguous close titles',()=>{
    for (const source of [
      "John Carpenter's The Thing",
      "John Carpenter's Sie leben – Trailer",
      "John Carpenter's Sie leben – ganzer Film auf Deutsch kostenlos schauen",
      "Alfred Hitchcock's Psycho",
      'Vendetta - Alles was ihm blieb war Rache',
      'Vendetta - mit Arnold Schwarzenegger - Trailer',
      'Vendetta - mit Arnold Schwarzenegger - Ganzer Film kostenlos in SD',
    ]) {
      const plan=planCuratedTmdbQueries(source)
      expect(['director-billing-and-free-full-movie-promo',
        'actor-billing-and-free-hd-promo']).not.toContain(plan.curatedQueryReason)
    }
  })

  it('recovers Faculty and The Cavern from two real FREE playlist promo headings',()=>{
    const cases=[
      [
        'Faculty - Trau keinem Lehrer! 4K Amerikanischer Science Fiction Film',
        'Faculty - Trau keinem Lehrer!',
        ['Faculty - Trau keinem Lehrer!', 'The Faculty'],
        'faculty-4k-science-fiction-promo',
      ],
      [
        'Abstieg ins Grauen - The Cavern (2006) Ganzer Film auf Deutsch',
        'The Cavern',
        ['The Cavern', 'Abstieg ins Grauen'],
        'cavern-german-original-dual-title-promo',
      ],
    ]
    for(const [raw,matchingTitle,queries,curatedQueryReason] of cases){
      const result=planCuratedTmdbQueries(raw)
      expect(result).toMatchObject({
        rawTitle:raw,matchingTitle,queries,curatedQueryReason,
      })
      expect(result.verifiedTmdbId).toBeUndefined()
      expect(result.playbackRoute).toBeUndefined()
      expect(result.queries).toHaveLength(2)
    }
  })
  it('does not rewrite nearby film or trailer headlines as these two known sources',()=>{
    for(const raw of [
      'Faculty - Trau keinem Lehrer!',
      'Faculty - Trau keinem Lehrer! Trailer',
      'The Faculty (1998)',
      'Faculty - Trau keinem Lehrer! 4K Science Fiction Film',
      'Abstieg ins Grauen - The Cavern (2006) Trailer auf Deutsch',
      'Abstieg ins Grauen - The Cavern',
      'The Cavern (2006)',
      'Abstieg ins Grauen - The Cavern (2007) Ganzer Film auf Deutsch',
    ]){
      const output=planCuratedTmdbQueries(raw)
      expect([
        'faculty-4k-science-fiction-promo',
        'cavern-german-original-dual-title-promo',
      ]).not.toContain(output.curatedQueryReason)
    }
  })

  it('does not strip movie titles and arbitrary cast/genre words without an observed wrapper',()=>{
    for (const title of [
      'The Calling', 'The Time Machine (1960)', 'Dawn of the Dead',
      'So ein geiler Film mit Keanu Reeves', 'The Calling (Ganzer Film)',
      'JFK - Tatort Dallas', 'Sleepy Hollow 2',
      'From Dusk Till Dawn', 'Stephen Kings Stark',
      'The Amateur', 'The Crow - Die Krähe Ganzer Film Deutsch 18+',
    ]){
      expect(planCuratedTmdbQueries(title).curatedQueryReason).toBeNull()
    }
  })

  it('keeps already clean full titles, short ambiguous titles and lookalikes untouched', () => {
    for (const raw of [
      'Wishmaster 2: Evil Never Dies', 'Stalingrad (1993)',
      'So Weit Die Füße Tragen', 'The Watcher',
      'Nürnberg', 'IT', 'Full Movie in English',
      'The Watcher of the Woods', 'Stalingrad [1993] Preview',
      'Basic Instinct', 'Basic', 'Transsiberian (2008)',
      'Survival-Thriller mit STARBESETZUNG: Transsiberian',
      'The Crow - Die Krähe Ganzer Film Deutsch 18+',
    ]) {
      const plan = planCuratedTmdbQueries(raw)
      expect(plan.rawTitle).toBe(raw)
      expect(plan.curatedQueryReason).toBeNull()
    }
    expect(planCuratedTmdbQueries('IT').queries).toEqual([])
  })

  it('rejects ambiguous collection-like strings without a complete year', () => {
    const p=planCuratedTmdbQueries('Alte Deutsche Spielfilme ~ Something ~ 19')
    expect(p.curatedQueryReason).toBeNull()
  })
})
