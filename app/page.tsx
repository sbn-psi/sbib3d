'use client';

import { useEffect, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createTriangulatedGeometry, type Vertex } from '@/lib/triangulation';

interface FootprintData {
  vertices: Vertex[];
  boundaryMeters: number;
}

interface ErrorDetails {
  message: string;
  statusCode?: number;
  details?: {
    phase?: string;
    error?: string;
    errorDetails?: any;
    fullResponse?: any;
  };
}

// Preload the model for better performance
useGLTF.preload('/models/g_00880mm_alt_ptm_0000n00000_v020.glb');

function BennuModel() {
  const { scene } = useGLTF('/models/g_00880mm_alt_ptm_0000n00000_v020.glb');
  return <primitive object={scene} />;
}

/**
 * FootprintMesh Component
 * 
 * Renders a semi-transparent mesh overlay using the footprint vertices.
 * Uses fan triangulation to create a polygon mesh from the vertex array.
 */
function FootprintMesh({ vertices }: { vertices: Vertex[] }) {
  // Memoize geometry creation to avoid recalculating on every render
  const geometry = useMemo(() => createTriangulatedGeometry(vertices), [vertices]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color="#ff0000"
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Formats error messages to be user-friendly
 */
function formatErrorMessage(error: string, errorDetails?: ErrorDetails): string {
  // Check if this is a calculation failure with specific error details
  if (errorDetails?.details?.phase === 'FAILED' && errorDetails.details.error) {
    // Return the actual calculation error message
    return errorDetails.details.error;
  }
  
  // Network errors
  if (error.includes('Network error') || error.includes('fetch')) {
    return 'Unable to connect to the calculation service. Please check your internet connection and try again.';
  }
  
  // Timeout errors
  if (error.includes('timed out') || error.includes('did not complete')) {
    return 'The calculation is taking longer than expected. Please try again in a moment.';
  }
  
  // WGC2 calculation failures
  if (error.includes('WGC2 calculation failed')) {
    // Extract the error message after the colon if available
    const errorMatch = error.match(/WGC2 calculation failed:\s*(.+)/);
    if (errorMatch && errorMatch[1]) {
      return errorMatch[1];
    }
    return 'The calculation failed. Please check the technical details for more information.';
  }
  
  // WGC2 service errors
  if (error.includes('WGC2') || error.includes('calculation')) {
    if (errorDetails?.statusCode === 502) {
      return 'The calculation service is temporarily unavailable. Please try again later.';
    }
    return 'An error occurred during the calculation. Please try again.';
  }
  
  // HTTP status code based messages
  if (errorDetails?.statusCode === 502) {
    return 'The calculation service is temporarily unavailable. Please try again later.';
  }
  if (errorDetails?.statusCode === 504) {
    return 'The calculation timed out. Please try again.';
  }
  if (errorDetails?.statusCode === 500) {
    return 'An internal error occurred. Please try again or contact support if the problem persists.';
  }
  
  // Generic fallback
  return error || 'An unexpected error occurred. Please try again.';
}

export default function Home() {
  const [footprintData, setFootprintData] = useState<FootprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);

  const fetchFootprint = async () => {
    try {
      setLoading(true);
      setError(null);
      setErrorDetails(null);
      const response = await fetch('/api/footprint');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          error: 'Unknown error',
          statusCode: response.status 
        }));
        setErrorDetails({
          message: errorData.error || `HTTP ${response.status}`,
          statusCode: errorData.statusCode || response.status,
          details: errorData.details,
        });
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: FootprintData = await response.json();
      setFootprintData(data);
    } catch (err) {
      console.error('Failed to fetch footprint data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch footprint data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFootprint();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [0, 0, 500], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <directionalLight position={[5, 5, 5]} intensity={0.5} />
        <BennuModel />
        {footprintData && footprintData.vertices.length > 0 && (
          <FootprintMesh vertices={footprintData.vertices} />
        )}
        <OrbitControls enableDamping dampingFactor={0.05} />
      </Canvas>
      {loading && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          padding: '10px 20px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          borderRadius: '4px',
        }}>
          Loading footprint data...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          maxWidth: '400px',
          padding: '16px 20px',
          background: 'rgba(220, 38, 38, 0.95)',
          color: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
          zIndex: 1000,
        }}>
          <div style={{ 
            fontWeight: 'bold', 
            marginBottom: '8px',
            fontSize: '16px',
          }}>
            Unable to Load Footprint Data
          </div>
          <div style={{ 
            marginBottom: '12px',
            fontSize: '14px',
            lineHeight: '1.5',
          }}>
            {formatErrorMessage(error, errorDetails || undefined)}
          </div>
          <button
            onClick={fetchFootprint}
            style={{
              padding: '8px 16px',
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
          >
            Try Again
          </button>
          {errorDetails && (
            <details style={{ 
              marginTop: '12px', 
              fontSize: '12px',
              opacity: '0.8',
            }}>
              <summary style={{ cursor: 'pointer', marginBottom: '4px' }}>
                Technical Details
              </summary>
              <div style={{ 
                marginTop: '8px', 
                padding: '8px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '11px',
                wordBreak: 'break-word',
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Error Message:</strong> {errorDetails.message}
                </div>
                {errorDetails.statusCode && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Status Code:</strong> {errorDetails.statusCode}
                  </div>
                )}
                {errorDetails.details?.phase && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Calculation Phase:</strong> {errorDetails.details.phase}
                  </div>
                )}
                {errorDetails.details?.error && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Calculation Error:</strong> {errorDetails.details.error}
                  </div>
                )}
                {errorDetails.details?.errorDetails && Object.keys(errorDetails.details.errorDetails).length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <strong>Error Details:</strong>
                    <pre style={{ 
                      marginTop: '4px',
                      padding: '4px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '2px',
                      overflow: 'auto',
                      maxHeight: '200px',
                    }}>
                      {JSON.stringify(errorDetails.details.errorDetails, null, 2)}
                    </pre>
                  </div>
                )}
                {errorDetails.details?.fullResponse && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ cursor: 'pointer', marginBottom: '4px' }}>
                      Full API Response
                    </summary>
                    <pre style={{ 
                      marginTop: '4px',
                      padding: '4px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '2px',
                      overflow: 'auto',
                      maxHeight: '200px',
                    }}>
                      {JSON.stringify(errorDetails.details.fullResponse, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </details>
          )}
        </div>
      )}
      {footprintData && !loading && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          padding: '10px 20px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          borderRadius: '4px',
        }}>
          Boundary: {footprintData.boundaryMeters.toFixed(2)} m
        </div>
      )}
    </div>
  );
}
