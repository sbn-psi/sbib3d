import * as THREE from 'three';
import {
  WGC_API_BASE,
  DEFAULT_OBSERVER,
  DEFAULT_TARGET,
  DEFAULT_REFERENCE_FRAME,
  DEFAULT_ABERRATION_CORRECTION,
  DEFAULT_DIRECTION_FRAME,
  DEFAULT_STATE_REPRESENTATION,
  DEFAULT_FOV,
  DEFAULT_SAMPLES_PER_EDGE,
} from './config';

/**
 * WGC2 Kernel Set Interface
 */
interface WGC2KernelSet {
  type: 'KERNEL_SET';
  id: number;
}

/**
 * WGC2 Calculation Request Interface for SURFACE_INTERCEPT_POINT with VECTOR direction
 */
interface WGC2VectorDirectionRequest {
  calculationType: 'SURFACE_INTERCEPT_POINT';
  kernels: WGC2KernelSet[];
  times: string[];
  timeSystem: 'UTC';
  timeFormat: 'CALENDAR';
  observer: string | number;
  target: string;
  referenceFrame: string;
  aberrationCorrection: string;
  shape1: 'DSK' | 'ELLIPSOID';
  targetFrame: string;
  directionVectorType: 'VECTOR';
  directionFrame: string;
  directionVectorX: number;
  directionVectorY: number;
  directionVectorZ: number;
  vectorAbCorr: string;
  stateRepresentation: 'RECTANGULAR' | 'PLANETOGRAPHIC' | 'LATITUDINAL';
}

/**
 * WGC2 Calculation Response Interface
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
 */
interface WGC2ResultResponse {
  columns?: Array<{ name: string; type: string; units: string; outputID: string }>;
  rows?: any[][];
  error?: string;
  [key: string]: any;
}

/**
 * Intercept point result in kilometers
 */
interface InterceptPointKm {
  xKm: number;
  yKm: number;
  zKm: number;
}

/**
 * Polling configuration
 */
const MAX_POLL_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 5000;

/**
 * Validates that a job ID is present and valid
 */
function validateJobId(jobId: any): string {
  if (!jobId || typeof jobId !== 'string') {
    throw new Error(
      `Invalid job ID returned from WGC2 API. Expected a string, but received: ${typeof jobId}`
    );
  }
  return jobId;
}

/**
 * Polls WGC2 for calculation completion
 */
async function pollForCompletion(jobId: string): Promise<WGC2ResultResponse> {
  let pollAttempts = 0;
  let phase = 'PENDING';

  while (phase !== 'COMPLETE' && pollAttempts < MAX_POLL_ATTEMPTS) {
    if (pollAttempts > 0) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const statusUrl = `${WGC_API_BASE}/calculation/${jobId}`;
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text().catch(() => statusResponse.statusText);
      throw new Error(`Failed to fetch calculation status: ${statusResponse.statusText}. ${errorText}`);
    }

    const statusData: WGC2CalculationResponse = await statusResponse.json();

    if (statusData.status !== 'OK' || statusData.error) {
      throw new Error(`WGC2 status check failed: ${statusData.error || statusData.message || 'Unknown error'}`);
    }

    phase = statusData.result?.phase || 'PENDING';

    if (phase === 'COMPLETE') {
      const resultsUrl = `${WGC_API_BASE}/calculation/${jobId}/results`;
      const resultResponse = await fetch(resultsUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!resultResponse.ok) {
        const errorText = await resultResponse.text().catch(() => resultResponse.statusText);
        throw new Error(`Failed to fetch calculation results: ${resultResponse.statusText}. ${errorText}`);
      }

      const resultResponseData = await resultResponse.json();
      const resultData = resultResponseData.result || resultResponseData;

      if (resultData && resultData.error) {
        throw new Error(`WGC2 calculation returned an error: ${resultData.error}`);
      }

      if (!resultData) {
        throw new Error('WGC2 returned null result data');
      }

      return resultData as WGC2ResultResponse;
    } else if (phase === 'FAILED') {
      const resultsUrl = `${WGC_API_BASE}/calculation/${jobId}/results`;
      const resultResponse = await fetch(resultsUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (resultResponse.ok) {
        const failedResultData = await resultResponse.json();
        const errorMessage = failedResultData.error || failedResultData.message || 'Unknown error';
        throw new Error(`WGC2 calculation failed: ${errorMessage}`);
      }
    }

    pollAttempts++;
  }

  if (phase !== 'COMPLETE') {
    throw new Error(
      `Calculation did not complete within ${MAX_POLL_ATTEMPTS} attempts. Last phase: ${phase}`
    );
  }

  throw new Error('Unexpected polling completion state');
}

