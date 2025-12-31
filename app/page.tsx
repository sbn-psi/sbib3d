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

export default function Home() {
  const [footprintData, setFootprintData] = useState<FootprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFootprint() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/footprint');
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data: FootprintData = await response.json();
        setFootprintData(data);
      } catch (err) {
        console.error('Failed to fetch footprint data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch footprint data');
      } finally {
        setLoading(false);
      }
    }

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
          padding: '10px 20px',
          background: 'rgba(255, 0, 0, 0.7)',
          color: 'white',
          borderRadius: '4px',
        }}>
          Error: {error}
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
