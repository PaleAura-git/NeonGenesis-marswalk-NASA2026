export interface Position { xMeters: number; yMeters: number }
export interface MissionLocation { id: string; name: string; position: Position }
export interface ScienceStop extends MissionLocation {
  observationObjective: string
  observationDurationSeconds: number
}
export interface Mission {
  schemaVersion: '1.0'
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
  // Resource schemas will be agreed before schemaVersion is extended.
  layers: never[]
  sources: never[]
}
