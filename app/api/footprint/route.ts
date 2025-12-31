import { NextRequest, NextResponse } from 'next/server';

/**
 * WGC2 Kernel Set Interface
 * Defines the structure for kernel set references
 */
interface WGC2KernelSet {
  type: 'KERNEL_SET';
  id: number;
}

/**
 * WGC2 API Standard Request Payload Interface
 * Defines the structure for submitting a calculation request to WebGeocalc
 * Based on WGC2 API Standard Request Payload specification
 */
interface WGC2CalculationRequest {
  calculationType: string;
  kernels: WGC2KernelSet[];
  times: string[];
  timeSystem: string;
  timeFormat: string;
  parameters: {
    observer: string;
    target: string;
    referenceFrame: string;
    aberrationCorrection: string;
    direction?: string;
    [key: string]: any; // Allow additional calculation-specific parameters
  };
}

/**
 * WGC2 Calculation Response Interface
 * Response structure from calculation/new and status endpoints
 */
interface WGC2CalculationResponse {
  status: string;
  message?: string;
  calculationId?: string;
  result?: {
    phase?: string;
    [key: string]: any;
  };
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
 * surface intercepts on asteroid Bennu using SURFACE_INTERCEPT_POINT calculation type.
 * The process involves:
 * 1. Submitting a calculation request
 * 2. Polling for completion status
 * 3. Retrieving results
 * 4. Processing and scaling vertices to meters
 * 
 * @param request - Next.js request object
 * @returns JSON response with vertices and boundaryMeters
 */
export async function GET(request: NextRequest) {
  // Read WGC2 API URL from environment variable, fallback to default JPL endpoint
  const WGC2 = process.env.WGC_URL ?? 'https://wgc2.jpl.nasa.gov:8443/webgeocalc/api';
  const maxPollAttempts = 60; // Maximum 60 attempts (60 seconds total)
  const pollIntervalMs = 1000; // Wait 1 second between polls

  try {
    // ========================================================================
    // STEP 1: Submit Calculation Request
    // ========================================================================
    // Prepare the calculation request for OCAMS PolyCam FOV surface intercepts.
    // Uses WGC2 Standard Request Payload format with:
    // - Calculation type: SURFACE_INTERCEPT_POINT (determines where a vector intersects the surface)
    // - Kernels: Kernel set ID (may need to be adjusted based on available kernel sets)
    // - Times: UTC timestamp 2019-09-21T21:01:12.885Z
    // - Time system: UTC
    // - Time format: CALENDAR
    // - Parameters:
    //   - Observer: OCAMS PolyCam instrument (NAIF ID -64364)
    //   - Target: Bennu asteroid
    //   - Reference frame: IAU_BENNU (Bennu body-fixed frame)
    //   - Aberration correction: NONE (no light-time or stellar aberration)
    
    const calculationRequest: WGC2CalculationRequest = {
      calculationType: 'SURFACE_INTERCEPT_POINT',
      kernels: [
        { type: 'KERNEL_SET', id: 35 } // https://wgc2.jpl.nasa.gov:8443/webgeocalc/api/kernel-sets
      ],
      times: ['2019-09-21T21:01:12.885Z'],
      timeSystem: 'UTC',
      timeFormat: 'CALENDAR',
      parameters: {
        observer: '-64364', // OCAMS PolyCam NAIF ID
        target: 'BENNU',
        referenceFrame: 'IAU_BENNU',
        aberrationCorrection: 'NONE',
      },
    };

    console.log('[WGC2] Submitting calculation request:', {
      url: `${WGC2}/calculation/new`,
      request: calculationRequest,
    });

    let initResponse: Response;
    try {
      initResponse = await fetch(`${WGC2}/calculation/new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calculationRequest),
      });
    } catch (fetchError) {
      console.error('[WGC2] Network error submitting calculation request:', {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        stack: fetchError instanceof Error ? fetchError.stack : undefined,
      });
      // Return 502 Bad Gateway for upstream service failures
      throw new WGC2APIError(
        `Network error while submitting calculation request: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`,
        502
      );
    }

    console.log('[WGC2] Initial response status:', {
      status: initResponse.status,
      statusText: initResponse.statusText,
      headers: Object.fromEntries(initResponse.headers.entries()),
    });

    if (!initResponse.ok) {
      let errorText: string;
      try {
        errorText = await initResponse.text();
      } catch {
        errorText = `HTTP ${initResponse.status}: ${initResponse.statusText}`;
      }
      
      console.error('[WGC2] API submission error - response payload:', {
        status: initResponse.status,
        statusText: initResponse.statusText,
        body: errorText,
        bodyLength: errorText.length,
      });

      // Return 502 Bad Gateway for upstream service failures (4xx/5xx from WGC2)
      throw new WGC2APIError(
        `Failed to initiate WGC2 calculation: ${initResponse.statusText}. ${errorText}`,
        502,
        { statusText: initResponse.statusText, body: errorText }
      );
    }

    let initData: WGC2CalculationResponse;
    try {
      const responseText = await initResponse.text();
      console.log('[WGC2] Initial response payload (raw):', responseText);
      initData = JSON.parse(responseText);
      console.log('[WGC2] Initial response payload (parsed):', JSON.stringify(initData, null, 2));
    } catch (parseError) {
      console.error('[WGC2] Failed to parse initial response:', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      // Return 502 for malformed upstream responses
      throw new WGC2APIError(
        'Failed to parse WGC2 calculation response. Invalid JSON received.',
        502
      );
    }

    // Check if the response indicates an error
    if (initData.status !== 'OK' || initData.error) {
      throw new WGC2APIError(
        `WGC2 calculation request failed: ${initData.error || initData.message || 'Unknown error'}`,
        502,
        initData
      );
    }

    // Extract calculation ID from response
    const jobId = validateJobId(initData.calculationId);
    console.log('[WGC2] Calculation ID extracted:', jobId);

    // Initialize resultData variable (using any to handle flexible response structure)
    let resultData: any = null;

    // Check if the calculation is already complete in the initial response
    // Some calculations may return results immediately
    if (initData.result && initData.result.phase === 'COMPLETE') {
      console.log('[WGC2] Calculation completed immediately in initial response');
      resultData = initData.result;
      // Skip polling and proceed to result processing
    } else {
      // Extract current phase from initial response
      const initialPhase = initData.result?.phase || 'PENDING';
      console.log('[WGC2] Initial calculation phase:', initialPhase);

      // ========================================================================
      // STEP 2: Poll for Calculation Completion
      // ========================================================================
      // WGC2 calculations are asynchronous. We must poll the status endpoint
      // until the calculation completes. The calculation goes through phases:
      // - LOADING_KERNELS: Loading required SPICE kernels
      // - COMPUTING: Performing the calculation
      // - COMPLETE: Calculation finished successfully
      // - FAILED: Calculation encountered an error
      
      let phase: string = initialPhase;
      let pollAttempts = 0;

      while (phase !== 'COMPLETE' && pollAttempts < maxPollAttempts) {
      // Wait before polling (except on first attempt)
      if (pollAttempts > 0) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      console.log(`[WGC2] Polling status (attempt ${pollAttempts + 1}/${maxPollAttempts})...`);

      let statusResponse: Response;
      try {
        statusResponse = await fetch(`${WGC2}/calculation/${jobId}/status`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } catch (fetchError) {
        console.error('[WGC2] Network error checking status:', {
          attempt: pollAttempts + 1,
          error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        });
        // Return 502 Bad Gateway for upstream service failures
        throw new WGC2APIError(
          `Network error while checking calculation status: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`,
          502
        );
      }

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text().catch(() => statusResponse.statusText);
        console.error('[WGC2] Status check error - response payload:', {
          attempt: pollAttempts + 1,
          status: statusResponse.status,
          statusText: statusResponse.statusText,
          body: errorText,
        });
        // Return 502 Bad Gateway for upstream service failures
        throw new WGC2APIError(
          `Failed to fetch calculation status: ${statusResponse.statusText}. ${errorText}`,
          502
        );
      }

      let statusData: WGC2CalculationResponse;
      try {
        const statusText = await statusResponse.text();
        console.log(`[WGC2] Status response payload (raw):`, statusText);
        statusData = JSON.parse(statusText);
        console.log(`[WGC2] Status response payload (parsed):`, JSON.stringify(statusData, null, 2));
      } catch (parseError) {
        console.error('[WGC2] Failed to parse status response:', {
          attempt: pollAttempts + 1,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        // Return 502 for malformed upstream responses
        throw new WGC2APIError(
          'Failed to parse WGC2 status response. Invalid JSON received.',
          502
        );
      }

      // Check for errors in status response
      if (statusData.status !== 'OK' || statusData.error) {
        throw new WGC2APIError(
          `WGC2 status check failed: ${statusData.error || statusData.message || 'Unknown error'}`,
          502,
          statusData
        );
      }

      const previousPhase = phase;
      // Extract phase from result object, default to PENDING if not present
      phase = statusData.result?.phase || 'PENDING';
      
      // Log phase transition
      if (previousPhase !== phase) {
        console.log(`[WGC2] Phase transition: ${previousPhase} -> ${phase}`, {
          attempt: pollAttempts + 1,
          statusData,
        });
      } else {
        console.log(`[WGC2] Phase unchanged: ${phase}`, {
          attempt: pollAttempts + 1,
          statusData,
        });
      }

      if (phase === 'COMPLETE') {
        // ====================================================================
        // STEP 3: Fetch Calculation Results
        // ====================================================================
        // Once the calculation is complete, check if result is in status response
        // or fetch from separate endpoint
        
        // Check if result data is already included in the status response
        if (statusData.result && statusData.result.phase === 'COMPLETE') {
          // Result may be included in status response
          const resultKeys = Object.keys(statusData.result).filter(k => k !== 'phase');
          if (resultKeys.length > 0) {
            console.log('[WGC2] Result data included in status response');
            resultData = statusData.result;
            break;
          }
        }
        
        // If result not in status response, fetch from separate endpoint
        console.log('[WGC2] Fetching result from separate endpoint...');
        
        let resultResponse: Response;
        try {
          resultResponse = await fetch(`${WGC2}/calculation/${jobId}/result`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
        } catch (fetchError) {
          console.error('[WGC2] Network error fetching result:', {
            error: fetchError instanceof Error ? fetchError.message : String(fetchError),
          });
          // Return 502 Bad Gateway for upstream service failures
          throw new WGC2APIError(
            `Network error while fetching calculation result: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`,
            502
          );
        }

        console.log('[WGC2] Result response status:', {
          status: resultResponse.status,
          statusText: resultResponse.statusText,
        });

        if (!resultResponse.ok) {
          const errorText = await resultResponse.text().catch(() => resultResponse.statusText);
          console.error('[WGC2] Result fetch error - response payload:', {
            status: resultResponse.status,
            statusText: resultResponse.statusText,
            body: errorText,
          });
          // Return 502 Bad Gateway for upstream service failures
          throw new WGC2APIError(
            `Failed to fetch calculation result: ${resultResponse.statusText}. ${errorText}`,
            502
          );
        }

        try {
          const resultText = await resultResponse.text();
          console.log('[WGC2] Result response payload (raw):', resultText.substring(0, 1000)); // Log first 1000 chars
          const resultResponseData = JSON.parse(resultText);
          console.log('[WGC2] Result response payload (parsed):', JSON.stringify(resultResponseData, null, 2));
          
          // Extract result from response (may be nested in result field)
          resultData = resultResponseData.result || resultResponseData;
        } catch (parseError) {
          console.error('[WGC2] Failed to parse result response:', {
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
          // Return 502 for malformed upstream responses
          throw new WGC2APIError(
            'Failed to parse WGC2 result response. Invalid JSON received.',
            502
          );
        }

        // Check if result contains an error message
        if (resultData && resultData.error) {
          console.error('[WGC2] Result contains error:', resultData.error);
          // Return 502 for upstream calculation errors
          throw new WGC2APIError(
            `WGC2 calculation returned an error: ${resultData.error}`,
            502,
            resultData
          );
        }

        if (!resultData) {
          throw new WGC2APIError(
            'WGC2 returned null result data',
            502
          );
        }
        
        console.log('[WGC2] Successfully retrieved result data');
        break;
      } else if (phase === 'FAILED') {
        const errorMessage = statusData.error || statusData.message || statusData.result?.error || 'Unknown error';
        console.error('[WGC2] Calculation failed with phase:', {
          phase,
          errorMessage,
          fullStatusData: statusData,
        });
        // Return 502 for upstream calculation failures
        throw new WGC2APIError(
          `WGC2 calculation failed: ${errorMessage}`,
          502,
          statusData
        );
      }

      pollAttempts++;
    }

    // Check if polling timed out
    if (phase !== 'COMPLETE' || !resultData) {
      console.error('[WGC2] Polling timed out:', {
        finalPhase: phase,
        pollAttempts,
        maxPollAttempts,
      });
      throw new WGC2APIError(
        `Calculation did not complete within ${maxPollAttempts} seconds. Last phase: ${phase}`,
        504
      );
    }
    } // End of else block for non-immediate completion

    // ========================================================================
    // STEP 4: Process and Scale Vertices to Meters
    // ========================================================================
    // WGC2 typically returns coordinates in kilometers. We need to:
    // 1. Parse vertices from the result (handling multiple possible formats)
    // 2. Scale from kilometers to meters (multiply by 1000)
    // 3. Calculate the boundary (perimeter) in meters
    
    if (!resultData) {
      throw new WGC2APIError(
        'No result data available after calculation completion',
        500
      );
    }
    
    const vertices = parseVertices(resultData as WGC2ResultResponse);
    const boundaryMeters = calculateBoundaryMeters(vertices);

    console.log('[WGC2] Processing complete:', {
      vertexCount: vertices.length,
      boundaryMeters,
    });

    // Validate that we have sufficient vertices
    if (vertices.length < 3) {
      console.error('[WGC2] Insufficient vertices:', {
        vertexCount: vertices.length,
        resultData,
      });
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
    
    console.log('[WGC2] Returning successful response');
    return NextResponse.json({
      vertices,
      boundaryMeters,
    });
  } catch (error) {
    // Enhanced error handling with detailed logging
    console.error('[WGC2] Error in footprint API route:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      apiResponse: error instanceof WGC2APIError ? error.apiResponse : undefined,
      statusCode: error instanceof WGC2APIError ? error.statusCode : undefined,
    });

    // Return appropriate error response
    if (error instanceof WGC2APIError) {
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
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        statusCode: 500,
      },
      { status: 500 }
    );
  }
}

