import AVFoundation
import CoreImage
import CoreVideo
import Foundation
import Metal

final class MetalCompositor {
    let device: MTLDevice
    let commandQueue: MTLCommandQueue
    let pipelineState: MTLComputePipelineState
    let textureCache: CVMetalTextureCache
    let verbose: Bool

    private func dbg(_ msg: String) {
        if verbose { fputs("[metal:dbg] \(msg)\n", stderr) }
    }

    init(verbose: Bool = false) throws {
        self.verbose = verbose
        guard let device = MTLCreateSystemDefaultDevice() else {
            throw CompositorError.noMetalDevice
        }
        self.device = device

        guard let queue = device.makeCommandQueue() else {
            throw CompositorError.noCommandQueue
        }
        self.commandQueue = queue

        // Load shader
        let shaderURL = Bundle.module.url(forResource: "Shaders", withExtension: "metal")!
        let shaderSource = try String(contentsOf: shaderURL, encoding: .utf8)
        let library = try device.makeLibrary(source: shaderSource, options: nil)
        guard let function = library.makeFunction(name: "alphaComposite") else {
            throw CompositorError.shaderNotFound
        }
        self.pipelineState = try device.makeComputePipelineState(function: function)

        // Single texture cache for the lifetime of the compositor
        var cache: CVMetalTextureCache?
        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &cache)
        guard let textureCache = cache else {
            throw CompositorError.textureCreationFailed
        }
        self.textureCache = textureCache
    }

    func composite(
        sourcePath: String,
        overlayPath: String,
        outputPath: String,
        overlayX: Int,
        overlayY: Int,
        overlayScaleWidth: Int?,
        overlayScaleHeight: Int?,
        quality: Float,
        fps: Double,
        onProgress: @escaping (Int, Int) -> Void
    ) throws {
        let sourceURL = URL(fileURLWithPath: sourcePath)
        let overlayURL = URL(fileURLWithPath: overlayPath)
        let outputURL = URL(fileURLWithPath: outputPath)

        // Remove existing output
        try? FileManager.default.removeItem(at: outputURL)

        let sourceAsset = AVAsset(url: sourceURL)
        let overlayAsset = AVAsset(url: overlayURL)

        let sourceReader = try AVAssetReader(asset: sourceAsset)
        let overlayReader = try AVAssetReader(asset: overlayAsset)

        guard let sourceVideoTrack = sourceAsset.tracks(withMediaType: .video).first else {
            throw CompositorError.noVideoTrack("source")
        }
        guard let overlayVideoTrack = overlayAsset.tracks(withMediaType: .video).first else {
            throw CompositorError.noVideoTrack("overlay")
        }

        let sourceSize = sourceVideoTrack.naturalSize
        let totalFrames = Int(sourceVideoTrack.timeRange.duration.seconds * fps)
        let outputWidth = Int(sourceSize.width)
        let outputHeight = Int(sourceSize.height)

        fputs("[metal] source: \(outputWidth)x\(outputHeight), \(totalFrames) frames\n", stderr)
        dbg("sourceReader status: \(sourceReader.status.rawValue)")
        dbg("overlayReader status: \(overlayReader.status.rawValue)")

        // Source video: decode to BGRA
        let sourceOutput = AVAssetReaderTrackOutput(track: sourceVideoTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferMetalCompatibilityKey as String: true,
        ])
        sourceOutput.alwaysCopiesSampleData = false
        sourceReader.add(sourceOutput)

        // Overlay: decode to BGRA
        let overlayOutput = AVAssetReaderTrackOutput(track: overlayVideoTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferMetalCompatibilityKey as String: true,
        ])
        overlayOutput.alwaysCopiesSampleData = false
        overlayReader.add(overlayOutput)

        // Audio passthrough
        let sourceAudioTrack = sourceAsset.tracks(withMediaType: .audio).first
        var audioOutput: AVAssetReaderTrackOutput?
        if let audioTrack = sourceAudioTrack {
            let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: nil)
            output.alwaysCopiesSampleData = false
            sourceReader.add(output)
            audioOutput = output
        }

        // Writer
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)

        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: outputWidth,
            AVVideoHeightKey: outputHeight,
            AVVideoCompressionPropertiesKey: [
                AVVideoQualityKey: quality / 100.0,
                AVVideoExpectedSourceFrameRateKey: fps,
            ] as [String: Any],
        ]
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput.expectsMediaDataInRealTime = false

        let pixelBufferAttrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: outputWidth,
            kCVPixelBufferHeightKey as String: outputHeight,
            kCVPixelBufferMetalCompatibilityKey as String: true,
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: videoInput,
            sourcePixelBufferAttributes: pixelBufferAttrs
        )
        writer.add(videoInput)

        var audioInput: AVAssetWriterInput?
        if let audioTrack = sourceAudioTrack {
            let formatHint = audioTrack.formatDescriptions.first as! CMFormatDescription
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: formatHint)
            input.expectsMediaDataInRealTime = false
            writer.add(input)
            audioInput = input
        }

        // Start reading and writing
        dbg("starting readers and writer")
        sourceReader.startReading()
        overlayReader.startReading()
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)
        dbg("writer status: \(writer.status.rawValue)")

        // Overlay scale dimensions
        let overlayNativeWidth = Int(overlayVideoTrack.naturalSize.width)
        let overlayNativeHeight = Int(overlayVideoTrack.naturalSize.height)
        let scaleWidth = overlayScaleWidth ?? overlayNativeWidth
        let scaleHeight = overlayScaleHeight ?? overlayNativeHeight
        let needsScale = scaleWidth != overlayNativeWidth || scaleHeight != overlayNativeHeight
        dbg("overlay native: \(overlayNativeWidth)x\(overlayNativeHeight), scale to: \(scaleWidth)x\(scaleHeight), needsScale: \(needsScale)")

        // Positioned overlay texture (full frame, reused across frames)
        let positionedDesc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm, width: outputWidth, height: outputHeight, mipmapped: false
        )
        positionedDesc.usage = [.shaderRead, .shaderWrite]
        positionedDesc.storageMode = .shared
        guard let positionedOverlay = device.makeTexture(descriptor: positionedDesc) else {
            throw CompositorError.textureCreationFailed
        }

        // CIContext for overlay scaling
        let ciContext = needsScale ? CIContext(mtlDevice: device) : nil

        // Scaled overlay texture (reused if scaling)
        var scaledOverlayTexture: MTLTexture?
        if needsScale {
            let desc = MTLTextureDescriptor.texture2DDescriptor(
                pixelFormat: .bgra8Unorm, width: scaleWidth, height: scaleHeight, mipmapped: false
            )
            desc.usage = [.shaderRead, .shaderWrite]
            desc.storageMode = .shared
            scaledOverlayTexture = device.makeTexture(descriptor: desc)
        }

        // Process frames
        var frameIndex = 0

        while sourceReader.status == .reading {
            // Drain audio samples to keep interleaving healthy
            if let audioOut = audioOutput, let audioIn = audioInput {
                while audioIn.isReadyForMoreMediaData {
                    guard let sample = audioOut.copyNextSampleBuffer() else { break }
                    audioIn.append(sample)
                }
            }

            // Wait for video input to be ready (with timeout)
            var waitCount = 0
            while !videoInput.isReadyForMoreMediaData {
                Thread.sleep(forTimeInterval: 0.001)
                waitCount += 1
                if waitCount > 5000 { // 5 second timeout
                    throw CompositorError.writerFailed("Video input not ready after 5s (frame \(frameIndex))")
                }
            }

            guard let sourceSample = sourceOutput.copyNextSampleBuffer() else { break }
            guard let sourcePixelBuffer = CMSampleBufferGetImageBuffer(sourceSample) else { continue }

            // Use source sample's presentation time
            let presentationTime = CMSampleBufferGetPresentationTimeStamp(sourceSample)

            // Get overlay frame
            let overlayPixelBuffer: CVPixelBuffer?
            if overlayReader.status == .reading,
               let overlaySample = overlayOutput.copyNextSampleBuffer() {
                overlayPixelBuffer = CMSampleBufferGetImageBuffer(overlaySample)
            } else {
                overlayPixelBuffer = nil
            }

            // Get output pixel buffer from writer pool (IOSurface-backed → zero-copy to encoder)
            guard let pool = adaptor.pixelBufferPool else {
                throw CompositorError.pixelBufferCreationFailed
            }
            var outPB: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &outPB)
            guard let outputPB = outPB else {
                throw CompositorError.pixelBufferCreationFailed
            }
            let outputPBTexture = try makeTexture(from: outputPB)

            // Create textures from pixel buffers
            let sourceTexture = try makeTexture(from: sourcePixelBuffer)

            if let overlayPB = overlayPixelBuffer {
                let rawOverlayTexture = try makeTexture(from: overlayPB)

                // Scale overlay if needed
                let overlayToUse: MTLTexture
                if needsScale, let dest = scaledOverlayTexture, let ci = ciContext {
                    let ciImage = CIImage(mtlTexture: rawOverlayTexture, options: nil)!
                    let scaleX = Double(scaleWidth) / Double(overlayNativeWidth)
                    let scaleY = Double(scaleHeight) / Double(overlayNativeHeight)
                    let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
                    ci.render(scaled, to: dest, commandBuffer: nil, bounds: scaled.extent, colorSpace: CGColorSpaceCreateDeviceRGB())
                    overlayToUse = dest
                } else {
                    overlayToUse = rawOverlayTexture
                }

                // Clear positioned overlay, blit overlay into position
                try blitOverlayIntoPosition(
                    overlayToUse, into: positionedOverlay,
                    atX: overlayX, atY: overlayY,
                    outputWidth: outputWidth, outputHeight: outputHeight
                )
                // Composite directly into the writer's pixel buffer (zero-copy)
                try runCompositeShader(source: sourceTexture, overlay: positionedOverlay, output: outputPBTexture)
            } else {
                // No overlay — blit source directly into writer's pixel buffer
                try blitCopy(from: sourceTexture, to: outputPBTexture)
            }

            adaptor.append(outputPB, withPresentationTime: presentationTime)

            frameIndex += 1
            if frameIndex == 1 { dbg("first frame written") }
            if frameIndex % 30 == 0 {
                onProgress(frameIndex, totalFrames)
            }
            if frameIndex % 300 == 0 {
                dbg("frame \(frameIndex)/\(totalFrames) — reader: \(sourceReader.status.rawValue), writer: \(writer.status.rawValue)")
            }
        }

        // Drain remaining audio
        if let audioOut = audioOutput, let audioIn = audioInput {
            while sourceReader.status == .reading || audioIn.isReadyForMoreMediaData {
                guard let sample = audioOut.copyNextSampleBuffer() else { break }
                while !audioIn.isReadyForMoreMediaData {
                    Thread.sleep(forTimeInterval: 0.001)
                }
                audioIn.append(sample)
            }
        }

        videoInput.markAsFinished()
        audioInput?.markAsFinished()

        let semaphore = DispatchSemaphore(value: 0)
        writer.finishWriting { semaphore.signal() }
        semaphore.wait()

        if writer.status == .failed {
            throw CompositorError.writerFailed(writer.error?.localizedDescription ?? "unknown")
        }

        onProgress(totalFrames, totalFrames)
        fputs("[metal] wrote \(frameIndex) frames, writer status: \(writer.status.rawValue)\n", stderr)
    }

    // MARK: - Metal helpers

    private func makeTexture(from pixelBuffer: CVPixelBuffer) throws -> MTLTexture {
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)

        var cvTexture: CVMetalTexture?
        let status = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault, textureCache, pixelBuffer, nil,
            .bgra8Unorm, width, height, 0, &cvTexture
        )
        guard status == kCVReturnSuccess, let tex = cvTexture,
              let texture = CVMetalTextureGetTexture(tex) else {
            throw CompositorError.textureCreationFailed
        }
        return texture
    }

    private func blitOverlayIntoPosition(
        _ overlay: MTLTexture, into dest: MTLTexture,
        atX x: Int, atY y: Int,
        outputWidth: Int, outputHeight: Int
    ) throws {
        guard let cmd = commandQueue.makeCommandBuffer(),
              let blit = cmd.makeBlitCommandEncoder() else {
            throw CompositorError.commandBufferFailed
        }

        // Clear dest to transparent
        // (We fill the whole texture via the composite shader, so just clear is enough)
        let zeroRegion = MTLRegion(origin: .init(), size: .init(width: outputWidth, height: outputHeight, depth: 1))
        let zeros = [UInt8](repeating: 0, count: outputWidth * outputHeight * 4)
        dest.replace(region: zeroRegion, mipmapLevel: 0, withBytes: zeros, bytesPerRow: outputWidth * 4)

        // Copy overlay into position
        let copyW = min(overlay.width, outputWidth - x)
        let copyH = min(overlay.height, outputHeight - y)
        if copyW > 0 && copyH > 0 {
            blit.copy(
                from: overlay, sourceSlice: 0, sourceLevel: 0,
                sourceOrigin: .init(x: 0, y: 0, z: 0),
                sourceSize: .init(width: copyW, height: copyH, depth: 1),
                to: dest, destinationSlice: 0, destinationLevel: 0,
                destinationOrigin: .init(x: x, y: y, z: 0)
            )
        }
        blit.endEncoding()
        cmd.commit()
        cmd.waitUntilCompleted()
    }

    private func runCompositeShader(source: MTLTexture, overlay: MTLTexture, output: MTLTexture) throws {
        guard let cmd = commandQueue.makeCommandBuffer(),
              let encoder = cmd.makeComputeCommandEncoder() else {
            throw CompositorError.commandBufferFailed
        }

        encoder.setComputePipelineState(pipelineState)
        encoder.setTexture(source, index: 0)
        encoder.setTexture(overlay, index: 1)
        encoder.setTexture(output, index: 2)

        let w = pipelineState.threadExecutionWidth
        let h = pipelineState.maxTotalThreadsPerThreadgroup / w
        let threadsPerGroup = MTLSize(width: w, height: h, depth: 1)
        let threadgroups = MTLSize(
            width: (output.width + w - 1) / w,
            height: (output.height + h - 1) / h,
            depth: 1
        )
        encoder.dispatchThreadgroups(threadgroups, threadsPerThreadgroup: threadsPerGroup)
        encoder.endEncoding()
        cmd.commit()
        cmd.waitUntilCompleted()
    }

    private func blitCopy(from source: MTLTexture, to dest: MTLTexture) throws {
        guard let cmd = commandQueue.makeCommandBuffer(),
              let blit = cmd.makeBlitCommandEncoder() else {
            throw CompositorError.commandBufferFailed
        }
        blit.copy(
            from: source, sourceSlice: 0, sourceLevel: 0,
            sourceOrigin: .init(), sourceSize: .init(width: source.width, height: source.height, depth: 1),
            to: dest, destinationSlice: 0, destinationLevel: 0,
            destinationOrigin: .init()
        )
        blit.endEncoding()
        cmd.commit()
        cmd.waitUntilCompleted()
    }
}

enum CompositorError: Error, LocalizedError {
    case noMetalDevice
    case noCommandQueue
    case shaderNotFound
    case noVideoTrack(String)
    case textureCreationFailed
    case commandBufferFailed
    case pixelBufferCreationFailed
    case writerFailed(String)

    var errorDescription: String? {
        switch self {
        case .noMetalDevice: return "No Metal-capable GPU found"
        case .noCommandQueue: return "Failed to create Metal command queue"
        case .shaderNotFound: return "Alpha composite shader not found"
        case .noVideoTrack(let name): return "No video track in \(name)"
        case .textureCreationFailed: return "Failed to create Metal texture"
        case .commandBufferFailed: return "Failed to create Metal command buffer"
        case .pixelBufferCreationFailed: return "Failed to create output pixel buffer"
        case .writerFailed(let msg): return "AVAssetWriter failed: \(msg)"
        }
    }
}
