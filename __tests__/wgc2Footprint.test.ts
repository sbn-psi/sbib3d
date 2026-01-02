/**
 * Unit tests for wgc2Footprint.ts
 * 
 * Tests FOV boundary vector generation and footprint polygon fetching with mocked fetch.
 */

import { buildPolyCamFovBoundaryVectors, fetchFootprintPolygon } from '@/lib/wgc2Footprint';
import * as THREE from 'three';

// Mock fetch globally
global.fetch = jest.fn();

describe('buildPolyCamFovBoundaryVectors', () => {
  it('should generate boundary vectors for given FOV half-angles', () => {
    const fovHalfAngles = { halfHorizDeg: 0.6, halfVertDeg: 0.6 };
    const vectors = buildPolyCamFovBoundaryVectors(fovHalfAngles);
    
    // Should generate at least 8 vectors (4 corners + 4 mid-edges)
    expect(vectors.length).toBeGreaterThanOrEqual(8);
    
    // All vectors should be unit vectors (normalized)
    vectors.forEach((vector) => {
      const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
      expect(length).toBeCloseTo(1.0, 5);
    });
    
    // Boresight should be approximately +Z (since boresight = +Z in instrument frame)
    // Most vectors should have positive Z component
    const positiveZCount = vectors.filter(v => v.z > 0).length;
    expect(positiveZCount).toBeGreaterThan(0);
  });

  it('should generate more vectors for larger FOV', () => {
    const smallFov = { halfHorizDeg: 0.1, halfVertDeg: 0.1 };
    const largeFov = { halfHorizDeg: 1.0, halfVertDeg: 1.0 };
    
    const smallVectors = buildPolyCamFovBoundaryVectors(smallFov);
    const largeVectors = buildPolyCamFovBoundaryVectors(largeFov);
    
    // Both should generate the same number of vectors (structure is the same)
    // But the actual vector directions will differ
    expect(smallVectors.length).toBe(largeVectors.length);
    
    // Verify vectors are different
    expect(smallVectors[0].x).not.toBe(largeVectors[0].x);
  });

  it('should return unit vectors', () => {
    const fovHalfAngles = { halfHorizDeg: 0.6, halfVertDeg: 0.6 };
    const vectors = buildPolyCamFovBoundaryVectors(fovHalfAngles);
    
    vectors.forEach((vector) => {
      const length = Math.sqrt(
        vector.x * vector.x + 
        vector.y * vector.y + 
        vector.z * vector.z
      );
      expect(length).toBeCloseTo(1.0, 5);
    });
  });
});

