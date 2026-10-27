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
    for (const raw of ['The Amateur', 'Terrified', 'Heat in HD']) {
      const p=planCuratedTmdbQueries(raw)
      expect(p.curatedQueryReason).toBeNull()
      expect(p.queries.length).toBeLessThanOrEqual(2)
    }
  })
  it.each([
    ['Friday the 13th (1980)','Friday the 13th',1980],
    ['The Thing (1982)','The Thing',1982],
    ['The Time Machine (1960)','The Time Machine',1960],
  ])('searches film %s without its terminal year, keeping the year for mismatch checks',
    (raw,title,year)=>{
      const out=planCuratedTmdbQueries(raw)
      expect(out).toMatchObject({
        rawTitle:raw,matchingTitle:title+' ('+year+')',
        queries:[title],reportedYear:year,
        curatedQueryReason:'terminal-parenthesized-movie-year',
      })
      expect(out.verifiedTmdbId).toBeUndefined()
      expect(out.playbackRoute).toBeUndefined()
    })

  it('never strips unknown years, movie excerpts or single-word ambiguity',()=>{
    for(const raw of [
      'IT (2017)','Basic (2003)','Heat (1995)',
      'Stalingrad (1993)','Transsiberian (2008)',
      'Friday the 13th Trailer (1980)',
      'Friday the 13th (1980) Trailer',
      'Friday the 13th (1880)',
      'Friday the 13th (1980) Uncut',
      'Friday the 13th Part 2',
    ]){
      expect(planCuratedTmdbQueries(raw).curatedQueryReason)
        .not.toBe('terminal-parenthesized-movie-year')
    }
    // Existing special-case aliases must keep their original stronger plan.
    expect(planCuratedTmdbQueries('Nürnberg (2026)').curatedQueryReason)
      .toBe('official-original-title-alias-release-year-review')
    expect(planCuratedTmdbQueries('Die Jagd (2012)').curatedQueryReason)
      .toBe('the-hunt-2012-original-title')
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
    ['Die Zeit Maschine - 1960','The Time Machine','time-machine-1960-original-title'],
    ['JFK - TATORT DALLAS - Meisterwerk mit Kevin Costner - Ganzer Film bei Moviedome',
      'JFK - TATORT DALLAS','actor-promo-meisterwerk-moviedome'],
    ['Sleepy Hollow 1999 (Ungekürzte Fassung) Deutsch',
      'Sleepy Hollow','unverified-cut-language-promo-with-year'],
    ['Marvins Töchter 4K Leonardo DiCaprio & Meryl Streep Kostenloser Film in voller Länge',
      'Marvins Töchter','actors-4k-free-length-promo'],
    ['Ein Amerikanischer Werwolf in London HORROR Ganzer Film Film Komplett auf Deutsch',
      'An American Werewolf in London','american-werewolf-original-title'],
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
      matchingTitle:'The Time Machine (1960)',
      queries:['The Time Machine','Die Zeitmaschine'],
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

  it('matches two exact 1960/2012 playlist films by their independently known original titles',()=>{
    const cases=[
      ['Die Zeit Maschine - 1960','The Time Machine (1960)',
        ['The Time Machine','Die Zeitmaschine'],1960,
        'time-machine-1960-original-title'],
      ['Die Jagd (2012)','Jagten (2012)',
        ['Jagten','The Hunt'],2012,
        'the-hunt-2012-original-title'],
    ]
    for(const [source,matchingTitle,queries,year,curatedQueryReason] of cases){
      const result=planCuratedTmdbQueries(source)
      expect(result).toMatchObject({
        rawTitle:source,matchingTitle,queries,
        reportedYear:year,curatedQueryReason,
      })
      expect(result.queries).toHaveLength(2)
      expect(result.verifiedTmdbId).toBeUndefined()
      expect(result.playbackRoute).toBeUndefined()
    }
  })
  it('does not rewrite a remake, trailer, generic title or another source year',()=>{
    for(const source of [
      'Die Zeit Maschine - 2002',
      'Die Zeitmaschine (1960)',
      'Die Zeit Maschine - 1960 Trailer',
      'The Time Machine - 1960',
      'Die Jagd (2013)',
      'Die Jagd (2012) Trailer',
      'Die Jagd',
      'Jagten (2012)',
    ]){
      const result=planCuratedTmdbQueries(source)
      expect(['time-machine-1960-original-title',
        'the-hunt-2012-original-title']).not.toContain(result.curatedQueryReason)
    }
  })

  it.each([
    [
      'Bud Spencer - Aladin (1986) - Deutsch - HD 1080p',
      'Superfantagenio (1986)', ['Superfantagenio','Aladin'],
      'bud-spencer-aladin-original-title', 1986,
    ],
    [
      'Ein Amerikanischer Werwolf in London HORROR Ganzer Film Film Komplett auf Deutsch',
      'An American Werewolf in London',
      ['An American Werewolf in London','Ein Amerikanischer Werwolf in London'],
      'american-werewolf-original-title', null,
    ],
    [
      'O grande dragão branco (Bloodsport)', 'Bloodsport', ['Bloodsport'],
      'bloodsport-parenthesized-original-title', null,
    ],
    [
      'Freitag der 13. – Ein neuer Anfang (TEIL 5 der KULT HORRORFILM REIHE, Horrorfilme in voller Länge)',
      'Friday the 13th: A New Beginning',
      ['Friday the 13th: A New Beginning','Freitag der 13. – Ein neuer Anfang'],
      'friday-thirteenth-part-five-original-title', null,
    ],
    [
      'Freitag der 13. - Das letzte Kapitel (TEIL 4 der KULT HORRORFILM REIHE, Horrorfilme in voller Länge)',
      'Friday the 13th: The Final Chapter',
      ['Friday the 13th: The Final Chapter','Freitag der 13. - Das letzte Kapitel'],
      'friday-thirteenth-part-four-original-title', null,
    ],
    [
      'Die Tribute von Panem - The Ballad of Songbirds & Snakes',
      'The Hunger Games: The Ballad of Songbirds & Snakes',
      ['The Hunger Games: The Ballad of Songbirds & Snakes',
       'Die Tribute von Panem - The Ballad of Songbirds & Snakes'],
      'songbirds-snakes-original-franchise-title', null,
    ],
  ])('recovers an exact film name from a known playlist publisher title: %s',
    (source,matchingTitle,queries,reason,reportedYear)=>{
      const result=planCuratedTmdbQueries(source)
      expect(result).toMatchObject({
        rawTitle:source,matchingTitle,queries,
        curatedQueryReason:reason,reportedYear,
      })
      expect(result.queries.length).toBeGreaterThan(0)
      expect(result.queries.length).toBeLessThanOrEqual(2)
      expect(result.verifiedTmdbId).toBeUndefined()
      expect(result.playbackRoute).toBeUndefined()
    })

  it('never broadens the six exact source aliases to trailers, other parts or remakes',()=>{
    for(const raw of [
      'Bud Spencer - Aladin (1987) - Deutsch - HD 1080p',
      'Bud Spencer - Aladin (1986) - Trailer',
      'Aladin (1986)',
      'Ein Amerikanischer Werwolf in London Trailer',
      'Ein Amerikanischer Werwolf in Paris',
      'O grande dragão branco (Bloodsport 2)',
      'Bloodsport',
      'Freitag der 13. – Ein neuer Anfang Trailer',
      'Freitag der 13. – Ein neuer Anfang (TEIL 4 der KULT HORRORFILM REIHE, Horrorfilme in voller Länge)',
      'Freitag der 13. - Das letzte Kapitel (TEIL 5 der KULT HORRORFILM REIHE, Horrorfilme in voller Länge)',
      'Die Tribute von Panem - The Ballad of Songbirds & Snakes Trailer',
      'Die Tribute von Panem - Mockingjay',
    ]) {
      const result=planCuratedTmdbQueries(raw)
      expect([
        'bud-spencer-aladin-original-title',
        'american-werewolf-original-title',
        'bloodsport-parenthesized-original-title',
        'friday-thirteenth-part-five-original-title',
        'friday-thirteenth-part-four-original-title',
        'songbirds-snakes-original-franchise-title',
      ]).not.toContain(result.curatedQueryReason)
      expect(result.rawTitle).toBe(raw)
    }
  })

  it('does not strip movie titles and arbitrary cast/genre words without an observed wrapper',()=>{
    for (const title of [
      'The Calling', 'Dawn of the Dead',
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
      'Wishmaster 2: Evil Never Dies',
      'So Weit Die Füße Tragen', 'The Watcher',
      'Nürnberg', 'IT', 'Full Movie in English',
      'The Watcher of the Woods', 'Stalingrad [1993] Preview',
      'Basic Instinct', 'Basic',
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
