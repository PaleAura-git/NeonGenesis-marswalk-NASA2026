import L from 'leaflet'

/** Grid spacing in metres for a zoom level: a power of two that keeps lines at least 80 px apart. */
export function gridStepMeters(zoom: number): number {
  return 2 ** Math.ceil(Math.log2(80 / L.CRS.Simple.scale(zoom)))
}

// Draw in projected metres so grid lines stay anchored while panning and zooming.
// Lines only: labels are drawn once per view by GridLabels, not once per tile.
export class CoordinateGrid extends L.GridLayer {
  createTile(coords: L.Coords): HTMLElement {
    const tile = document.createElement('canvas')
    const size = this.getTileSize()
    tile.width = size.x
    tile.height = size.y
    const context = tile.getContext('2d')
    if (!context) return tile

    const stepPixels = gridStepMeters(coords.z) * L.CRS.Simple.scale(coords.z)
    const originX = coords.x * size.x
    const originY = coords.y * size.y
    context.strokeStyle = 'rgba(243, 233, 220, 0.12)'
    context.lineWidth = 1

    for (let x = Math.ceil(originX / stepPixels) * stepPixels; x < originX + size.x; x += stepPixels) {
      const localX = Math.round(x - originX) + 0.5
      context.beginPath()
      context.moveTo(localX, 0)
      context.lineTo(localX, size.y)
      context.stroke()
    }
    for (let y = Math.ceil(originY / stepPixels) * stepPixels; y < originY + size.y; y += stepPixels) {
      const localY = Math.round(y - originY) + 0.5
      context.beginPath()
      context.moveTo(0, localY)
      context.lineTo(size.x, localY)
      context.stroke()
    }
    return tile
  }
}
