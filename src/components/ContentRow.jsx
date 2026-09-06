import PosterCard from './PosterCard.jsx'

export default function ContentRow({ title, items, onOpen }) {
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
