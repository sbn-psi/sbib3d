import { NextRequest, NextResponse } from 'next/server';

interface WGC2CalculationRequest {
  calculationType: string;
  kernels?: string[];
  times: string[];
  observer: string;
  target: string;
  referenceFrame?: string;
  aberrationCorrection?: string;
}

interface WGC2StatusResponse {
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  jobId?: string;
}

interface WGC2ResultResponse {
  vertices?: number[][];
  boundaryMeters?: number;
  data?: any;
}

export async function GET(request: NextRequest) {
  try {
    // WebGeocalc WGC2 API endpoint
    const wgc2BaseUrl = 'https://wgc2.jpl.nasa.gov:8443/webgeocalc/api';
    
    // Prepare calculation request for OCAMS PolyCam FOV surface intercepts
    const calculationRequest: WGC2CalculationRequest = {
      calculationType: 'FOV_SURFACE_INTERCEPT',
      times: ['2019-09-21T21:01:12.885Z'],
      observer: '-64364', // OCAMS PolyCam NAIF ID
      target: 'BENNU',
      referenceFrame: 'IAU_BENNU',
      aberrationCorrection: 'NONE',
    };

    // Step 1: Submit calculation request
    const initResponse = await fetch(`${wgc2BaseUrl}/calculation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(calculationRequest),
    });

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      console.error('WGC2 API error:', errorText);
      return NextResponse.json(
        { error: `Failed to initiate calculation: ${initResponse.statusText}` },
        { status: initResponse.status || 500 }
      );
    }

    const initData = await initResponse.json();
    const jobId = initData.jobId || initData.calculationId;

    if (!jobId) {
      return NextResponse.json(
        { error: 'No job ID returned from WGC2 API' },
        { status: 500 }
      );
    }

    // Step 2: Poll for completion
    let status: string = 'PENDING';
    let resultData: WGC2ResultResponse | null = null;
    const maxPollAttempts = 60; // Maximum 60 attempts (60 seconds)
    let pollAttempts = 0;

    while (status !== 'COMPLETE' && pollAttempts < maxPollAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second between polls

      const statusResponse = await fetch(`${wgc2BaseUrl}/calculation/${jobId}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!statusResponse.ok) {
        return NextResponse.json(
          { error: `Failed to fetch calculation status: ${statusResponse.statusText}` },
          { status: statusResponse.status || 500 }
        );
      }

      const statusData: WGC2StatusResponse = await statusResponse.json();
      status = statusData.status;

      if (status === 'COMPLETE') {
        // Step 3: Fetch results
        const resultResponse = await fetch(`${wgc2BaseUrl}/calculation/${jobId}/result`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!resultResponse.ok) {
          return NextResponse.json(
            { error: `Failed to fetch calculation result: ${resultResponse.statusText}` },
            { status: resultResponse.status || 500 }
          );
        }

        resultData = await resultResponse.json();
        break;
      } else if (status === 'FAILED') {
        return NextResponse.json(
          { error: 'Calculation failed on WGC2 server' },
          { status: 500 }
        );
      }

      pollAttempts++;
    }

    if (status !== 'COMPLETE' || !resultData) {
      return NextResponse.json(
        { error: 'Calculation timed out or did not complete' },
        { status: 500 }
      );
    }

    // Step 4: Process and scale vertices to meters
    // WGC2 typically returns coordinates in kilometers, so we scale to meters
    let vertices: { x: number; y: number; z: number }[] = [];
    let boundaryMeters = 0;

    if (resultData.vertices && Array.isArray(resultData.vertices)) {
      vertices = resultData.vertices.map((vertex: number[]) => ({
        x: (vertex[0] || 0) * 1000, // Convert km to meters
        y: (vertex[1] || 0) * 1000,
        z: (vertex[2] || 0) * 1000,
      }));
    } else if (resultData.data && Array.isArray(resultData.data)) {
      // Alternative data format
      vertices = resultData.data.map((point: any) => ({
        x: (point.x || point[0] || 0) * 1000,
        y: (point.y || point[1] || 0) * 1000,
        z: (point.z || point[2] || 0) * 1000,
      }));
    }

    // Calculate boundary in meters (perimeter of the polygon)
    if (vertices.length > 0) {
      let perimeter = 0;
      for (let i = 0; i < vertices.length; i++) {
        const current = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        const dx = next.x - current.x;
        const dy = next.y - current.y;
        const dz = next.z - current.z;
        perimeter += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      boundaryMeters = perimeter;
    }

    // Return JSON response with vertices and boundaryMeters
    return NextResponse.json({
      vertices,
      boundaryMeters,
    });
  } catch (error) {
    console.error('Error in footprint API route:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

