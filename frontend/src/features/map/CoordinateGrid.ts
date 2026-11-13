import L from 'leaflet'

// Draw in projected metres so grid lines stay anchored while panning and zooming.
export class CoordinateGrid extends L.GridLayer {
  createTile(coords: L.Coords): HTMLElement {
    const tile = document.createElement('canvas')
    const size = this.getTileSize()
    tile.width = size.x
    tile.height = size.y
    const context = tile.getContext('2d')
    if (!context) return tile

    const scale = L.CRS.Simple.scale(coords.z)
    const stepMeters = 2 ** Math.ceil(Math.log2(80 / scale))
    const stepPixels = stepMeters * scale
    const originX = coords.x * size.x
    const originY = coords.y * size.y
    context.fillStyle = '#32251c'
    context.fillRect(0, 0, size.x, size.y)
    context.strokeStyle = '#73513760'
    context.fillStyle = '#bda38b'
    context.font = '11px system-ui, sans-serif'
    context.lineWidth = 1

    for (let x = Math.ceil(originX / stepPixels) * stepPixels; x < originX + size.x; x += stepPixels) {
      const localX = x - originX
      context.beginPath()
      context.moveTo(localX, 0)
      context.lineTo(localX, size.y)
      context.stroke()
      context.fillText(`x ${Math.round(x / scale)} m`, localX + 5, 14)
    }
    for (let y = Math.ceil(originY / stepPixels) * stepPixels; y < originY + size.y; y += stepPixels) {
      const localY = y - originY
      context.beginPath()
      context.moveTo(0, localY)
      context.lineTo(size.x, localY)
      context.stroke()
      context.fillText(`y ${Math.round(-y / scale)} m`, 5, localY + 14)
    }
    return tile
  }
}
