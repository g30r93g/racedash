import AVFoundation
import CoreImage
import CoreVideo
import Foundation
import Metal

struct CompositeParams {
    var overlayOffset: SIMD2<UInt32>
    var overlaySize: SIMD2<UInt32>
}

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

        // Source video: decode to BGRA with correct BT.709 color matrix
        // Without explicit color properties, AVFoundation may use BT.601 matrix
        // which shifts R/G channels ~17% brighter for BT.709 content.
        let sourceOutput = AVAssetReaderTrackOutput(track: sourceVideoTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferMetalCompatibilityKey as String: true,
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ] as [String: Any],
        ])
        sourceOutput.alwaysCopiesSampleData = false
        sourceReader.add(sourceOutput)

        // Overlay: decode to BGRA (sRGB from Remotion ProRes)
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

        // Params buffer for composite shader (overlay position + size)
        var compositeParams = CompositeParams(
            overlayOffset: SIMD2<UInt32>(UInt32(overlayX), UInt32(overlayY)),
            overlaySize: SIMD2<UInt32>(UInt32(scaleWidth), UInt32(scaleHeight))
        )

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

        // Double-buffered pipeline:
        //   Producer thread: decode → composite → push to ring buffer
        //   Writer callback: pop from ring buffer → append (instant)
        // The producer runs ahead of the encoder, so frames are always ready when the encoder asks.

        struct CompositeFrame {
            let pixelBuffer: CVPixelBuffer
            let presentationTime: CMTime
        }

        let bufferCapacity = 8 // ring buffer size — enough to absorb encoder latency
        var ring: [CompositeFrame] = []
        let ringLock = NSCondition()
        var producerDone = false
        var producerError: Error?

        var frameIndex = 0
        var audioFinished = audioOutput == nil
        var videoFinished = false

        let writerQueue = DispatchQueue(label: "com.racedash.metal-composite.writer", qos: .userInitiated)
        let audioQueue = DispatchQueue(label: "com.racedash.metal-composite.audio", qos: .userInitiated)
        let completionSemaphore = DispatchSemaphore(value: 0)

        // Producer: decode + composite on current thread, push to ring buffer
        let producerThread = Thread {
            var produced = 0
            while sourceReader.status == .reading {
                guard let sourceSample = sourceOutput.copyNextSampleBuffer() else { break }
                guard let sourcePixelBuffer = CMSampleBufferGetImageBuffer(sourceSample) else { continue }
                let presentationTime = CMSampleBufferGetPresentationTimeStamp(sourceSample)

                let overlayPixelBuffer: CVPixelBuffer?
                if overlayReader.status == .reading,
                   let overlaySample = overlayOutput.copyNextSampleBuffer() {
                    overlayPixelBuffer = CMSampleBufferGetImageBuffer(overlaySample)
                } else {
                    overlayPixelBuffer = nil
                }

                do {
                    guard let pool = adaptor.pixelBufferPool else {
                        throw CompositorError.pixelBufferCreationFailed
                    }
                    var outPB: CVPixelBuffer?
                    CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &outPB)
                    guard let outputPB = outPB else {
                        throw CompositorError.pixelBufferCreationFailed
                    }
                    let outputPBTexture = try self.makeTexture(from: outputPB)
                    let sourceTexture = try self.makeTexture(from: sourcePixelBuffer)

                    if let overlayPB = overlayPixelBuffer {
                        let rawOverlayTexture = try self.makeTexture(from: overlayPB)

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

                        try self.runCompositeShader(
                            source: sourceTexture, overlay: overlayToUse, output: outputPBTexture,
                            params: &compositeParams
                        )
                    } else {
                        try self.blitCopy(from: sourceTexture, to: outputPBTexture)
                    }

                    // Push to ring buffer (block if full)
                    ringLock.lock()
                    while ring.count >= bufferCapacity {
                        ringLock.wait()
                    }
                    ring.append(CompositeFrame(pixelBuffer: outputPB, presentationTime: presentationTime))
                    ringLock.signal()
                    ringLock.unlock()

                    produced += 1
                    if produced % 300 == 0 {
                        let p = produced
                        let rc = ring.count
                        DispatchQueue.global(qos: .utility).async {
                            self.dbg("produced \(p)/\(totalFrames), ring: \(rc)")
                        }
                    }
                } catch {
                    ringLock.lock()
                    producerError = error
                    producerDone = true
                    ringLock.signal()
                    ringLock.unlock()
                    return
                }
            }

            ringLock.lock()
            producerDone = true
            ringLock.signal()
            ringLock.unlock()
            self.dbg("producer finished: \(produced) frames")
        }
        producerThread.qualityOfService = .userInitiated
        producerThread.start()

        // Consumer: writer pulls from ring buffer when encoder is ready
        videoInput.requestMediaDataWhenReady(on: writerQueue) {
            while videoInput.isReadyForMoreMediaData {
                ringLock.lock()
                while ring.isEmpty && !producerDone {
                    ringLock.wait()
                }

                if let error = producerError {
                    ringLock.unlock()
                    videoInput.markAsFinished()
                    videoFinished = true
                    // Store error for main thread
                    ringLock.lock()
                    producerError = error
                    ringLock.unlock()
                    if audioFinished { completionSemaphore.signal() }
                    return
                }

                if ring.isEmpty && producerDone {
                    ringLock.unlock()
                    videoInput.markAsFinished()
                    videoFinished = true
                    if audioFinished { completionSemaphore.signal() }
                    return
                }

                let frame = ring.removeFirst()
                ringLock.signal()
                ringLock.unlock()

                adaptor.append(frame.pixelBuffer, withPresentationTime: frame.presentationTime)

                frameIndex += 1
                if frameIndex % 120 == 0 {
                    // Report progress on a background queue to avoid blocking the writer callback
                    let fi = frameIndex
                    let rc = ring.count
                    DispatchQueue.global(qos: .utility).async {
                        onProgress(fi, totalFrames)
                        if fi % 300 == 0 {
                            self.dbg("appended \(fi)/\(totalFrames), ring: \(rc)")
                        }
                    }
                }
            }
        }

        // Audio: writer pulls samples when ready
        if let audioOut = audioOutput, let audioIn = audioInput {
            audioIn.requestMediaDataWhenReady(on: audioQueue) {
                while audioIn.isReadyForMoreMediaData {
                    guard let sample = audioOut.copyNextSampleBuffer() else {
                        audioIn.markAsFinished()
                        audioFinished = true
                        if videoFinished { completionSemaphore.signal() }
                        return
                    }
                    audioIn.append(sample)
                }
            }
        }

        // Wait for both video and audio to finish
        completionSemaphore.wait()

        if let error = producerError {
            throw error
        }

        let finishSemaphore = DispatchSemaphore(value: 0)
        writer.finishWriting { finishSemaphore.signal() }
        finishSemaphore.wait()

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

    private func runCompositeShader(
        source: MTLTexture, overlay: MTLTexture, output: MTLTexture,
        params: inout CompositeParams
    ) throws {
        guard let cmd = commandQueue.makeCommandBuffer(),
              let encoder = cmd.makeComputeCommandEncoder() else {
            throw CompositorError.commandBufferFailed
        }

        encoder.setComputePipelineState(pipelineState)
        encoder.setTexture(source, index: 0)
        encoder.setTexture(overlay, index: 1)
        encoder.setTexture(output, index: 2)
        encoder.setBytes(&params, length: MemoryLayout<CompositeParams>.size, index: 0)

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
