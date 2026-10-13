import { useState } from 'react'

export default function TitleDescription({ text }) {
  const [expanded, setExpanded] = useState(false)
  const long = text?.length > 420
  return <div className="detail-description-block">
    <h3>Handlung</h3>
    <p className={`detail-description${long && !expanded ? ' collapsed' : ''}`}>
      {text || 'Für diesen Titel liegt noch keine deutsche Beschreibung vor.'}
    </p>
    {long && <button type="button" className="detail-text-toggle" data-focusable="true"
      aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Weniger anzeigen' : 'Mehr lesen'}</button>}
  </div>
}
