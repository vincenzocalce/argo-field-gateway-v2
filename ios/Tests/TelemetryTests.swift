import Foundation
import XCTest
@testable import ARGOTelemetry

final class StubProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, [String: String], Data))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, headers, body) = try Self.handler(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status,
                httpVersion: nil, headerFields: headers)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: body)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

final class TelemetryTests: XCTestCase {
    func client(token: @escaping ARGOTelemetryClient.TokenProvider = { "synthetic-test-token" }) -> ARGOTelemetryClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return ARGOTelemetryClient(baseURL: URL(string: "https://gateway.invalid/")!,
            session: URLSession(configuration: config), tokenProvider: token)
    }
    func assertError(_ expected: ARGOTelemetryError, status: Int = 200,
                     code: String = "unknown", network: URLError.Code? = nil) async {
        StubProtocol.handler = { _ in
            if let network { throw URLError(network) }
            return (status, [:], Data("{\"error\":\"\(code)\"}".utf8))
        }
        do { _ = try await client().vehicles(); XCTFail("Expected error") }
        catch { XCTAssertEqual(error as? ARGOTelemetryError, expected) }
    }
    func test401() async { await assertError(.authenticationRequired, status: 401, code: "secret-do-not-display") }
    func testTimeout() async { await assertError(.timeout, network: .timedOut) }
    func testOffline() async { await assertError(.offline, network: .notConnectedToInternet) }
    func testUnavailable() async { await assertError(.unavailable, status: 503) }
    func testGatewayTimeout() async { await assertError(.timeout, status: 503, code: "zenit_timeout") }
    func testHTTP504() async { await assertError(.timeout, status: 504) }
    func testMalformedJSON() async { await assertError(.invalidResponse) }
    func testSafeFallback() async { await assertError(.server(403), status: 403, code: "synthetic-secret") }
    func testCancelled() async {
        StubProtocol.handler = { _ in throw URLError(.cancelled) }
        do { _ = try await client().vehicles(); XCTFail("Expected cancellation") }
        catch { XCTAssertTrue(error is CancellationError) }
    }
    func testMissingCredential() async {
        StubProtocol.handler = { _ in XCTFail("No request expected"); return (200, [:], Data()) }
        do { _ = try await client(token: { " " }).vehicles(); XCTFail("Expected authentication") }
        catch { XCTAssertEqual(error as? ARGOTelemetryError, .authenticationRequired) }
    }
    func testRateLimitFormsAndCooldown() async {
        for status in [429, 503] {
            for header in ["60", "Wed, 01 Jan 2031 00:00:00 GMT", "invalid"] {
                var calls = 0
                StubProtocol.handler = { _ in
                    calls += 1
                    return (status, ["Retry-After": header], Data("{\"error\":\"zenit_rate_limited\"}".utf8))
                }
                let api = client()
                for _ in 0..<2 {
                    do { _ = try await api.vehicles(); XCTFail("Expected rate limit") }
                    catch {
                        guard let typed = error as? ARGOTelemetryError, case let .rateLimited(date) = typed else {
                            XCTFail("Wrong error"); continue
                        }
                        XCTAssertGreaterThan(date!.timeIntervalSinceNow, 0)
                    }
                }
                XCTAssertEqual(calls, 1)
            }
        }
    }
    func test401RecoveryRereadsProvider() async {
        var calls = 0
        StubProtocol.handler = { _ in
            calls += 1
            if calls == 1 { return (401, [:], Data()) }
            return (200, [:], Data("{\"provider\":\"zenit\",\"capturedAt\":\"now\",\"vehicles\":[]}".utf8))
        }
        let counter = TokenCounter()
        let api = client(token: { await counter.next() })
        do { _ = try await api.vehicles(); XCTFail("Expected 401") } catch {}
        do { let result = try await api.vehicles(); XCTAssertTrue(result.isEmpty) }
        catch { XCTFail("Recovery failed") }
        XCTAssertEqual(calls, 2)
        let reads = await counter.reads
        XCTAssertEqual(reads, 2)
    }
    @MainActor
    func testGuidedRecovery() async {
        var authorized = false
        StubProtocol.handler = { _ in
            if !authorized { return (401, [:], Data()) }
            return (200, [:], Data("{\"provider\":\"zenit\",\"capturedAt\":\"now\",\"vehicles\":[]}".utf8))
        }
        let model = ZenitTelemetryViewModel(client: client(), recoverAuthentication: {
            authorized = true
            return true
        })
        await model.loadVehicles()
        XCTAssertTrue(model.authenticationRequired)
        XCTAssertNotNil(model.errorMessage)
        await model.recoverAccess()
        XCTAssertFalse(model.authenticationRequired)
        XCTAssertNil(model.errorMessage)
        XCTAssertFalse(model.isLoading)
    }

    @MainActor
    func testRecoveryWithoutAppCoordinatorGivesInstructions() async {
        StubProtocol.handler = { _ in (401, [:], Data()) }
        let model = ZenitTelemetryViewModel(client: client())
        await model.loadVehicles()
        await model.recoverAccess()
        XCTAssertTrue(model.authenticationRequired)
        XCTAssertTrue(model.errorMessage?.contains("Portachiavi") == true)
    }

    @MainActor
    func testFailedRefreshPreservesPreviousTelemetry() async throws {
        let previous = try JSONDecoder().decode(ZenitDailyTelemetry.self, from: Data("""
        {"provider":"zenit","vehicleId":"veh_ABC123","requestedWindow":{"from":"a","to":"b"},
         "capturedAt":"previous","summary":{"missionsCount":1,"distanceKm":10,"stopsCount":0,"stopMinutes":0},
         "missions":[],"stops":[],"latestPosition":null}
        """.utf8))
        StubProtocol.handler = { _ in throw URLError(.timedOut) }
        let model = ZenitTelemetryViewModel(client: client())
        model.selectedVehicleId = "veh_ABC123"
        model.telemetry = previous
        await model.loadDaily()
        XCTAssertEqual(model.telemetry?.capturedAt, "previous")
        XCTAssertEqual(model.errorMessage, ARGOTelemetryError.timeout.errorDescription)
        XCTAssertFalse(model.isLoading)
    }

}

private actor TokenCounter {
    var reads = 0
    func next() -> String {
        reads += 1
        return reads == 1 ? "synthetic-old" : "synthetic-new"
    }
}
