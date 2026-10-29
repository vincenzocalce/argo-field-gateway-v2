import SwiftUI
import Combine

@MainActor
final class ZenitTelemetryViewModel: ObservableObject {
    @Published var vehicles: [ZenitVehicle] = []
    @Published var selectedVehicleId: String?
    @Published var selectedDate = Date()
    @Published var telemetry: ZenitDailyTelemetry?
    @Published var isLoading = false
    @Published var errorMessage: String?

    @Published var authenticationRequired = false
    @Published var retryAfter: Date?
    private let recoverAuthentication: (() async -> Bool)?

    private let client: ARGOTelemetryClient

    init(client: ARGOTelemetryClient, recoverAuthentication: (() async -> Bool)? = nil) {
        self.client = client
        self.recoverAuthentication = recoverAuthentication
    }

    func recoverAccess() async {
        guard let recoverAuthentication else {
            errorMessage = "Apri le impostazioni di accesso A.R.G.O. Dopo aver aggiornato la credenziale nel Portachiavi, premi Riprova. Se non hai la credenziale corretta, contatta il referente del gateway."
            return
        }
        if await recoverAuthentication() { await loadVehicles() }
    }

    func retry() async {
        if vehicles.isEmpty { await loadVehicles() } else { await loadDaily() }
    }

    func loadVehicles() async {
        await perform {
            vehicles = try await client.vehicles()
            selectedVehicleId = selectedVehicleId ?? vehicles.first?.id
            if let selectedVehicleId {
                telemetry = try await client.daily(vehicleId: selectedVehicleId, date: selectedDate)
            }
        }
    }

    func loadDaily() async {
        guard let selectedVehicleId else { return }
        await perform { telemetry = try await client.daily(vehicleId: selectedVehicleId, date: selectedDate) }
    }

    private func perform(_ operation: () async throws -> Void) async {
        guard !isLoading else { return }
        if let retryAfter, retryAfter > Date() { return }
        isLoading = true
        errorMessage = nil
        do {
            try await operation()
            authenticationRequired = false
            retryAfter = nil
        } catch is CancellationError {
            // Navigating away is not an error for the user.
        } catch let error as ARGOTelemetryError {
            errorMessage = error.errorDescription
            authenticationRequired = error == .authenticationRequired
            if case let .rateLimited(deadline) = error { retryAfter = deadline }
        } catch {
            errorMessage = "Non è stato possibile caricare la telemetria. Verifica la connessione e riprova."
        }
        isLoading = false
    }
}

struct ZenitTelemetryView: View {
    @StateObject var model: ZenitTelemetryViewModel

    var body: some View {
        NavigationStack {
            List {
                Section("Filtro") {
                    Picker("Mezzo", selection: $model.selectedVehicleId) {
                        ForEach(model.vehicles) { vehicle in
                            Text(vehicle.plate ?? vehicle.name ?? vehicle.id).tag(Optional(vehicle.id))
                        }
                    }
                    DatePicker("Giorno", selection: $model.selectedDate, displayedComponents: .date)
                    Button("Aggiorna telemetria") { Task { await model.loadDaily() } }
                }

                if let summary = model.telemetry?.summary {
                    Section("Riepilogo Zenit") {
                        LabeledContent("Missioni", value: "\(summary.missionsCount)")
                        LabeledContent("Percorrenza", value: summary.distanceKm.formatted(.number.precision(.fractionLength(2))) + " km")
                        LabeledContent("Soste", value: "\(summary.stopsCount)")
                        LabeledContent("Tempo soste", value: "\(summary.stopMinutes) min")
                    }
                }

                if let position = model.telemetry?.latestPosition {
                    Section("Ultima posizione") {
                        LabeledContent("Rilevata", value: position.recordedAt ?? "—")
                        LabeledContent("Velocità", value: position.speedKmh.map { "\($0.formatted()) km/h" } ?? "—")
                        if let location = position.location, let lat = location.lat, let lon = location.lon {
                            Link("Apri nella mappa", destination: URL(string: "https://maps.apple.com/?ll=\(lat),\(lon)")!)
                        }
                    }
                }

                if let stops = model.telemetry?.stops, !stops.isEmpty {
                    Section("Soste") {
                        ForEach(Array(stops.enumerated()), id: \.offset) { index, stop in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Sosta \(index + 1)").font(.headline)
                                Text("\(stop.startedAt ?? "—") → \(stop.endedAt ?? "—")").font(.caption)
                                Text("Durata: \(Int((stop.durationSeconds ?? 0) / 60)) min")
                                if let location = stop.location, let lat = location.lat, let lon = location.lon {
                                    Link("Mappa", destination: URL(string: "https://maps.apple.com/?ll=\(lat),\(lon)")!)
                                }
                            }
                        }
                    }
                }

                if let errorMessage = model.errorMessage {
                    Section("Stato aggiornamento") {
                        Text(errorMessage).foregroundStyle(.red)
                        if model.telemetry != nil { Text("Sono visualizzati i dati precedenti, non aggiornati.").font(.caption) }
                        if model.authenticationRequired {
                            Button("Ripristina accesso A.R.G.O.") { Task { await model.recoverAccess() } }
                        }
                        if let deadline = model.retryAfter {
                            Text("Puoi riprovare dopo le \(deadline.formatted(date: .omitted, time: .standard)).")
                        }
                        Button("Riprova") { Task { await model.retry() } }
                            .disabled(model.isLoading)
                    }
                }
            }
            .navigationTitle("Telemetria Zenit")
            .overlay { if model.isLoading { ProgressView() } }
            .task { if model.vehicles.isEmpty { await model.loadVehicles() } }
            .onChange(of: model.selectedVehicleId) { _ in Task { await model.loadDaily() } }
            .onChange(of: model.selectedDate) { _ in Task { await model.loadDaily() } }
        }
    }
}
