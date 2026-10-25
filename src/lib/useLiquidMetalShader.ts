import { useEffect, useRef } from "react";
import { liquidMetalFragmentShader, ShaderMount } from "@paper-design/shaders";

export function useLiquidMetalShader() {
  const shaderRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!shaderRef.current) return;
    const shader = new ShaderMount(
      shaderRef.current,
      liquidMetalFragmentShader,
      {
        u_repetition: 1.5,
        u_softness: 0.5,
        u_shiftRed: 0.3,
        u_shiftBlue: 0.3,
        u_distortion: 0,
        u_contour: 0,
        u_angle: 100,
        u_scale: 1.5,
        u_shape: 1,
        u_offsetX: 0.1,
        u_offsetY: -0.1,
      },
      undefined,
      0.6,
    );
    return () => shader.dispose();
  }, []);

  return shaderRef;
}
