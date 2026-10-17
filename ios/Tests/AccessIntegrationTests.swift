import Foundation
import XCTest
@testable import ARGOTelemetry

@MainActor
final class AccessIntegrationTests: XCTestCase {
    private enum Failure: Error { case persistence }

    private func presented(_ coordinator: ZenitAccessCoordinator) async -> UUID? {
        for _ in 0..<100 {
            if let id = coordinator.request?.id { return id }
            await Task.yield()
        }
        XCTFail("Credential presentation was not requested")
        return nil
    }

    func testSaveReadbackThenRecovery() async {
        var stored = "synthetic-old"
        let credentials = ARGOCredentialAccess(read: { stored }, write: { stored = $0 })
        let coordinator = ZenitAccessCoordinator(credentials: credentials)
        let recovery = Task { await coordinator.recoverAuthentication() }
        guard let id = await presented(coordinator) else { recovery.cancel(); return }
        await coordinator.save("synthetic-new", requestID: id)
        let saved = await recovery.value
        XCTAssertTrue(saved)
        XCTAssertEqual(stored, "synthetic-new")
        XCTAssertNil(coordinator.request)
    }

    func testCancelDoesNotWriteAndDuplicateRecoveryIsRejected() async {
        var writes = 0
        let coordinator = ZenitAccessCoordinator(credentials: ARGOCredentialAccess(
            read: { "synthetic-old" }, write: { _ in writes += 1 }))
        let recovery = Task { await coordinator.recoverAuthentication() }
        guard let id = await presented(coordinator) else { recovery.cancel(); return }
        let duplicate = await coordinator.recoverAuthentication()
        XCTAssertFalse(duplicate)
        coordinator.cancel(requestID: id)
        coordinator.cancel(requestID: id)
        let saved = await recovery.value
        XCTAssertFalse(saved)
        XCTAssertEqual(writes, 0)
    }

    func testWriteFailureKeepsScreenOpenAndUsesFixedMessage() async {
        let coordinator = ZenitAccessCoordinator(credentials: ARGOCredentialAccess(
            read: { "synthetic-old" }, write: { _ in throw Failure.persistence }))
        let recovery = Task { await coordinator.recoverAuthentication() }
        guard let id = await presented(coordinator) else { recovery.cancel(); return }
        await coordinator.save("synthetic-new", requestID: id)
        XCTAssertEqual(coordinator.request?.id, id)
        XCTAssertEqual(coordinator.errorMessage,
                       "Impossibile verificare il salvataggio nel Portachiavi. Riprova.")
        coordinator.cancel(requestID: id)
        let saved = await recovery.value
        XCTAssertFalse(saved)
    }

    func testReadbackMismatchDoesNotReportSuccess() async {
        let coordinator = ZenitAccessCoordinator(credentials: ARGOCredentialAccess(
            read: { "synthetic-old" }, write: { _ in }))
        let recovery = Task { await coordinator.recoverAuthentication() }
        guard let id = await presented(coordinator) else { recovery.cancel(); return }
        await coordinator.save("synthetic-new", requestID: id)
        XCTAssertNotNil(coordinator.errorMessage)
        XCTAssertNotNil(coordinator.request)
        coordinator.cancel(requestID: id)
        let saved = await recovery.value
        XCTAssertFalse(saved)
    }

    func testEmptyInputAndStaleCompletionCannotWrite() async {
        var writes = 0
        let coordinator = ZenitAccessCoordinator(credentials: ARGOCredentialAccess(
            read: { "synthetic-old" }, write: { _ in writes += 1 }))
        let recovery = Task { await coordinator.recoverAuthentication() }
        guard let id = await presented(coordinator) else { recovery.cancel(); return }
        await coordinator.save(" ", requestID: id)
        await coordinator.save("synthetic-new", requestID: UUID())
        XCTAssertEqual(writes, 0)
        coordinator.cancel(requestID: id)
        let saved = await recovery.value
        XCTAssertFalse(saved)
    }

    func testTaskCancellationDismissesRecovery() async {
        let coordinator = ZenitAccessCoordinator(credentials: ARGOCredentialAccess(
            read: { "synthetic-old" }, write: { _ in }))
        let recovery = Task { await coordinator.recoverAuthentication() }
        guard await presented(coordinator) != nil else { recovery.cancel(); return }
        recovery.cancel()
        let saved = await recovery.value
        XCTAssertFalse(saved)
        XCTAssertNil(coordinator.request)
    }

    func test401ToPersistedCredentialToRetry() async {
        var stored = "synthetic-old"
        var reads = 0
        var requests = 0
        let credentials = ARGOCredentialAccess(read: { reads += 1; return stored }, write: { stored = $0 })
        let coordinator = ZenitAccessCoordinator(credentials: credentials)
        StubProtocol.handler = { request in
            requests += 1
            if request.value(forHTTPHeaderField: "Authorization") != "Bearer synthetic-new" {
                return (401, [:], Data())
            }
            return (200, [:], Data("{\"provider\":\"zenit\",\"capturedAt\":\"now\",\"vehicles\":[]}".utf8))
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        let api = ARGOTelemetryClient(baseURL: URL(string: "https://gateway.invalid/")!,
            session: URLSession(configuration: config), tokenProvider: { try await credentials.read() })
        let model = ZenitTelemetryViewModel(client: api,
            recoverAuthentication: { await coordinator.recoverAuthentication() })
        await model.loadVehicles()
        XCTAssertTrue(model.authenticationRequired)
        let recovery = Task { await model.recoverAccess() }
        guard let id = await presented(coordinator) else { recovery.cancel(); return }
        XCTAssertEqual(requests, 1)
        await coordinator.save("synthetic-new", requestID: id)
        await recovery.value
        XCTAssertEqual(requests, 2)
        XCTAssertEqual(reads, 3) // failed request, persistence readback, successful retry
        XCTAssertFalse(model.authenticationRequired)
        XCTAssertNil(model.errorMessage)
    }
}
