import { resolveArtworkUrl } from '../../catalog/artworkRotation.js'
import { resolveProviderPresentation } from '../../providers/providerPresentation.js'
import { providers } from '../../data/catalog.js'
import ProviderBadges from '../ProviderBadges.jsx'
import DetailDialog from './DetailDialog.jsx'
import { DialogHeading } from './DetailActions.jsx'

export default function CollectionPicker({ filmCollection, collectionParts, currentCollectionIndex,
  item, artworkOptions, getTitleState, isProviderEnabled, collectionBusyId, selectCollectionPart, onClose }) {
  return <DetailDialog className="media-panel collection-panel" labelledBy="collection-picker-heading"
    onClose={onClose} busy={Boolean(collectionBusyId)} initialFocus='[data-collection-initial="true"]'>
    <DialogHeading id="collection-picker-heading" subtitle="Nach Veröffentlichung" onClose={onClose}>{filmCollection.name}</DialogHeading>
            <div className="collection-part-grid" aria-label={`Alle Teile von ${filmCollection.name}`}>
              {collectionParts.map((part, index) => {
                const isCurrent = Number(part.tmdbId) === Number(item.tmdbId)
                const watched = getTitleState(part).watched
                const partPosterUrl = resolveArtworkUrl(part, artworkOptions)
                const partProviderPresentation = resolveProviderPresentation(part, {
                  context: 'title',
                  hasMovieHub: part.movieHubCatalog === true || part.providerIds?.includes('moviehub'),
                })
                const movieHubAvailable = partProviderPresentation.includeMovieHub && isProviderEnabled('moviehub')
                const automaticProviderIds = partProviderPresentation.providerIds
                  .filter((providerId) => Boolean(providers[providerId]))
                const hasAvailability = movieHubAvailable || automaticProviderIds.length > 0
                return (
                  <button
                    type="button"
                    key={part.id}
                    className={isCurrent ? 'collection-part-card current' : 'collection-part-card'}
                    data-focusable="true"
                    data-collection-initial={isCurrent || (currentCollectionIndex < 0 && index === 0) ? 'true' : undefined}
                    aria-current={isCurrent ? 'true' : undefined}
                    aria-disabled={Boolean(collectionBusyId)}
                    aria-label={`${part.title}${part.year ? ` (${part.year})` : ''}${isCurrent ? ', aktuell geöffnet' : ''}${watched ? ', gesehen' : ''}`}
                    onClick={() => selectCollectionPart(part)}
                  >
                    <span
                      className={partPosterUrl ? 'collection-part-art has-image' : 'collection-part-art'}
                      style={{ '--poster-accent': part.accent, '--poster-accent-2': part.accent2 }}
                    >
                      {partPosterUrl && <img src={partPosterUrl} alt="" loading="lazy" />}
                      <span className="collection-part-number">{index + 1}</span>
                      <span className="collection-part-statuses">
                        {isCurrent && <span>Aktuell</span>}
                        {watched && <span className="watched">✓ Gesehen</span>}
                      </span>
                      {hasAvailability && (
                        <ProviderBadges
                          providerIds={automaticProviderIds}
                          includeMovieHub={movieHubAvailable}
                          maxVisible={3}
                        />
                      )}
                    </span>
                    <span className="collection-part-copy">
                      <strong>{part.title}</strong>
                      <small>{part.year || 'Jahr unbekannt'}</small>
                      <small className={hasAvailability ? 'available' : 'unavailable'}>
                        {hasAvailability ? 'Bei deinen Anbietern verfügbar' : 'Derzeit nicht bei deinen Anbietern'}
                      </small>
                    </span>
                    {collectionBusyId === part.id && <span className="collection-part-loading">Details werden geladen …</span>}
                  </button>
                )
              })}
            </div>

  </DetailDialog>
}
