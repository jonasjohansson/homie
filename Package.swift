// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Homie",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/jpsim/Yams.git", from: "5.1.0"),
    ],
    targets: [
        .executableTarget(
            name: "Homie",
            dependencies: ["Yams"],
            path: "Sources/Homie"
        ),
    ]
)
