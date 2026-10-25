import { useLiquidMetalShader } from "../lib/useLiquidMetalShader";

export function LiquidMetalEdge({ className = "" }: { className?: string }) {
  const shaderRef = useLiquidMetalShader();
  return (
    <span
      className={`liquid-metal-edge ${className}`.trim()}
      ref={shaderRef}
      aria-hidden="true"
    />
  );
}