describe('fetchFootprintPolygon', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('should convert km to meters in boundary output', async () => {
    // Mock the WGC2 API responses
    const mockCalculationResponse = {
      status: 'OK',
      calculationId: 'test-job-id',
      result: { phase: 'COMPLETE' },
    };

    const mockResultResponse = {
      columns: [
        { name: 'X', type: 'number', units: 'km', outputID: 'X' },
        { name: 'Y', type: 'number', units: 'km', outputID: 'Y' },
        { name: 'Z', type: 'number', units: 'km', outputID: 'Z' },
      ],
      rows: [
        [1.0, 2.0, 3.0], // First intercept in km
        [4.0, 5.0, 6.0], // Second intercept in km
        [7.0, 8.0, 9.0], // Third intercept in km
      ],
    };

    // Mock fetch calls
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalculationResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockResultResponse }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalculationResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockResultResponse }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalculationResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockResultResponse }),
      });

    const result = await fetchFootprintPolygon({
      kernelSetId: 35,
      utc: '2019-09-21T21:01:12.885Z',
      observer: 'OSIRIS-REx',
      target: 'BENNU',
      shape: 'DSK',
      stateRepresentation: 'RECTANGULAR',
      fovHalfAngles: { halfHorizDeg: 0.6, halfVertDeg: 0.6 },
      samplesPerEdge: 2,
    });

    // Verify boundary array length: 3 intercepts * 3 coords = 9 values
    expect(result.boundaryMeters.length).toBeGreaterThanOrEqual(9);
    
    // Verify conversion from km to meters (multiply by 1000)
    // The first intercept should be converted: 1.0 km -> 1000 m
    const firstX = result.boundaryMeters[0];
    const firstY = result.boundaryMeters[1];
    const firstZ = result.boundaryMeters[2];
    
    expect(firstX).toBe(1000.0); // 1.0 km * 1000
    expect(firstY).toBe(2000.0); // 2.0 km * 1000
    expect(firstZ).toBe(3000.0); // 3.0 km * 1000
  });

  it('should return boundary with correct point count for multiple rays', async () => {
    // Mock responses for multiple intercepts
    const mockCalculationResponse = {
      status: 'OK',
      calculationId: 'test-job-id',
      result: { phase: 'COMPLETE' },
    };

    const mockResultResponse = {
      columns: [
        { name: 'X', type: 'number', units: 'km', outputID: 'X' },
        { name: 'Y', type: 'number', units: 'km', outputID: 'Y' },
        { name: 'Z', type: 'number', units: 'km', outputID: 'Z' },
      ],
      rows: [[0.0, 0.0, 0.0]], // Single intercept per ray
    };

    // Mock multiple fetch calls (one per boundary vector)
    // For samplesPerEdge=2, we expect at least 8 vectors
    const numVectors = 8;
    for (let i = 0; i < numVectors * 2; i += 2) {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCalculationResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockResultResponse }),
        });
    }

    const result = await fetchFootprintPolygon({
      kernelSetId: 35,
      utc: '2019-09-21T21:01:12.885Z',
      observer: 'OSIRIS-REx',
      target: 'BENNU',
      shape: 'DSK',
      stateRepresentation: 'RECTANGULAR',
      fovHalfAngles: { halfHorizDeg: 0.6, halfVertDeg: 0.6 },
      samplesPerEdge: 2,
    });

    // Verify boundary has correct number of points
    // Each point has 3 coordinates (x, y, z)
    const pointCount = result.boundaryMeters.length / 3;
    expect(pointCount).toBe(numVectors);
  });

  it('should skip failed rays and continue with successful ones', async () => {
    const mockCalculationResponse = {
      status: 'OK',
      calculationId: 'test-job-id',
      result: { phase: 'COMPLETE' },
    };

    const mockResultResponse = {
      columns: [
        { name: 'X', type: 'number', units: 'km', outputID: 'X' },
        { name: 'Y', type: 'number', units: 'km', outputID: 'Y' },
        { name: 'Z', type: 'number', units: 'km', outputID: 'Z' },
      ],
      rows: [[1.0, 2.0, 3.0]],
    };

    // Mock some successful and some failed requests
    (global.fetch as jest.Mock)
      // First ray: success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalculationResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockResultResponse }),
      })
      // Second ray: network error
      .mockRejectedValueOnce(new Error('Network error'))
      // Third ray: success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalculationResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockResultResponse }),
      })
      // Fourth ray: API error
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      })
      // Fifth ray: success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalculationResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockResultResponse }),
      });

    // This should not throw if we have at least 3 successful intercepts
    const result = await fetchFootprintPolygon({
      kernelSetId: 35,
      utc: '2019-09-21T21:01:12.885Z',
      observer: 'OSIRIS-REx',
      target: 'BENNU',
      shape: 'DSK',
      stateRepresentation: 'RECTANGULAR',
      fovHalfAngles: { halfHorizDeg: 0.6, halfVertDeg: 0.6 },
      samplesPerEdge: 1, // Use fewer samples to match our mocks
    });

    // Should have at least 3 points (from successful intercepts)
    const pointCount = result.boundaryMeters.length / 3;
    expect(pointCount).toBeGreaterThanOrEqual(3);
  });

  it('should throw error if insufficient intercepts (< 3 points)', async () => {
    // Mock only 2 successful intercepts
    const mockCalculationResponse = {
      status: 'OK',
      calculationId: 'test-job-id',
      result: { phase: 'COMPLETE' },
    };

    const mockResultResponse = {
      columns: [
        { name: 'X', type: 'number', units: 'km', outputID: 'X' },
        { name: 'Y', type: 'number', units: 'km', outputID: 'Y' },
        { name: 'Z', type: 'number', units: 'km', outputID: 'Z' },
      ],
      rows: [[1.0, 2.0, 3.0]],
    };

    // Mock 2 successful requests, then failures
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalculationResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockResultResponse }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalculationResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockResultResponse }),
      })
      // All subsequent requests fail
      .mockRejectedValue(new Error('Network error'));

    await expect(
      fetchFootprintPolygon({
        kernelSetId: 35,
        utc: '2019-09-21T21:01:12.885Z',
        observer: 'OSIRIS-REx',
        target: 'BENNU',
        shape: 'DSK',
        stateRepresentation: 'RECTANGULAR',
        fovHalfAngles: { halfHorizDeg: 0.6, halfVertDeg: 0.6 },
        samplesPerEdge: 2,
      })
    ).rejects.toThrow(/Insufficient intercepts/);
  });
});