/**
 * Parses intercept point from WGC2 result response
 */
function parseInterceptPoint(resultData: WGC2ResultResponse): InterceptPointKm {
  // Format: Tabular format with columns and rows (WGC2 standard format)
  if (resultData.columns && resultData.rows && Array.isArray(resultData.columns) && Array.isArray(resultData.rows)) {
    const xIndex = resultData.columns.findIndex((col) => col.outputID === 'X');
    const yIndex = resultData.columns.findIndex((col) => col.outputID === 'Y');
    const zIndex = resultData.columns.findIndex((col) => col.outputID === 'Z');

    if (xIndex === -1 || yIndex === -1 || zIndex === -1) {
      throw new Error(
        `Could not find X, Y, Z columns in result data. Available outputIDs: ${resultData.columns.map((col) => col.outputID).join(', ')}`
      );
    }

    if (resultData.rows.length === 0) {
      throw new Error('No rows in WGC2 result data');
    }

    const row = resultData.rows[0];
    if (!Array.isArray(row) || row.length <= Math.max(xIndex, yIndex, zIndex)) {
      throw new Error('Invalid row format in WGC2 result data');
    }

    const x = typeof row[xIndex] === 'number' ? row[xIndex] : parseFloat(row[xIndex]);
    const y = typeof row[yIndex] === 'number' ? row[yIndex] : parseFloat(row[yIndex]);
    const z = typeof row[zIndex] === 'number' ? row[zIndex] : parseFloat(row[zIndex]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      throw new Error(`Invalid numeric values in result row: x=${row[xIndex]}, y=${row[yIndex]}, z=${row[zIndex]}`);
    }

    return { xKm: x, yKm: y, zKm: z };
  }

  throw new Error('Unsupported WGC2 result format. Expected columns/rows format.');
}

/**
 * Builds unit vectors in the instrument frame (ORX_OCAMS_POLYCAM) that trace the FOV boundary.
 * 
 * Assumes boresight = +Z in the instrument frame.
 * Rotates around X/Y for horizontal/vertical half-FOV angles to reach corners/edges.
 * 
 * @param fovHalfAngles - Half-angles of the FOV in degrees
 * @returns Ordered list of unit vectors in the instrument frame
 */
export function buildPolyCamFovBoundaryVectors(
  fovHalfAngles: { halfHorizDeg: number; halfVertDeg: number }
): THREE.Vector3[] {
  const { halfHorizDeg, halfVertDeg } = fovHalfAngles;
  const halfHorizRad = (halfHorizDeg * Math.PI) / 180;
  const halfVertRad = (halfVertDeg * Math.PI) / 180;

  // For a rectangular FOV, we sample corners and mid-edges
  // With samplesPerEdge = 2, we get 4 corners + 4 mid-edges = 8 points
  // We'll generate points in a grid pattern around the FOV boundary

  const vectors: THREE.Vector3[] = [];

  // Generate boundary points
  // We'll create a rectangular grid of points on the FOV boundary
  // For samplesPerEdge = 2, we get corners and midpoints
  // For samplesPerEdge = 3, we get corners, midpoints, and quarter points, etc.

  // For now, we'll generate a simple pattern:
  // - 4 corners: (-h, -v), (h, -v), (h, v), (-h, v)
  // - 4 mid-edges: (0, -v), (h, 0), (0, v), (-h, 0)
  // This gives us 8 points total

  // Corners
  vectors.push(
    new THREE.Vector3(
      -Math.tan(halfHorizRad),
      -Math.tan(halfVertRad),
      1
    ).normalize()
  );
  vectors.push(
    new THREE.Vector3(
      Math.tan(halfHorizRad),
      -Math.tan(halfVertRad),
      1
    ).normalize()
  );
  vectors.push(
    new THREE.Vector3(
      Math.tan(halfHorizRad),
      Math.tan(halfVertRad),
      1
    ).normalize()
  );
  vectors.push(
    new THREE.Vector3(
      -Math.tan(halfHorizRad),
      Math.tan(halfVertRad),
      1
    ).normalize()
  );

  // Mid-edges
  vectors.push(
    new THREE.Vector3(0, -Math.tan(halfVertRad), 1).normalize()
  );
  vectors.push(
    new THREE.Vector3(Math.tan(halfHorizRad), 0, 1).normalize()
  );
  vectors.push(
    new THREE.Vector3(0, Math.tan(halfVertRad), 1).normalize()
  );
  vectors.push(
    new THREE.Vector3(-Math.tan(halfHorizRad), 0, 1).normalize()
  );

  return vectors;
}

