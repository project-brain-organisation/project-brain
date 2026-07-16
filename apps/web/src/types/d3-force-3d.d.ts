// d3-force-3d ships no type declarations; declare just the surface we use.
declare module 'd3-force-3d' {
  export interface Force {
    radius(accessor: (node: any) => number): Force;
    iterations(n: number): Force;
    id(accessor: (node: any) => string): Force;
    distance(accessor: (link: any) => number): Force;
    strength(n: number): Force;
  }
  export interface Simulation {
    force(name: string, force: Force): Simulation;
    stop(): Simulation;
    tick(iterations?: number): Simulation;
  }
  export function forceSimulation(nodes?: any[], numDimensions?: number): Simulation;
  export function forceLink(links?: any[]): Force;
  export function forceManyBody(): Force;
  export function forceCollide(radius?: number | ((node: any) => number)): Force;
}
