import AVFoundation
import CoreImage
import CoreVideo
import Foundation
import Metal
import MetalKit

/// Composites an overlay video onto a source video using Metal GPU blending.
/// All pixel data stays on GPU — no CPU pixel touching.
final class MetalCompositor {
    let device: MTLDevice
    let commandQueue: MTLCommandQueue
    let pipelineState: MTLComputePipelineState
    let ciContext: CIContext

    init() throws {
        guard let device = MTLCreateSystemDefaultDevice() else {
            throw CompositorError.noMetalDevice
        }
        self.device = device

        guard let queue = device.makeCommandQueue() else {
            throw CompositorError.noCommandQueue
        }
        self.commandQueue = queue

        // Load the alpha composite shader from the bundle
        let shaderURL = Bundle.module.url(forResource: "Shaders", withExtension: "metal")!
        let shaderSource = try String(contentsOf: shaderURL, encoding: .utf8)
        let library = try device.makeLibrary(source: shaderSource, options: nil)

        guard let function = library.makeFunction(name: "alphaComposite") else {
            throw CompositorError.shaderNotFound
        }
        self.pipelineState = try device.makeComputePipelineState(function: function)

        self.ciContext = CIContext(mtlDevice: device, options: [
            .workingColorSpace: CGColorSpaceCreateDeviceRGB(),
        ])
    }

    /// Run the full composite pipeline.
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

        // Set up readers
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
        let totalFrames = Int(Double(sourceVideoTrack.timeRange.duration.seconds) * fps)

