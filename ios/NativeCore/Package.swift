// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CommuteNativeCore",
    platforms: [.iOS("27.0"), .macOS(.v13)],
    products: [.library(name: "CommuteNativeCore", targets: ["CommuteNativeCore"])],
    targets: [
        .target(name: "CommuteNativeCore"),
        .testTarget(name: "CommuteNativeCoreTests", dependencies: ["CommuteNativeCore"])
    ]
)
