export interface Position { xMeters: number; yMeters: number }
export interface MapBounds { min: Position; max: Position }
export interface MapLayer {
  id: string
  kind: 'imagery' | 'slope' | 'terrain-classification'
  url: string
  bounds: MapBounds
  coordinateSystemId: string
  attribution: string
  illustrative: boolean
}
export interface MissionLocation { id: string; name: string; position: Position }
export interface ScienceStop extends MissionLocation {
  observationObjective: string
  observationDurationSeconds: number
}
export interface Mission {
  schemaVersion: '1.0' | '1.1'
  datasetId: string
  dataMode: 'synthetic'
  notice: string
  coordinateSystem: {
    id: string; kind: 'local-cartesian'; units: 'metres'
    axes: { x: string; y: string }; origin: string
  }
  unverifiedGeographicReference: {
    latitudeDegrees: number; longitudeDegrees: number
    status: 'unverified-placeholder'; notice: string
  }
  base: MissionLocation
  stops: ScienceStop[]
  // Optional for older schema 1.0 responses, which derive bounds from positions.
  bounds?: MapBounds
  layers: MapLayer[]
  sources: never[]
}
