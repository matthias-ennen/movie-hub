import { useSharedMediaCatalog } from '../library/useSharedMediaCatalog.js'
import { providerIdForRowTitle } from '../settings/providerSelectionModel.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import PosterCard from './PosterCard.jsx'

export default function ContentRow({ title, items, onOpen, providerId = null, variant = 'standard' }) {
  const { isProviderEnabled } = useProviderSelection()
  const { hasTitle: hasMovieHubTitle } = useSharedMediaCatalog()
  const resolvedProviderId = providerId || providerIdForRowTitle(title)
  const movieHubEnabled = isProviderEnabled('moviehub')

  if (resolvedProviderId && !isProviderEnabled(resolvedProviderId)) return null

  const topTen = variant === 'top-ten'

  return (
    <section className={topTen ? 'content-row top-ten-row' : 'content-row'}>
      <div className="row-heading">
        <h2>{title}</h2>
        <span>{items.length} Titel</span>
      </div>
      <div className={topTen ? 'poster-track top-ten-track' : 'poster-track'}>
        {items.map((item, index) => (
          <PosterCard
            item={item}
            onOpen={onOpen}
            key={item.id}
            rank={topTen ? index + 1 : null}
            hasMovieHub={movieHubEnabled && hasMovieHubTitle(item)}
          />
        ))}
      </div>
    </section>
  )
}
