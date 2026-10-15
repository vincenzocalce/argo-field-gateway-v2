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

    private let client: ARGOTelemetryClient

    init(client: ARGOTelemetryClient) { self.client = client }

    func loadVehicles() async {
        await perform {
            vehicles = try await client.vehicles()
            selectedVehicleId = selectedVehicleId ?? vehicles.first?.id
            await loadDaily()
        }
    }

    func loadDaily() async {
        guard let selectedVehicleId else { return }
        await perform { telemetry = try await client.daily(vehicleId: selectedVehicleId, date: selectedDate) }
    }

    private func perform(_ operation: () async throws -> Void) async {
        isLoading = true
        errorMessage = nil
        do { try await operation() } catch { errorMessage = error.localizedDescription }
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
                    Section { Text(errorMessage).foregroundStyle(.red) }
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
