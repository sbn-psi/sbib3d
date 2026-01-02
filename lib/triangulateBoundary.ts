/**
 * Triangulates a boundary polygon using a triangle fan.
 * 
 * Assumes the boundary is ordered and does not self-intersect.
 * Creates triangles by connecting all vertices to the first vertex.
 * 
 * @param boundaryMeters - Float32Array of XYZ coordinates in meters (interleaved: x, y, z, x, y, z, ...)
 * @returns Float32Array of triangle vertices (interleaved XYZ for each triangle vertex)
 */
export function triangulateFanXYZ(boundaryMeters: Float32Array): Float32Array {
  const vertexCount = boundaryMeters.length / 3;
  
  if (vertexCount < 3) {
    throw new Error(`Insufficient vertices for triangulation: ${vertexCount}. Need at least 3.`);
  }

  // Triangle fan: for n vertices, we create (n-2) triangles
  // Each triangle uses: vertex 0, vertex i, vertex i+1 (for i from 1 to n-2)
  const triangleCount = vertexCount - 2;
  const trianglesMeters = new Float32Array(triangleCount * 3 * 3); // 3 vertices per triangle, 3 coords per vertex

  // First vertex (anchor for the fan)
  const x0 = boundaryMeters[0];
  const y0 = boundaryMeters[1];
  const z0 = boundaryMeters[2];

  // Create triangles
  for (let i = 0; i < triangleCount; i++) {
    const vertex1Idx = (i + 1) * 3;
    const vertex2Idx = (i + 2) * 3;

    const x1 = boundaryMeters[vertex1Idx];
    const y1 = boundaryMeters[vertex1Idx + 1];
    const z1 = boundaryMeters[vertex1Idx + 2];

    const x2 = boundaryMeters[vertex2Idx];
    const y2 = boundaryMeters[vertex2Idx + 1];
    const z2 = boundaryMeters[vertex2Idx + 2];

    // Triangle vertex 0 (anchor)
    const triIdx = i * 9;
    trianglesMeters[triIdx] = x0;
    trianglesMeters[triIdx + 1] = y0;
    trianglesMeters[triIdx + 2] = z0;

    // Triangle vertex 1
    trianglesMeters[triIdx + 3] = x1;
    trianglesMeters[triIdx + 4] = y1;
    trianglesMeters[triIdx + 5] = z1;

    // Triangle vertex 2
    trianglesMeters[triIdx + 6] = x2;
    trianglesMeters[triIdx + 7] = y2;
    trianglesMeters[triIdx + 8] = z2;
  }

  return trianglesMeters;
}


