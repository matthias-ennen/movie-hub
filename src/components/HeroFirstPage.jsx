import { useHeroFirstPage } from '../hooks/useHeroFirstPage.js'
import Hero from './Hero.jsx'

function pageClassName(className) {
  return ['hero-first-page', className].filter(Boolean).join(' ')
}

/**
 * Gemeinsamer Seitenrahmen für alle Inhaltsseiten.
 *
 * Der Hero wird immer unabhängig vom nachgelagerten Seiteninhalt montiert.
 * Erst seine Bereitschaft gibt Posterreihen und weitere progressive Inhalte
 * frei. Datenquellen dürfen ihren Bereitschaftsstatus über readyEnabled
 * zusätzlich absichern, ohne einen eigenen Seiten-Ladepfad aufzubauen.
 */
export default function HeroFirstPage({
  pageId,
  className = '',
  heroItems = [],
  heroEyebrow,
  readyEnabled = true,
  activationRequest = null,
  onActivationUnavailable,
  onOpen,
  children,
}) {
  const { heroReady, handleHeroReady } = useHeroFirstPage(pageId)

  return (
    <main
      className={pageClassName(className)}
      data-content-page={pageId}
      data-page-load-state={heroReady ? 'rows' : 'hero'}
    >
      <Hero
        items={heroItems}
        onOpen={onOpen}
        eyebrow={heroEyebrow}
        onReady={readyEnabled ? handleHeroReady : undefined}
        activationRequest={activationRequest}
        activationAvailabilitySettled={readyEnabled}
        onActivationUnavailable={onActivationUnavailable}
      />
      {typeof children === 'function' ? children({ heroReady }) : children}
    </main>
  )
}
