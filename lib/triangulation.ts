import * as THREE from 'three';

/**
 * Vertex interface for 3D coordinates
 */
export interface Vertex {
  x: number;
  y: number;
  z: number;
}

/**
 * Creates a fan triangulation of a polygon defined by vertices.
 * 
 * Fan triangulation connects all vertices to the first vertex to form triangles.
 * This is suitable for convex polygons and is the simplest triangulation method.
 * 
 * @param vertices - Array of vertices forming a polygon
 * @returns Array of indices for triangle faces, or null if insufficient vertices
 * 
 * @example
 * const vertices = [{x: 0, y: 0, z: 0}, {x: 1, y: 0, z: 0}, {x: 1, y: 1, z: 0}];
 * const indices = createFanTriangulation(vertices);
 * // Returns: [0, 1, 2] (single triangle)
 */
export function createFanTriangulation(vertices: Vertex[]): number[] | null {
  if (vertices.length < 3) {
    return null;
  }

  const indices: number[] = [];
  
  // Connect all vertices to the first vertex (index 0) to form triangles
  // For n vertices, we create (n-2) triangles
  for (let i = 1; i < vertices.length - 1; i++) {
    indices.push(0, i, i + 1);
  }
  
  return indices;
}

/**
 * Creates a Three.js BufferGeometry from vertices using fan triangulation.
 * 
 * @param vertices - Array of vertices to triangulate
 * @returns THREE.BufferGeometry with positions and indices, or null if invalid
 */
export function createTriangulatedGeometry(vertices: Vertex[]): THREE.BufferGeometry | null {
  if (vertices.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  
  // Create positions array from vertices
  const positions = new Float32Array(vertices.length * 3);
  vertices.forEach((vertex, i) => {
    positions[i * 3] = vertex.x;
    positions[i * 3 + 1] = vertex.y;
    positions[i * 3 + 2] = vertex.z;
  });
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Create indices for fan triangulation
  const indices = createFanTriangulation(vertices);
  if (indices) {
    geometry.setIndex(indices);
  }

  // Compute vertex normals for proper lighting
  geometry.computeVertexNormals();
  
  return geometry;
}

