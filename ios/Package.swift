// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "ARGOTelemetry",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "ARGOTelemetry", targets: ["ARGOTelemetry"])],
    targets: [
        .target(name: "ARGOTelemetry", path: "ARGOTelemetry"),
        .testTarget(name: "ARGOTelemetryTests", dependencies: ["ARGOTelemetry"], path: "Tests")
    ]
)
