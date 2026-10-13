export default function DetailCard({ id, title, context, aside, className = '', busy = false, children }) {
  return <section className={`detail-card ${className}`} aria-labelledby={id} aria-busy={busy || undefined}>
    <div className="detail-card-heading">
      <div>
        {context && <p className="detail-card-context">{context}</p>}
        <h3 id={id}>{title}</h3>
      </div>
      {aside}
    </div>
    {children}
  </section>
}
