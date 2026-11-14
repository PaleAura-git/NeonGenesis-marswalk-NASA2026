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
export interface GeographicReference {
  latitudeDegrees: number; longitudeDegrees: number
  status: 'unverified-placeholder' | 'verified'; notice: string
}
export interface DataSource {
  layer: string
  mission?: string
  instrument?: string
  resolution_m?: number
  file?: string
  source: string
  note?: string
}
export interface Mission {
  schemaVersion: '1.0' | '1.1'
  datasetId: string
  dataMode: 'synthetic' | 'real'
  notice: string
  coordinateSystem: {
    id: string; kind: 'local-cartesian'; units: 'metres'
    axes: { x: string; y: string }; origin: string
  }
  // Synthetic data carries an unverified placeholder; real data a verified reference.
  unverifiedGeographicReference?: GeographicReference
  geographicReference?: GeographicReference
  base: MissionLocation
  stops: ScienceStop[]
  // Optional for older schema 1.0 responses, which derive bounds from positions.
  bounds?: MapBounds
  layers: MapLayer[]
  sources: DataSource[]
}
