#include <metal_stdlib>
using namespace metal;

struct CompositeParams {
    uint2 overlayOffset;   // (x, y) position of overlay on source
    uint2 overlaySize;     // width, height of the overlay texture
};

/// Alpha-composite overlay onto source video with positioning.
/// Reads overlay at (gid - offset) when gid is within the overlay region.
/// Outside the overlay region, source passes through unchanged.
kernel void alphaComposite(
    texture2d<float, access::read>  source   [[texture(0)]],
    texture2d<float, access::read>  overlay  [[texture(1)]],
    texture2d<float, access::write> output   [[texture(2)]],
    constant CompositeParams&       params   [[buffer(0)]],
    uint2                           gid      [[thread_position_in_grid]])
{
    if (gid.x >= output.get_width() || gid.y >= output.get_height()) return;

    float4 src = source.read(gid);

    // Check if this pixel falls within the overlay region
    uint2 ovPos = gid - params.overlayOffset;
    if (gid.x >= params.overlayOffset.x && gid.y >= params.overlayOffset.y &&
        ovPos.x < params.overlaySize.x && ovPos.y < params.overlaySize.y)
    {
        float4 ov = overlay.read(ovPos);
        // Premultiplied alpha composite (AVFoundation BGRA output is premultiplied)
        // ov.rgb already contains color * alpha, so: result = ov + src * (1 - ov.a)
        float4 result = float4(
            ov.rgb + src.rgb * (1.0 - ov.a),
            1.0
        );
        output.write(result, gid);
    } else {
        output.write(src, gid);
    }
}