/**
 * Generates FOV boundary vectors with configurable sampling density
 */
function generateFovBoundaryVectors(
  fovHalfAngles: { halfHorizDeg: number; halfVertDeg: number },
  samplesPerEdge: number
): THREE.Vector3[] {
  const { halfHorizDeg, halfVertDeg } = fovHalfAngles;
  const halfHorizRad = (halfHorizDeg * Math.PI) / 180;
  const halfVertRad = (halfVertDeg * Math.PI) / 180;

  const vectors: THREE.Vector3[] = [];

  // Generate points along the FOV boundary
  // We'll create a rectangular pattern with samplesPerEdge points per edge
  // Total points = 4 * samplesPerEdge (corners are shared, but we'll include them)

  // Bottom edge (left to right)
  for (let i = 0; i <= samplesPerEdge; i++) {
    const t = i / samplesPerEdge;
    const x = -halfHorizRad + (2 * halfHorizRad * t);
    vectors.push(
      new THREE.Vector3(Math.tan(x), -Math.tan(halfVertRad), 1).normalize()
    );
  }

  // Right edge (bottom to top, excluding bottom corner)
  for (let i = 1; i <= samplesPerEdge; i++) {
    const t = i / samplesPerEdge;
    const y = -halfVertRad + (2 * halfVertRad * t);
    vectors.push(
      new THREE.Vector3(Math.tan(halfHorizRad), Math.tan(y), 1).normalize()
    );
  }

  // Top edge (right to left, excluding right corner)
  for (let i = 1; i <= samplesPerEdge; i++) {
    const t = i / samplesPerEdge;
    const x = halfHorizRad - (2 * halfHorizRad * t);
    vectors.push(
      new THREE.Vector3(Math.tan(x), Math.tan(halfVertRad), 1).normalize()
    );
  }

  // Left edge (top to bottom, excluding top and bottom corners)
  for (let i = 1; i < samplesPerEdge; i++) {
    const t = i / samplesPerEdge;
    const y = halfVertRad - (2 * halfVertRad * t);
    vectors.push(
      new THREE.Vector3(-Math.tan(halfHorizRad), Math.tan(y), 1).normalize()
    );
  }

  return vectors;
}

/**
 * Fetches a single surface intercept point for a given ray direction.
 * 
 * @param params - Parameters for the intercept calculation
 * @returns Intercept point in kilometers
 */
