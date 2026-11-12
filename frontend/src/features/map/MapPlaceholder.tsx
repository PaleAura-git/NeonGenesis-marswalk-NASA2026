export function MapPlaceholder() {
  return <section className="panel map-placeholder" aria-labelledby="map-title">
    <div><p className="eyebrow">Terrain workspace</p><h2 id="map-title">A landscape to explore.</h2></div>
    <div className="map-symbol" aria-hidden="true">＋</div>
    <div><p>Map integration is next.</p><p className="muted">Terrain imagery, layers, and calculated routes will appear here.</p></div>
    <span className="map-label">Placeholder · No geographic placement</span>
  </section>
}
