import { describe,it,expect } from 'vitest'
import { explicitNamedActor, applyExplicitCastGuard } from '../scripts/youtube-g2-curated-cast-evidence.mjs'

const wrong = {tmdbId:894169,score:40,titleLevel:4,runtimeDelta:2.9}
const correct = {tmdbId:390051,score:22,titleLevel:2,runtimeDelta:3.9}
const films = [
  {id:894169,credits:{cast:[{name:'Bruce Willis'},{name:'Clive Standen'}]}},
  {id:390051,credits:{cast:[{name:'Arnold Schwarzenegger'},{name:'Scoot McNairy'}]}},
]
describe('YouTube G2 explicit source-actor evidence (research only)',()=>{
  it('extracts only strict explicit two-word actor billing',()=>{
    expect(explicitNamedActor('Vendetta - mit Arnold Schwarzenegger - Ganzer Film'))
      .toBe('Arnold Schwarzenegger')
    expect(explicitNamedActor('American Evil - Film mit Bradley Cooper, ganzer Film'))
      .toBe('Bradley Cooper')
    expect(explicitNamedActor('Terrified')).toBeNull()
  })
  it('demotes a false leading same-named Vendetta and keeps evidence unverified',()=>{
    const out=applyExplicitCastGuard(
      'Vendetta - Alles was ihm blieb war Rache - mit Arnold Schwarzenegger - Ganzer Film',
      [wrong,correct],films)
    expect(out.evidence).toMatchObject({
      explicitActor:'Arnold Schwarzenegger',
      actorCreditEvidence:'matched-a-tmdb-credit-list',
      creditedMovieIds:[390051], affectsRanking:true,
    })
    expect([...out.scores].sort((a,b)=>b.score-a.score)[0].tmdbId).toBe(390051)
    expect(out.scores.find(x=>x.tmdbId===894169).score).toBe(20)
    expect(out.scores.find(x=>x.tmdbId===390051).score).toBe(34)
    expect(out.scores.every(x=>x.confirmedFilm!==true)).toBe(true)
  })
  it('never manufactures cast corroboration when nothing matches',()=>{
    const original=[{tmdbId:894169,score:40}]
    const out=applyExplicitCastGuard(
      'Film mit Arnold Schwarzenegger',original,[films[0]])
    expect(out.evidence).toMatchObject({
      actorCreditEvidence:'not-corroborated-in-candidates',affectsRanking:false,
      creditedMovieIds:[],
    })
    expect(out.scores).toEqual(original)
  })
  it('does not change a clean, actor-free matched title',()=>{
    const out=applyExplicitCastGuard('Terrified',[wrong,correct],films)
    expect(out.scores).toEqual([wrong,correct])
    expect(out.evidence.actorCreditEvidence).toBe('none')
  })
})
