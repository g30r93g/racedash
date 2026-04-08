#include <metal_stdlib>
using namespace metal;

/// Alpha-composite overlay onto source video.
/// overlay is premultiplied BGRA; source is BGRA.
/// Output: source * (1 - overlay.a) + overlay
kernel void alphaComposite(
    texture2d<float, access::read>  source   [[texture(0)]],
    texture2d<float, access::read>  overlay  [[texture(1)]],
    texture2d<float, access::write> output   [[texture(2)]],
    uint2                           gid      [[thread_position_in_grid]])
{
    if (gid.x >= output.get_width() || gid.y >= output.get_height()) return;

    float4 src = source.read(gid);
    float4 ov  = overlay.read(gid);

    // Standard alpha composite (overlay is premultiplied by Remotion/ProRes)
    float4 result = float4(
        ov.rgb + src.rgb * (1.0 - ov.a),
        1.0
    );

    output.write(result, gid);
}
