// d3-force-3d ships no type declarations; we only use forceCollide.
declare module 'd3-force-3d' {
  export function forceCollide(
    radius?: number | ((node: unknown) => number),
  ): unknown;
}
