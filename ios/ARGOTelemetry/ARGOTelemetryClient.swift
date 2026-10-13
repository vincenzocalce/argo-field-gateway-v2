import Foundation

enum ARGOTelemetryError: LocalizedError {
    case invalidResponse
    case server(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Risposta telemetrica non valida."
        case let .server(status, code): return "Telemetria non disponibile (\(status): \(code))."
        }
    }
}

actor ARGOTelemetryClient {
    typealias TokenProvider = @Sendable () async throws -> String

    private let baseURL: URL
    private let session: URLSession
    private let tokenProvider: TokenProvider
    private let decoder = JSONDecoder()

    init(baseURL: URL, session: URLSession = .shared, tokenProvider: @escaping TokenProvider) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
    }

    func vehicles() async throws -> [ZenitVehicle] {
        let response: ZenitVehicleList = try await get(path: "argo/telemetry/vehicles")
        return response.vehicles
    }

    func daily(vehicleId: String, date: Date, timeZone: TimeZone = TimeZone(identifier: "Europe/Rome")!) async throws -> ZenitDailyTelemetry {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let from = calendar.startOfDay(for: date)
        guard let to = calendar.date(byAdding: .day, value: 1, to: from) else { throw ARGOTelemetryError.invalidResponse }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withColonSeparatorInTimeZone]
        var components = URLComponents()
        components.path = "/argo/telemetry/vehicles/\(vehicleId)/daily"
        components.queryItems = [
            URLQueryItem(name: "from", value: formatter.string(from: from)),
            URLQueryItem(name: "to", value: formatter.string(from: to))
        ]
        guard let path = components.string else { throw ARGOTelemetryError.invalidResponse }
        return try await get(path: path)
    }

    private func get<T: Decodable>(path: String) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw ARGOTelemetryError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(try await tokenProvider())", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ARGOTelemetryError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let code = (try? decoder.decode(ServerError.self, from: data).error) ?? "unknown_error"
            throw ARGOTelemetryError.server(http.statusCode, code)
        }
        return try decoder.decode(T.self, from: data)
    }
}

private struct ServerError: Decodable { let error: String }
