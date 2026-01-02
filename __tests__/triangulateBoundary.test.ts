/**
 * Unit tests for triangulateBoundary.ts
 * 
 * Tests the triangle-fan triangulation function with various boundary configurations.
 */

import { triangulateFanXYZ } from '@/lib/triangulateBoundary';

describe('triangulateFanXYZ', () => {
  it('should throw error for boundary with less than 3 points', () => {
    const boundary = new Float32Array([0, 0, 0, 1, 1, 1]); // Only 2 points
    expect(() => triangulateFanXYZ(boundary)).toThrow(/Insufficient vertices/);
  });

  it('should triangulate a triangle (3 vertices) into 1 triangle', () => {
    // Create a triangle with 3 vertices
    const boundary = new Float32Array([
      0, 0, 0,    // v0
      1, 0, 0,    // v1
      0.5, 1, 0,  // v2
    ]);
    
    const result = triangulateFanXYZ(boundary);
    
    // Should have 1 triangle = 3 vertices * 3 coords = 9 values
    expect(result.length).toBe(9);
    
    // Verify the triangle contains the three vertices
    expect(result[0]).toBe(0);   // v0.x
    expect(result[1]).toBe(0);   // v0.y
    expect(result[2]).toBe(0);   // v0.z
    expect(result[3]).toBe(1);   // v1.x
    expect(result[4]).toBe(0);   // v1.y
    expect(result[5]).toBe(0);   // v1.z
    expect(result[6]).toBe(0.5); // v2.x
    expect(result[7]).toBe(1);   // v2.y
    expect(result[8]).toBe(0);   // v2.z
  });

  it('should triangulate a rectangle (4 vertices) into 2 triangles', () => {
    // Create a rectangle with 4 vertices
    const boundary = new Float32Array([
      0, 0, 0,    // v0 (bottom-left)
      1, 0, 0,    // v1 (bottom-right)
      1, 1, 0,    // v2 (top-right)
      0, 1, 0,   // v3 (top-left)
    ]);
    
    const result = triangulateFanXYZ(boundary);
    
    // Should have 2 triangles = 6 vertices * 3 coords = 18 values
    expect(result.length).toBe(18);
    
    // First triangle: v0, v1, v2
    expect(result[0]).toBe(0);   // v0.x
    expect(result[1]).toBe(0);   // v0.y
    expect(result[2]).toBe(0);   // v0.z
    expect(result[3]).toBe(1);   // v1.x
    expect(result[4]).toBe(0);   // v1.y
    expect(result[5]).toBe(0);   // v1.z
    expect(result[6]).toBe(1);   // v2.x
    expect(result[7]).toBe(1);   // v2.y
    expect(result[8]).toBe(0);   // v2.z
    
    // Second triangle: v0, v2, v3
    expect(result[9]).toBe(0);   // v0.x
    expect(result[10]).toBe(0);  // v0.y
    expect(result[11]).toBe(0);   // v0.z
    expect(result[12]).toBe(1);   // v2.x
    expect(result[13]).toBe(1);   // v2.y
    expect(result[14]).toBe(0);   // v2.z
    expect(result[15]).toBe(0);   // v3.x
    expect(result[16]).toBe(1);   // v3.y
    expect(result[17]).toBe(0);   // v3.z
  });

  it('should triangulate a hexagon (6 vertices) into 4 triangles', () => {
    // Create a hexagon with 6 vertices on a circle
    const radius = 1;
    const boundary = new Float32Array([
      radius, 0, 0,                    // v0 (right)
      radius * 0.5, radius * 0.866, 0, // v1 (top-right)
      -radius * 0.5, radius * 0.866, 0, // v2 (top-left)
      -radius, 0, 0,                    // v3 (left)
      -radius * 0.5, -radius * 0.866, 0, // v4 (bottom-left)
      radius * 0.5, -radius * 0.866, 0, // v5 (bottom-right)
    ]);
    
    const result = triangulateFanXYZ(boundary);
    
    // Should have 4 triangles = 12 vertices * 3 coords = 36 values
    expect(result.length).toBe(36);
    
    // Verify first triangle (v0, v1, v2)
    expect(result[0]).toBe(radius);              // v0.x
    expect(result[1]).toBe(0);                    // v0.y
    expect(result[2]).toBe(0);                    // v0.z
    expect(result[3]).toBeCloseTo(radius * 0.5);  // v1.x
    expect(result[4]).toBeCloseTo(radius * 0.866); // v1.y
    expect(result[5]).toBe(0);                    // v1.z
    expect(result[6]).toBeCloseTo(-radius * 0.5); // v2.x
    expect(result[7]).toBeCloseTo(radius * 0.866); // v2.y
    expect(result[8]).toBe(0);                    // v2.z
    
    // Verify last triangle (v0, v4, v5)
    const lastTriangleStart = 27; // 9 * 3 triangles before
    expect(result[lastTriangleStart]).toBe(radius);              // v0.x
    expect(result[lastTriangleStart + 1]).toBe(0);                // v0.y
    expect(result[lastTriangleStart + 2]).toBe(0);                // v0.z
    expect(result[lastTriangleStart + 3]).toBeCloseTo(-radius * 0.5); // v4.x
    expect(result[lastTriangleStart + 4]).toBeCloseTo(-radius * 0.866); // v4.y
    expect(result[lastTriangleStart + 5]).toBe(0);                // v4.z
    expect(result[lastTriangleStart + 6]).toBeCloseTo(radius * 0.5); // v5.x
    expect(result[lastTriangleStart + 7]).toBeCloseTo(-radius * 0.866); // v5.y
    expect(result[lastTriangleStart + 8]).toBe(0);                // v5.z
  });

  it('should handle 3D coordinates correctly', () => {
    // Create a boundary with 3D coordinates
    const boundary = new Float32Array([
      0, 0, 0,    // v0
      1, 0, 1,    // v1
      0.5, 1, 0.5, // v2
    ]);
    
    const result = triangulateFanXYZ(boundary);
    
    expect(result.length).toBe(9);
    expect(result[2]).toBe(0);   // v0.z
    expect(result[5]).toBe(1);   // v1.z
    expect(result[8]).toBe(0.5); // v2.z
  });

  it('should preserve vertex order for ordered boundary', () => {
    // Create a boundary with 5 vertices in a specific order
    const boundary = new Float32Array([
      0, 0, 0,    // v0
      1, 0, 0,    // v1
      2, 1, 0,    // v2
      1, 2, 0,    // v3
      0, 1, 0,   // v4
    ]);
    
    const result = triangulateFanXYZ(boundary);
    
    // Should have 3 triangles = 9 vertices * 3 coords = 27 values
    expect(result.length).toBe(27);
    
    // All triangles should start with v0
    expect(result[0]).toBe(0);   // First triangle: v0.x
    expect(result[9]).toBe(0);   // Second triangle: v0.x
    expect(result[18]).toBe(0);   // Third triangle: v0.x
    
    // Verify the order of vertices in the first triangle
    expect(result[3]).toBe(1);   // v1.x
    expect(result[6]).toBe(2);    // v2.x
  });
});

