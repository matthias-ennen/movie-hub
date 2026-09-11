import { providerIdForRowTitle } from '../settings/providerSelectionModel.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import PosterCard from './PosterCard.jsx'

export default function ContentRow({ title, items, onOpen, providerId = null }) {
  const { isProviderEnabled } = useProviderSelection()
  const resolvedProviderId = providerId || providerIdForRowTitle(title)

  if (resolvedProviderId && !isProviderEnabled(resolvedProviderId)) return null

  return (
    <section className="content-row">
      <div className="row-heading">
        <h2>{title}</h2>
        <span>{items.length} Titel</span>
      </div>
      <div className="poster-track">
        {items.map((item) => (
          <PosterCard item={item} onOpen={onOpen} key={item.id} />
        ))}
      </div>
    </section>
  )
}