        // Source: decode to BGRA pixel buffer
        let sourceOutput = AVAssetReaderTrackOutput(track: sourceVideoTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        ])
        sourceOutput.alwaysCopiesSampleData = false
        sourceReader.add(sourceOutput)

        // Overlay: decode to BGRA with alpha
        let overlayOutput = AVAssetReaderTrackOutput(track: overlayVideoTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
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

        // Set up writer with VideoToolbox HEVC encoding
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)

        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: Int(sourceSize.width),
            AVVideoHeightKey: Int(sourceSize.height),
            AVVideoCompressionPropertiesKey: [
                AVVideoQualityKey: quality / 100.0,
                AVVideoExpectedSourceFrameRateKey: fps,
            ] as [String: Any],
        ]
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput.expectsMediaDataInRealTime = false

        let pixelBufferAttrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: Int(sourceSize.width),
            kCVPixelBufferHeightKey as String: Int(sourceSize.height),
            kCVPixelBufferMetalCompatibilityKey as String: true,
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: videoInput,
            sourcePixelBufferAttributes: pixelBufferAttrs
        )
        writer.add(videoInput)

        // Audio input (passthrough — requires format hint for MP4 container)
        var audioInput: AVAssetWriterInput?
        if let audioTrack = sourceAudioTrack {
            let formatHint = audioTrack.formatDescriptions.first as! CMFormatDescription
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: formatHint)
            input.expectsMediaDataInRealTime = false
            writer.add(input)
            audioInput = input
        }

        // Start
        sourceReader.startReading()
        overlayReader.startReading()
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)

        // Compute overlay scale if needed
        let scaleWidth = overlayScaleWidth ?? Int(overlayVideoTrack.naturalSize.width)
        let scaleHeight = overlayScaleHeight ?? Int(overlayVideoTrack.naturalSize.height)

        // Create reusable textures
        let textureLoader = MTKTextureLoader(device: device)
        let outputWidth = Int(sourceSize.width)
        let outputHeight = Int(sourceSize.height)

        let outputTextureDesc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm,
            width: outputWidth,
            height: outputHeight,
            mipmapped: false
        )
        outputTextureDesc.usage = [.shaderRead, .shaderWrite]
        outputTextureDesc.storageMode = .shared

        guard let outputTexture = device.makeTexture(descriptor: outputTextureDesc) else {
            throw CompositorError.textureCreationFailed
        }

        // Process frames
        var frameIndex = 0
        let frameDuration = CMTime(value: 1000, timescale: CMTimeScale(fps * 1000))

        while sourceReader.status == .reading {
            guard let sourceSample = sourceOutput.copyNextSampleBuffer() else { break }
            guard let sourcePixelBuffer = CMSampleBufferGetImageBuffer(sourceSample) else { continue }

            // Get overlay frame (may have ended — if so, use empty/transparent)
            let overlayPixelBuffer: CVPixelBuffer?
            if overlayReader.status == .reading {
                if let overlaySample = overlayOutput.copyNextSampleBuffer() {
                    overlayPixelBuffer = CMSampleBufferGetImageBuffer(overlaySample)
                } else {
                    overlayPixelBuffer = nil
                }
            } else {
                overlayPixelBuffer = nil
            }

            // Create Metal textures from pixel buffers
            let sourceTexture = try createTexture(from: sourcePixelBuffer)

            if let overlayPB = overlayPixelBuffer {
                let rawOverlayTexture = try createTexture(from: overlayPB)

                // Scale overlay if needed and composite
                let scaledOverlay: MTLTexture
                if scaleWidth != Int(overlayVideoTrack.naturalSize.width) ||
                   scaleHeight != Int(overlayVideoTrack.naturalSize.height) {
                    scaledOverlay = try scaleTexture(
                        rawOverlayTexture,
                        toWidth: scaleWidth,
                        toHeight: scaleHeight
                    )
                } else {
                    scaledOverlay = rawOverlayTexture
                }

                // Composite: position overlay at (overlayX, overlayY) on source
                try compositeFrame(
                    source: sourceTexture,
                    overlay: scaledOverlay,
                    output: outputTexture,
                    overlayX: overlayX,
                    overlayY: overlayY,
                    outputWidth: outputWidth,
                    outputHeight: outputHeight
                )
            } else {
                // No overlay frame — copy source directly
                try copyTexture(from: sourceTexture, to: outputTexture)
            }

            // Read pixels back to a pixel buffer for the writer
            let presentationTime = CMTime(
                value: CMTimeValue(frameIndex) * frameDuration.value,
                timescale: frameDuration.timescale
            )

            while !videoInput.isReadyForMoreMediaData {
                Thread.sleep(forTimeInterval: 0.001)
            }

            guard let outputPixelBuffer = createPixelBuffer(from: outputTexture, pool: adaptor.pixelBufferPool!) else {
                throw CompositorError.pixelBufferCreationFailed
            }
            adaptor.append(outputPixelBuffer, withPresentationTime: presentationTime)

            frameIndex += 1
            if frameIndex % 30 == 0 {
                onProgress(frameIndex, totalFrames)
            }
        }

        // Write remaining audio
        if let audioOut = audioOutput, let audioIn = audioInput {
            while sourceReader.status == .reading {
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
    }

    // MARK: - Metal helpers

    private func createTexture(from pixelBuffer: CVPixelBuffer) throws -> MTLTexture {
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)

        var cvTexture: CVMetalTexture?
        var textureCache: CVMetalTextureCache?
        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &textureCache)

        let status = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault,
            textureCache!,
            pixelBuffer,
            nil,
            .bgra8Unorm,
            width,
            height,
            0,
            &cvTexture
        )
        guard status == kCVReturnSuccess, let cvTex = cvTexture else {
            throw CompositorError.textureCreationFailed
        }
        guard let texture = CVMetalTextureGetTexture(cvTex) else {
            throw CompositorError.textureCreationFailed
        }
        return texture
    }

    private func scaleTexture(_ source: MTLTexture, toWidth width: Int, toHeight height: Int) throws -> MTLTexture {
        let desc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm, width: width, height: height, mipmapped: false
        )
        desc.usage = [.shaderRead, .shaderWrite]
        desc.storageMode = .shared
        guard let dest = device.makeTexture(descriptor: desc) else {
            throw CompositorError.textureCreationFailed
        }

        // Use CIImage for high-quality scale (uses Metal internally)
        let ciImage = CIImage(mtlTexture: source, options: nil)!
        let scaleX = Double(width) / Double(source.width)
        let scaleY = Double(height) / Double(source.height)
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        ciContext.render(scaled, to: dest, commandBuffer: nil, bounds: scaled.extent, colorSpace: CGColorSpaceCreateDeviceRGB())
        return dest
    }

    private func compositeFrame(
        source: MTLTexture,
        overlay: MTLTexture,
        output: MTLTexture,
        overlayX: Int,
        overlayY: Int,
        outputWidth: Int,
        outputHeight: Int
    ) throws {
        // First, copy source to output
        try copyTexture(from: source, to: output)

        // Then blend overlay at the specified position
        // We need a positioned overlay texture (full frame with overlay placed)
        let positionedDesc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm, width: outputWidth, height: outputHeight, mipmapped: false
        )
        positionedDesc.usage = [.shaderRead, .shaderWrite]
        positionedDesc.storageMode = .shared
        guard let positionedOverlay = device.makeTexture(descriptor: positionedDesc) else {
            throw CompositorError.textureCreationFailed
        }

        // Clear to transparent
        let clearRegion = MTLRegion(origin: .init(x: 0, y: 0, z: 0),
                                     size: .init(width: outputWidth, height: outputHeight, depth: 1))
        let zeros = [UInt8](repeating: 0, count: outputWidth * outputHeight * 4)
        positionedOverlay.replace(region: clearRegion, mipmapLevel: 0, withBytes: zeros, bytesPerRow: outputWidth * 4)

        // Copy overlay into positioned texture at (overlayX, overlayY)
        let copyWidth = min(overlay.width, outputWidth - overlayX)
        let copyHeight = min(overlay.height, outputHeight - overlayY)
        if copyWidth > 0 && copyHeight > 0 {
            guard let cmd = commandQueue.makeCommandBuffer(),
                  let blit = cmd.makeBlitCommandEncoder() else {
                throw CompositorError.commandBufferFailed
            }
            blit.copy(
                from: overlay, sourceSlice: 0, sourceLevel: 0,
                sourceOrigin: .init(x: 0, y: 0, z: 0),
                sourceSize: .init(width: copyWidth, height: copyHeight, depth: 1),
                to: positionedOverlay, destinationSlice: 0, destinationLevel: 0,
                destinationOrigin: .init(x: overlayX, y: overlayY, z: 0)
            )
            blit.endEncoding()
            cmd.commit()
            cmd.waitUntilCompleted()
        }

        // Run alpha composite shader
        guard let commandBuffer = commandQueue.makeCommandBuffer(),
              let encoder = commandBuffer.makeComputeCommandEncoder() else {
            throw CompositorError.commandBufferFailed
        }

        encoder.setComputePipelineState(pipelineState)
        encoder.setTexture(output, index: 0)           // source (already has source video)
        encoder.setTexture(positionedOverlay, index: 1) // overlay
        encoder.setTexture(output, index: 2)            // output (in-place)

        let threadgroupSize = MTLSize(width: 16, height: 16, depth: 1)
        let threadgroups = MTLSize(
            width: (outputWidth + 15) / 16,
            height: (outputHeight + 15) / 16,
            depth: 1
        )
        encoder.dispatchThreadgroups(threadgroups, threadsPerThreadgroup: threadgroupSize)
        encoder.endEncoding()
        commandBuffer.commit()
        commandBuffer.waitUntilCompleted()
    }

    private func copyTexture(from source: MTLTexture, to dest: MTLTexture) throws {
        guard let cmd = commandQueue.makeCommandBuffer(),
              let blit = cmd.makeBlitCommandEncoder() else {
            throw CompositorError.commandBufferFailed
        }
        let size = MTLSize(width: min(source.width, dest.width),
                           height: min(source.height, dest.height), depth: 1)
        blit.copy(from: source, sourceSlice: 0, sourceLevel: 0, sourceOrigin: .init(x: 0, y: 0, z: 0), sourceSize: size,
                  to: dest, destinationSlice: 0, destinationLevel: 0, destinationOrigin: .init(x: 0, y: 0, z: 0))
        blit.endEncoding()
        cmd.commit()
        cmd.waitUntilCompleted()
    }

    private func createPixelBuffer(from texture: MTLTexture, pool: CVPixelBufferPool) -> CVPixelBuffer? {
        var pixelBuffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
        guard let pb = pixelBuffer else { return nil }

        CVPixelBufferLockBaseAddress(pb, [])
        let dest = CVPixelBufferGetBaseAddress(pb)!
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pb)
        let region = MTLRegion(origin: .init(x: 0, y: 0, z: 0),
                                size: .init(width: texture.width, height: texture.height, depth: 1))
        texture.getBytes(dest, bytesPerRow: bytesPerRow, from: region, mipmapLevel: 0)
        CVPixelBufferUnlockBaseAddress(pb, [])

        return pb
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
        case .shaderNotFound: return "Alpha composite shader not found in bundle"
        case .noVideoTrack(let name): return "No video track in \(name)"
        case .textureCreationFailed: return "Failed to create Metal texture"
        case .commandBufferFailed: return "Failed to create Metal command buffer"
        case .pixelBufferCreationFailed: return "Failed to create output pixel buffer"
        case .writerFailed(let msg): return "AVAssetWriter failed: \(msg)"
        }
    }
}
