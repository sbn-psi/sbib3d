/**
 * Configuration constants for WGC2 API and footprint generation
 */

export const WGC_API_BASE = process.env.WGC_URL ?? 'https://wgc2.jpl.nasa.gov:8443/webgeocalc/api';

export const DEFAULT_KERNEL_SET_ID = 35;

export const DEFAULT_SHAPE: 'DSK' | 'ELLIPSOID' = 'DSK';

export const DEFAULT_STATE_REPRESENTATION: 'RECTANGULAR' | 'PLANETOGRAPHIC' | 'LATITUDINAL' = 'RECTANGULAR';

export const DEFAULT_DIRECTION_FRAME = 'ORX_OCAMS_POLYCAM';

export const DEFAULT_FOV = {
  halfHorizDeg: 0.6,
  halfVertDeg: 0.6,
};

export const DEFAULT_SAMPLES_PER_EDGE = 2;

export const DEFAULT_OBSERVER = 'OSIRIS-REx';

export const DEFAULT_TARGET = 'BENNU';

export const DEFAULT_REFERENCE_FRAME = 'IAU_BENNU';

export const DEFAULT_ABERRATION_CORRECTION = 'NONE';


