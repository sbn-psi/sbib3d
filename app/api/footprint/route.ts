import { NextRequest, NextResponse } from 'next/server';
import { fetchFootprintPolygon } from '@/lib/wgc2Footprint';
import { triangulateFanXYZ } from '@/lib/triangulateBoundary';
import {
  DEFAULT_KERNEL_SET_ID,
  DEFAULT_SHAPE,
  DEFAULT_STATE_REPRESENTATION,
  DEFAULT_FOV,
  DEFAULT_SAMPLES_PER_EDGE,
  DEFAULT_OBSERVER,
} from '@/lib/config';

/**
 * Custom error class for API errors
 */
class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public apiResponse?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * API Route Handler for OCAMS PolyCam FOV Surface Intercepts
 * 
 * This route generates a footprint polygon by sampling multiple FOV boundary rays
 * and computing surface intercepts for each ray using WGC2 SURFACE_INTERCEPT_POINT.
 * 
 * Query Parameters:
 * - utc: UTC timestamp (required)
 * - kernelSetId: Kernel set ID (default: 35)
 * - shape: DSK or ELLIPSOID (default: DSK)
 * - sr: stateRepresentation - RECTANGULAR, PLANETOGRAPHIC, or LATITUDINAL (default: RECTANGULAR)
 * - hh: FOV half horizontal angle in degrees (default: 0.6)
 * - hv: FOV half vertical angle in degrees (default: 0.6)
 * - spe: samples per edge (default: 2)
 * - naifid: Instrument NAIF ID (optional, for metadata)
 * 
 * @param request - Next.js request object
 * @returns JSON response with boundaryMeters, trianglesMeters, and count
 */
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    
    const utc = searchParams.get('utc');
    if (!utc) {
      return NextResponse.json(
        { error: 'Missing required parameter: utc' },
        { status: 400 }
      );
    }

    const kernelSetId = parseInt(searchParams.get('kernelSetId') || String(DEFAULT_KERNEL_SET_ID), 10);
    if (isNaN(kernelSetId)) {
      return NextResponse.json(
        { error: 'Invalid kernelSetId parameter' },
        { status: 400 }
      );
    }

    const shapeParam = searchParams.get('shape');
    const shape: 'DSK' | 'ELLIPSOID' = shapeParam === 'ELLIPSOID' ? 'ELLIPSOID' : DEFAULT_SHAPE;

    const srParam = searchParams.get('sr');
    const stateRepresentation: 'RECTANGULAR' | 'PLANETOGRAPHIC' | 'LATITUDINAL' =
      srParam === 'PLANETOGRAPHIC' ? 'PLANETOGRAPHIC' :
      srParam === 'LATITUDINAL' ? 'LATITUDINAL' :
      DEFAULT_STATE_REPRESENTATION;

    const hhParam = searchParams.get('hh');
    const hvParam = searchParams.get('hv');
    const halfHorizDeg = hhParam ? parseFloat(hhParam) : DEFAULT_FOV.halfHorizDeg;
    const halfVertDeg = hvParam ? parseFloat(hvParam) : DEFAULT_FOV.halfVertDeg;

    if (isNaN(halfHorizDeg) || isNaN(halfVertDeg) || halfHorizDeg <= 0 || halfVertDeg <= 0) {
      return NextResponse.json(
        { error: 'Invalid FOV half-angles (hh, hv). Must be positive numbers.' },
        { status: 400 }
      );
    }

    const speParam = searchParams.get('spe');
    const samplesPerEdge = speParam ? parseInt(speParam, 10) : DEFAULT_SAMPLES_PER_EDGE;
    if (isNaN(samplesPerEdge) || samplesPerEdge < 1) {
      return NextResponse.json(
        { error: 'Invalid samplesPerEdge (spe). Must be a positive integer.' },
        { status: 400 }
      );
    }

    const observerParam = searchParams.get('observer');
    const observer: string | number = observerParam || DEFAULT_OBSERVER;

    // Optional: naifid for metadata (not used in calculation but may be useful for viewer)
    const naifid = searchParams.get('naifid');

    console.log('[Footprint API] Generating footprint polygon:', {
      utc,
      kernelSetId,
      shape,
      stateRepresentation,
      fovHalfAngles: { halfHorizDeg, halfVertDeg },
      samplesPerEdge,
      observer,
      naifid,
    });

    // Fetch footprint polygon
    const { boundaryMeters } = await fetchFootprintPolygon({
      kernelSetId,
      utc,
      observer,
      target: 'BENNU',
      shape,
      stateRepresentation,
      fovHalfAngles: { halfHorizDeg, halfVertDeg },
      samplesPerEdge,
    });

    // Validate boundary size
    const boundaryPointCount = boundaryMeters.length / 3;
    if (boundaryPointCount < 3) {
      console.error('[Footprint API] Insufficient intercepts to form a polygon:', {
        boundarySize: boundaryPointCount,
      });
      return NextResponse.json(
        {
          error: `Insufficient intercepts to form a polygon; boundary size: ${boundaryPointCount}`,
        },
        { status: 422 }
      );
    }

    // Triangulate the boundary
    const trianglesMeters = triangulateFanXYZ(boundaryMeters);

    // Convert Float32Arrays to regular arrays for JSON serialization
    const boundaryArray = Array.from(boundaryMeters);
    const trianglesArray = Array.from(trianglesMeters);

    console.log('[Footprint API] Footprint polygon generated:', {
      boundaryPointCount,
      triangleCount: trianglesMeters.length / 9, // 3 vertices * 3 coords per triangle
    });

    return NextResponse.json({
      boundaryMeters: boundaryArray,
      trianglesMeters: trianglesArray,
      count: {
        boundary: boundaryPointCount,
        triangles: trianglesMeters.length / 9,
      },
    });
  } catch (error: unknown) {
    // Enhanced error handling with detailed logging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const apiResponse = error instanceof APIError ? error.apiResponse : undefined;
    const statusCode = error instanceof APIError ? error.statusCode : undefined;

    console.error('[Footprint API] Error in footprint API route:', {
      error: errorMessage,
      stack: errorStack,
      apiResponse,
      statusCode,
    });

    // Return appropriate error response
    if (error instanceof APIError) {
      return NextResponse.json(
        {
          error: error.message,
          statusCode: error.statusCode,
          details: error.apiResponse,
        },
        { status: error.statusCode }
      );
    }

    // Handle unexpected errors
    return NextResponse.json(
      {
        error: errorMessage,
        statusCode: 500,
      },
      { status: 500 }
    );
  }
}

