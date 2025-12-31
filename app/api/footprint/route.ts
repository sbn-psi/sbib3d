import { NextRequest, NextResponse } from 'next/server';

/**
 * WGC2 API Request Interface
 * Defines the structure for submitting a calculation request to WebGeocalc
 */
interface WGC2CalculationRequest {
  calculationType: string;
  kernels?: string[];
  times: string[];
  observer: string;
  target: string;
  referenceFrame?: string;
  aberrationCorrection?: string;
}

/**
 * WGC2 Status Response Interface
 * Response structure when polling for calculation status
 */
interface WGC2StatusResponse {
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  jobId?: string;
  message?: string;
  error?: string;
}

/**
 * WGC2 Result Response Interface
 * Response structure containing the calculation results
 */
interface WGC2ResultResponse {
  vertices?: number[][];
  boundaryMeters?: number;
  data?: any;
  error?: string;
}

/**
 * Custom error class for WGC2 API errors
 */
class WGC2APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public apiResponse?: any
  ) {
    super(message);
    this.name = 'WGC2APIError';
  }
}

/**
 * Validates that a job ID is present and valid
 */
function validateJobId(jobId: any): string {
  if (!jobId || typeof jobId !== 'string') {
    throw new WGC2APIError(
      'Invalid job ID returned from WGC2 API. Expected a string, but received: ' + typeof jobId,
      500
    );
  }
  return jobId;
}

/**
 * Parses and validates vertices from WGC2 result data
 * Handles multiple possible response formats
 */
function parseVertices(resultData: WGC2ResultResponse): { x: number; y: number; z: number }[] {
  const vertices: { x: number; y: number; z: number }[] = [];

  // Format 1: Direct vertices array (array of [x, y, z] arrays)
  if (resultData.vertices && Array.isArray(resultData.vertices)) {
    for (const vertex of resultData.vertices) {
      if (!Array.isArray(vertex) || vertex.length < 3) {
        console.warn('Invalid vertex format:', vertex);
        continue;
      }
      vertices.push({
        x: (vertex[0] ?? 0) * 1000, // Convert km to meters
        y: (vertex[1] ?? 0) * 1000,
        z: (vertex[2] ?? 0) * 1000,
      });
    }
  }
  // Format 2: Data array with object or array points
  else if (resultData.data && Array.isArray(resultData.data)) {
    for (const point of resultData.data) {
      if (Array.isArray(point) && point.length >= 3) {
        vertices.push({
          x: (point[0] ?? 0) * 1000,
          y: (point[1] ?? 0) * 1000,
          z: (point[2] ?? 0) * 1000,
        });
      } else if (point && typeof point === 'object') {
        vertices.push({
          x: ((point as any).x ?? (point as any)[0] ?? 0) * 1000,
          y: ((point as any).y ?? (point as any)[1] ?? 0) * 1000,
          z: ((point as any).z ?? (point as any)[2] ?? 0) * 1000,
        });
      }
    }
  }

  if (vertices.length === 0) {
    throw new WGC2APIError(
      'No valid vertices found in WGC2 result. Expected vertices or data array.',
      500,
      resultData
    );
  }

  return vertices;
}

/**
 * Calculates the perimeter (boundary) of a polygon in meters
 */
function calculateBoundaryMeters(vertices: { x: number; y: number; z: number }[]): number {
  if (vertices.length < 2) {
    return 0;
  }

  let perimeter = 0;
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const dz = next.z - current.z;
    perimeter += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return perimeter;
}

/**
 * API Route Handler for OCAMS PolyCam FOV Surface Intercepts
 * 
 * This route interacts with the WebGeocalc (WGC2) REST API to compute field of view
 * surface intercepts on asteroid Bennu. The process involves:
 * 1. Submitting a calculation request
 * 2. Polling for completion status
 * 3. Retrieving results
 * 4. Processing and scaling vertices to meters
 * 
 * @param request - Next.js request object
 * @returns JSON response with vertices and boundaryMeters
 */
