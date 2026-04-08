import Foundation

struct Arguments {
    let source: String
    let overlay: String
    let output: String
    let overlayX: Int
    let overlayY: Int
    let overlayScaleWidth: Int?
    let overlayScaleHeight: Int?
    let quality: Float
    let fps: Double
    let verbose: Bool
}

func log(_ msg: String) {
    fputs("[metal] \(msg)\n", stderr)
}

func parseArguments() -> Arguments {
    var args = CommandLine.arguments.dropFirst()
    var source = ""
    var overlay = ""
    var output = ""
    var overlayX = 0
    var overlayY = 0
    var overlayScaleWidth: Int?
    var overlayScaleHeight: Int?
    var quality: Float = 65
    var fps: Double = 59.94
    var verbose = false

    while let arg = args.first {
        args = args.dropFirst()
        switch arg {
        case "--source":
            source = String(args.first ?? ""); args = args.dropFirst()
        case "--overlay":
            overlay = String(args.first ?? ""); args = args.dropFirst()
        case "--output":
            output = String(args.first ?? ""); args = args.dropFirst()
        case "--overlay-x":
            overlayX = Int(args.first ?? "0") ?? 0; args = args.dropFirst()
        case "--overlay-y":
            overlayY = Int(args.first ?? "0") ?? 0; args = args.dropFirst()
        case "--overlay-scale-width":
            overlayScaleWidth = Int(args.first ?? ""); args = args.dropFirst()
        case "--overlay-scale-height":
            overlayScaleHeight = Int(args.first ?? ""); args = args.dropFirst()
        case "--quality":
            quality = Float(args.first ?? "65") ?? 65; args = args.dropFirst()
        case "--fps":
            fps = Double(args.first ?? "59.94") ?? 59.94; args = args.dropFirst()
        case "--verbose", "-v":
            verbose = true
        default:
            break
        }
    }

    guard !source.isEmpty, !overlay.isEmpty, !output.isEmpty else {
        fputs("Usage: metal-composite --source <path> --overlay <path> --output <path> [options]\n", stderr)
        fputs("Options:\n", stderr)
        fputs("  --overlay-x <int>              Overlay X position (default: 0)\n", stderr)
        fputs("  --overlay-y <int>              Overlay Y position (default: 0)\n", stderr)
        fputs("  --overlay-scale-width <int>    Scale overlay to this width\n", stderr)
        fputs("  --overlay-scale-height <int>   Scale overlay to this height\n", stderr)
        fputs("  --quality <float>              Encode quality 0-100 (default: 65)\n", stderr)
        fputs("  --fps <float>                  Frame rate (default: 59.94)\n", stderr)
        fputs("  --verbose, -v                  Enable debug logging\n", stderr)
        exit(1)
    }

    return Arguments(
        source: source, overlay: overlay, output: output,
        overlayX: overlayX, overlayY: overlayY,
        overlayScaleWidth: overlayScaleWidth, overlayScaleHeight: overlayScaleHeight,
        quality: quality, fps: fps, verbose: verbose
    )
}

func main() {
    let args = parseArguments()

    log("source: \(args.source)")
    log("overlay: \(args.overlay)")
    log("output: \(args.output)")
    log("overlayPos: (\(args.overlayX), \(args.overlayY))")
    log("overlayScale: \(args.overlayScaleWidth ?? -1)x\(args.overlayScaleHeight ?? -1)")
    log("quality: \(args.quality), fps: \(args.fps)")

    do {
        let compositor = try MetalCompositor(verbose: args.verbose)

        let start = CFAbsoluteTimeGetCurrent()
        try compositor.composite(
            sourcePath: args.source,
            overlayPath: args.overlay,
            outputPath: args.output,
            overlayX: args.overlayX,
            overlayY: args.overlayY,
            overlayScaleWidth: args.overlayScaleWidth,
            overlayScaleHeight: args.overlayScaleHeight,
            quality: args.quality,
            fps: args.fps,
            onProgress: { current, total in
                fputs("frame=\(current)/\(total)\n", stderr)
            }
        )
        let elapsed = CFAbsoluteTimeGetCurrent() - start
        log("done in \(String(format: "%.1f", elapsed))s")
    } catch {
        log("ERROR: \(error.localizedDescription)")
        exit(1)
    }
}

main()
