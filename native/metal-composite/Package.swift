// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "metal-composite",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "metal-composite",
            path: "Sources",
            resources: [.process("Shaders.metal")]
        ),
    ]
)
