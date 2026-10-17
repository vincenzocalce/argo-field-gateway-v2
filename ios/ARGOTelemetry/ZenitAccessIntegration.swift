import Foundation
import SwiftUI
import Combine

/// Adapt both closures to the SAME existing app Keychain item (service/account/access group).
/// No credential is cached here, returned by recovery, or included in diagnostics.
@MainActor
final class ARGOCredentialAccess {
    let read: () async throws -> String
    let write: (String) async throws -> Void

    init(read: @escaping () async throws -> String,
         write: @escaping (String) async throws -> Void) {
        self.read = read
        self.write = write
    }
}

@MainActor
final class ZenitAccessCoordinator: ObservableObject {
    struct Request: Identifiable { let id: UUID }
    @Published private(set) var request: Request?
    @Published private(set) var isSaving = false
    @Published private(set) var errorMessage: String?
    private let credentials: ARGOCredentialAccess
    private var completion: CheckedContinuation<Bool, Never>?

    init(credentials: ARGOCredentialAccess) { self.credentials = credentials }

    func recoverAuthentication() async -> Bool {
        guard request == nil, !isSaving, !Task.isCancelled else { return false }
        let id = UUID()
        return await withTaskCancellationHandler(operation: {
            await withCheckedContinuation { continuation in
                guard !Task.isCancelled else { continuation.resume(returning: false); return }
                completion = continuation
                errorMessage = nil
                request = Request(id: id)
            }
        }, onCancel: {
            Task { @MainActor in self.finish(id: id, saved: false) }
        })
    }

    func save(_ value: String, requestID: UUID) async {
        guard request?.id == requestID, !isSaving else { return }
        guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Inserisci la credenziale A.R.G.O. fornita dal referente."
            return
        }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            // The app adapter must throw on failed persistence. Never silently fall back.
            try await credentials.write(value)
            let persisted = try await credentials.read()
            guard request?.id == requestID else { return }
            guard persisted == value else {
                errorMessage = "Salvataggio non verificato. Riprova nelle impostazioni di accesso."
                return
            }
            finish(id: requestID, saved: true)
        } catch {
            guard request?.id == requestID else { return }
            errorMessage = "Impossibile verificare il salvataggio nel Portachiavi. Riprova."
        }
    }

    func cancel(requestID: UUID) { finish(id: requestID, saved: false) }

    private func finish(id: UUID, saved: Bool) {
        guard request?.id == id else { return }
        let pending = completion
        completion = nil
        request = nil
        errorMessage = nil
        pending?.resume(returning: saved)
    }
}

/// Composition root: copy sources into the app target; no package import is needed.
@MainActor
struct ZenitTelemetryAccessView: View {
    @StateObject private var coordinator: ZenitAccessCoordinator
    @StateObject private var model: ZenitTelemetryViewModel

    init(baseURL: URL, session: URLSession = .shared, credentials: ARGOCredentialAccess) {
        let access = ZenitAccessCoordinator(credentials: credentials)
        let client = ARGOTelemetryClient(baseURL: baseURL, session: session,
                                        tokenProvider: { try await credentials.read() })
        _coordinator = StateObject(wrappedValue: access)
        _model = StateObject(wrappedValue: ZenitTelemetryViewModel(client: client,
            recoverAuthentication: { await access.recoverAuthentication() }))
    }

    var body: some View {
        ZenitTelemetryView(model: model)
            .sheet(item: Binding(get: { coordinator.request }, set: { value in
                if value == nil, let current = coordinator.request {
                    coordinator.cancel(requestID: current.id)
                }
            })) { request in
                ZenitSecureCredentialView(coordinator: coordinator, requestID: request.id)
            }
            .onDisappear {
                if let request = coordinator.request { coordinator.cancel(requestID: request.id) }
            }
    }
}

@MainActor
private struct ZenitSecureCredentialView: View {
    @ObservedObject var coordinator: ZenitAccessCoordinator
    let requestID: UUID
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            Form {
                Text("Inserisci la credenziale del gateway A.R.G.O., non la chiave API Zenit.")
                SecureField("Credenziale A.R.G.O.", text: $draft)
                    .autocorrectionDisabled()
                    .disabled(coordinator.isSaving)
                if let error = coordinator.errorMessage { Text(error).foregroundStyle(.red) }
                Button("Salva e riprova") {
                    Task {
                        let value = draft
                        draft = ""
                        await coordinator.save(value, requestID: requestID)
                    }
                }.disabled(coordinator.isSaving || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("Annulla") {
                    draft = ""
                    coordinator.cancel(requestID: requestID)
                }.disabled(coordinator.isSaving)
            }
            .navigationTitle("Accesso A.R.G.O.")
            .interactiveDismissDisabled(coordinator.isSaving)
        }
        .onDisappear {
            draft = ""
            coordinator.cancel(requestID: requestID)
        }
    }
}