export async function fetchInterceptPointForRay(params: {
  kernelSetId: number;
  utc: string;
  observer: string | number;
  target: string;
  shape: 'DSK' | 'ELLIPSOID';
  stateRepresentation: 'RECTANGULAR' | 'PLANETOGRAPHIC' | 'LATITUDINAL';
  directionFrame: string;
  rayVector: { x: number; y: number; z: number };
}): Promise<InterceptPointKm> {
  const {
    kernelSetId,
    utc,
    observer,
    target,
    shape,
    stateRepresentation,
    directionFrame,
    rayVector,
  } = params;

  const calculationRequest: WGC2VectorDirectionRequest = {
    calculationType: 'SURFACE_INTERCEPT_POINT',
    kernels: [{ type: 'KERNEL_SET', id: kernelSetId }],
    times: [utc],
    timeSystem: 'UTC',
    timeFormat: 'CALENDAR',
    observer: observer,
    target: target,
    referenceFrame: DEFAULT_REFERENCE_FRAME,
    aberrationCorrection: DEFAULT_ABERRATION_CORRECTION,
    shape1: shape,
    targetFrame: DEFAULT_REFERENCE_FRAME,
    directionVectorType: 'VECTOR',
    directionFrame: directionFrame,
    directionVectorX: rayVector.x,
    directionVectorY: rayVector.y,
    directionVectorZ: rayVector.z,
    vectorAbCorr: DEFAULT_ABERRATION_CORRECTION,
    stateRepresentation: stateRepresentation,
  };

  // Submit calculation
  const initResponse = await fetch(`${WGC_API_BASE}/calculation/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calculationRequest),
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text().catch(() => initResponse.statusText);
    throw new Error(`Failed to initiate WGC2 calculation: ${initResponse.statusText}. ${errorText}`);
  }

  const initData: WGC2CalculationResponse = await initResponse.json();

  if (initData.status !== 'OK' || initData.error) {
    throw new Error(
      `WGC2 calculation request failed: ${initData.error || initData.message || 'Unknown error'}`
    );
  }

  const jobId = validateJobId(initData.calculationId);
  const initialPhase = initData.result?.phase || 'PENDING';

  let resultData: WGC2ResultResponse;

  if (initialPhase === 'COMPLETE') {
    // Fetch results immediately
    const resultsUrl = `${WGC_API_BASE}/calculation/${jobId}/results`;
    const resultResponse = await fetch(resultsUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text().catch(() => resultResponse.statusText);
      throw new Error(`Failed to fetch calculation results: ${resultResponse.statusText}. ${errorText}`);
    }

    const resultResponseData = await resultResponse.json();
    resultData = resultResponseData.result || resultResponseData;

    if (resultData && resultData.error) {
      throw new Error(`WGC2 calculation returned an error: ${resultData.error}`);
    }

    if (!resultData) {
      throw new Error('WGC2 returned null result data');
    }
  } else {
    // Poll for completion
    resultData = await pollForCompletion(jobId);
  }

  return parseInterceptPoint(resultData);
}

/**
 * Fetches a footprint polygon by sampling multiple FOV boundary rays.
 * 
 * @param params - Parameters for footprint generation
 * @returns Boundary vertices in meters as a Float32Array
 */
export async function fetchFootprintPolygon(params: {
  kernelSetId: number;
  utc: string;
  observer: string | number;
  target: string;
  shape: 'DSK' | 'ELLIPSOID';
  stateRepresentation?: 'RECTANGULAR' | 'PLANETOGRAPHIC' | 'LATITUDINAL';
  directionFrame?: string;
  fovHalfAngles?: { halfHorizDeg: number; halfVertDeg: number };
  samplesPerEdge?: number;
}): Promise<{ boundaryMeters: Float32Array }> {
  const {
    kernelSetId,
    utc,
    observer = DEFAULT_OBSERVER,
    target = DEFAULT_TARGET,
    shape,
    stateRepresentation = DEFAULT_STATE_REPRESENTATION,
    directionFrame = DEFAULT_DIRECTION_FRAME,
    fovHalfAngles = DEFAULT_FOV,
    samplesPerEdge = DEFAULT_SAMPLES_PER_EDGE,
  } = params;

  // Build boundary vectors
  const boundaryVectors = generateFovBoundaryVectors(fovHalfAngles, samplesPerEdge);

  // Fetch intercepts for each ray
  const intercepts: InterceptPointKm[] = [];
  const errors: Error[] = [];

  for (const vector of boundaryVectors) {
    try {
      const intercept = await fetchInterceptPointForRay({
        kernelSetId,
        utc,
        observer,
        target,
        shape,
        stateRepresentation,
        directionFrame,
        rayVector: { x: vector.x, y: vector.y, z: vector.z },
      });
      intercepts.push(intercept);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[WGC2] Failed to fetch intercept for ray (${vector.x.toFixed(4)}, ${vector.y.toFixed(4)}, ${vector.z.toFixed(4)}):`, errorMessage);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (intercepts.length < 3) {
    throw new Error(
      `Insufficient intercepts to form a polygon; boundary size: ${intercepts.length}. ` +
      `Failed rays: ${errors.length}/${boundaryVectors.length}`
    );
  }

  // Convert km to meters and assemble into Float32Array
  const boundaryMeters = new Float32Array(intercepts.length * 3);
  for (let i = 0; i < intercepts.length; i++) {
    boundaryMeters[i * 3] = intercepts[i].xKm * 1000;
    boundaryMeters[i * 3 + 1] = intercepts[i].yKm * 1000;
    boundaryMeters[i * 3 + 2] = intercepts[i].zKm * 1000;
  }

  return { boundaryMeters };
}


