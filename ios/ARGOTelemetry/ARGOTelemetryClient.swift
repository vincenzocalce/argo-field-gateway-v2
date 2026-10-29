import Foundation

enum ARGOTelemetryError: LocalizedError, Equatable {
    case invalidResponse
    case authenticationRequired
    case timeout
    case offline
    case unavailable
    case rateLimited(Date?)
    case server(Int)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Risposta telemetrica non valida. Riprova più tardi."
        case .authenticationRequired: return "Accesso A.R.G.O. non valido. Apri le impostazioni di accesso e verifica la credenziale con il referente del gateway."
        case .timeout: return "Il servizio non ha risposto in tempo. Verifica la connessione e riprova."
        case .offline: return "Connessione non disponibile. Controlla Wi-Fi o rete mobile e riprova."
        case .unavailable: return "Servizio telemetrico temporaneamente non disponibile. Riprova più tardi."
        case .rateLimited: return "Troppe richieste. Attendi prima di aggiornare nuovamente."
        case .server: return "Non è stato possibile caricare la telemetria. Riprova più tardi."
        }
    }
}

actor ARGOTelemetryClient {
    typealias TokenProvider = @Sendable () async throws -> String

    private let baseURL: URL
    private let session: URLSession
    private let tokenProvider: TokenProvider
    private var retryAfter: Date?
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
        if let retryAfter, retryAfter > Date() { throw ARGOTelemetryError.rateLimited(retryAfter) }
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw ARGOTelemetryError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let token: String
        do { token = try await tokenProvider() }
        catch is CancellationError { throw CancellationError() }
        catch { throw ARGOTelemetryError.authenticationRequired }
        guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ARGOTelemetryError.authenticationRequired
        }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch let error as URLError {
            switch error.code {
            case .cancelled: throw CancellationError()
            case .timedOut: throw ARGOTelemetryError.timeout
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed: throw ARGOTelemetryError.offline
            default: throw ARGOTelemetryError.unavailable
            }
        }
        guard let http = response as? HTTPURLResponse else { throw ARGOTelemetryError.invalidResponse }
        // The gateway maps upstream Zenit timeout/rate limit to HTTP 503.
        // Inspect only allowlisted codes; never display or log response bodies.
        let code = (try? decoder.decode(ServerError.self, from: data))?.error
        if http.statusCode == 503 && code == "zenit_timeout" { throw ARGOTelemetryError.timeout }
        let upstreamRateLimit = http.statusCode == 503 && code == "zenit_rate_limited"
        switch upstreamRateLimit ? 429 : http.statusCode {
        case 200..<300: break
        case 401: throw ARGOTelemetryError.authenticationRequired
        case 408, 504: throw ARGOTelemetryError.timeout
        case 429:
            let now = Date()
            let header = http.value(forHTTPHeaderField: "Retry-After") ?? ""
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
            let date = Double(header).flatMap { $0.isFinite && $0 >= 0 ? now.addingTimeInterval($0) : nil }
                ?? formatter.date(from: header)
            let deadline = max(date ?? now.addingTimeInterval(30), now)
            retryAfter = deadline
            throw ARGOTelemetryError.rateLimited(deadline)
        case 500...599: throw ARGOTelemetryError.unavailable
        default: throw ARGOTelemetryError.server(http.statusCode)
        }
        do { return try decoder.decode(T.self, from: data) }
        catch { throw ARGOTelemetryError.invalidResponse }
    }
}

private struct ServerError: Decodable { let error: String }
