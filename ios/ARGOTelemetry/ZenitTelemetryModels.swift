import Foundation

struct ZenitVehicleList: Decodable {
    let provider: String
    let capturedAt: String
    let vehicles: [ZenitVehicle]
}

struct ZenitVehicle: Identifiable, Decodable, Hashable {
    let id: String
    let plate: String?
    let name: String?
    let make: String?
    let model: String?
    let type: String?
}

struct ZenitDailyTelemetry: Decodable {
    let provider: String
    let vehicleId: String
    let requestedWindow: ZenitWindow
    let capturedAt: String
    let summary: ZenitTelemetrySummary
    let missions: [ZenitMission]
    let stops: [ZenitStop]
    let latestPosition: ZenitPosition?
}

struct ZenitWindow: Decodable { let from: String; let to: String }

struct ZenitTelemetrySummary: Decodable {
    let missionsCount: Int
    let distanceKm: Double
    let stopsCount: Int
    let stopMinutes: Int
}

struct ZenitMission: Identifiable, Decodable {
    let id: String?
    let startedAt: String?
    let endedAt: String?
    let inProgress: Bool?
    let durationSeconds: Double?
    let distanceKm: Double?
    let maxSpeedKmh: Double?
    let averageSpeedKmh: Double?

    var stableId: String { id ?? "\(startedAt ?? "")-\(endedAt ?? "")" }
}

struct ZenitStop: Identifiable, Decodable {
    let id: String?
    let startedAt: String?
    let endedAt: String?
    let inProgress: Bool?
    let durationSeconds: Double?
    let type: String?
    let location: ZenitLocation?

    var stableId: String { id ?? "\(startedAt ?? "")-\(endedAt ?? "")" }
}

struct ZenitPosition: Decodable {
    let recordedAt: String?
    let receivedAt: String?
    let gpsValid: Bool?
    let ignitionOn: Bool?
    let moving: Bool?
    let speedKmh: Double?
    let location: ZenitLocation?
}

struct ZenitLocation: Decodable {
    let lat: Double?
    let lon: Double?
    let address: String?
}

extension ZenitMission {
    var identifiableId: String { stableId }
}

extension ZenitStop {
    var identifiableId: String { stableId }
}