export async function GET(request: NextRequest) {
  const wgc2BaseUrl = 'https://wgc2.jpl.nasa.gov:8443/webgeocalc/api';
  const maxPollAttempts = 60; // Maximum 60 attempts (60 seconds total)
  const pollIntervalMs = 1000; // Wait 1 second between polls

  try {
    // ========================================================================
    // STEP 1: Submit Calculation Request
    // ========================================================================
    // Prepare the calculation request for OCAMS PolyCam FOV surface intercepts.
    // This request specifies:
    // - Calculation type: FOV surface intercept
    // - Observer: OCAMS PolyCam instrument (NAIF ID -64364)
    // - Target: Bennu asteroid
    // - Time: UTC timestamp 2019-09-21T21:01:12.885Z
    // - Reference frame: IAU_BENNU (Bennu body-fixed frame)
    // - Aberration correction: NONE (no light-time or stellar aberration)
    
    const calculationRequest: WGC2CalculationRequest = {
      calculationType: 'FOV_SURFACE_INTERCEPT',
      times: ['2019-09-21T21:01:12.885Z'],
      observer: '-64364', // OCAMS PolyCam NAIF ID
      target: 'BENNU',
      referenceFrame: 'IAU_BENNU',
      aberrationCorrection: 'NONE',
    };

    let initResponse: Response;
    try {
      initResponse = await fetch(`${wgc2BaseUrl}/calculation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calculationRequest),
      });
    } catch (fetchError) {
      throw new WGC2APIError(
        `Network error while submitting calculation request: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`,
        503
      );
    }

    if (!initResponse.ok) {
      let errorText: string;
      try {
        errorText = await initResponse.text();
      } catch {
        errorText = `HTTP ${initResponse.status}: ${initResponse.statusText}`;
      }
      
      console.error('WGC2 API submission error:', {
        status: initResponse.status,
        statusText: initResponse.statusText,
        body: errorText,
      });

      throw new WGC2APIError(
        `Failed to initiate WGC2 calculation: ${initResponse.statusText}. ${errorText}`,
        initResponse.status || 500,
        { statusText: initResponse.statusText, body: errorText }
      );
    }

    let initData: any;
    try {
      initData = await initResponse.json();
    } catch (parseError) {
      throw new WGC2APIError(
        'Failed to parse WGC2 calculation response. Invalid JSON received.',
        500
      );
    }

    // Extract job ID from response (WGC2 may use different field names)
    const jobId = validateJobId(initData.jobId || initData.calculationId || initData.id);

    // ========================================================================
    // STEP 2: Poll for Calculation Completion
    // ========================================================================
    // WGC2 calculations are asynchronous. We must poll the status endpoint
    // until the calculation completes. The status can be:
    // - PENDING: Calculation is still in progress
    // - COMPLETE: Calculation finished successfully
    // - FAILED: Calculation encountered an error
    
    let status: string = 'PENDING';
    let resultData: WGC2ResultResponse | null = null;
    let pollAttempts = 0;

    while (status !== 'COMPLETE' && pollAttempts < maxPollAttempts) {
      // Wait before polling (except on first attempt)
      if (pollAttempts > 0) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      let statusResponse: Response;
      try {
        statusResponse = await fetch(`${wgc2BaseUrl}/calculation/${jobId}/status`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } catch (fetchError) {
        throw new WGC2APIError(
          `Network error while checking calculation status: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`,
          503
        );
      }

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text().catch(() => statusResponse.statusText);
        throw new WGC2APIError(
          `Failed to fetch calculation status: ${statusResponse.statusText}. ${errorText}`,
          statusResponse.status || 500
        );
      }

      let statusData: WGC2StatusResponse;
      try {
        statusData = await statusResponse.json();
      } catch (parseError) {
        throw new WGC2APIError(
          'Failed to parse WGC2 status response. Invalid JSON received.',
          500
        );
      }

      status = statusData.status;

      if (status === 'COMPLETE') {
        // ====================================================================
        // STEP 3: Fetch Calculation Results
        // ====================================================================
        // Once the calculation is complete, retrieve the results containing
        // the surface intercept vertices
        
        let resultResponse: Response;
        try {
          resultResponse = await fetch(`${wgc2BaseUrl}/calculation/${jobId}/result`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
        } catch (fetchError) {
          throw new WGC2APIError(
            `Network error while fetching calculation result: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`,
            503
          );
        }

        if (!resultResponse.ok) {
          const errorText = await resultResponse.text().catch(() => resultResponse.statusText);
          throw new WGC2APIError(
            `Failed to fetch calculation result: ${resultResponse.statusText}. ${errorText}`,
            resultResponse.status || 500
          );
        }

        try {
          resultData = await resultResponse.json();
        } catch (parseError) {
          throw new WGC2APIError(
            'Failed to parse WGC2 result response. Invalid JSON received.',
            500
          );
        }

        // Check if result contains an error message
        if (resultData.error) {
          throw new WGC2APIError(
            `WGC2 calculation returned an error: ${resultData.error}`,
            500,
            resultData
          );
        }

        break;
      } else if (status === 'FAILED') {
        const errorMessage = statusData.error || statusData.message || 'Unknown error';
        throw new WGC2APIError(
          `WGC2 calculation failed: ${errorMessage}`,
          500,
          statusData
        );
      }

      pollAttempts++;
    }

    // Check if polling timed out
    if (status !== 'COMPLETE' || !resultData) {
      throw new WGC2APIError(
        `Calculation did not complete within ${maxPollAttempts} seconds. Last status: ${status}`,
        504
      );
    }

    // ========================================================================
    // STEP 4: Process and Scale Vertices to Meters
    // ========================================================================
    // WGC2 typically returns coordinates in kilometers. We need to:
    // 1. Parse vertices from the result (handling multiple possible formats)
    // 2. Scale from kilometers to meters (multiply by 1000)
    // 3. Calculate the boundary (perimeter) in meters
    
    const vertices = parseVertices(resultData);
    const boundaryMeters = calculateBoundaryMeters(vertices);

    // Validate that we have sufficient vertices
    if (vertices.length < 3) {
      throw new WGC2APIError(
        `Insufficient vertices returned: ${vertices.length}. Expected at least 3 for a valid polygon.`,
        500,
        { vertexCount: vertices.length }
      );
    }

    // ========================================================================
    // STEP 5: Return Results
    // ========================================================================
    // Return the processed vertices and boundary as JSON
    
    return NextResponse.json({
      vertices,
      boundaryMeters,
    });
  } catch (error) {
    // Enhanced error handling with detailed logging
    console.error('Error in footprint API route:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      apiResponse: error instanceof WGC2APIError ? error.apiResponse : undefined,
    });

    // Return appropriate error response
    if (error instanceof WGC2APIError) {
      return NextResponse.json(
        {
          error: error.message,
          statusCode: error.statusCode,
        },
        { status: error.statusCode }
      );
    }

    // Handle unexpected errors
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        statusCode: 500,
      },
      { status: 500 }
    );
  }
}

