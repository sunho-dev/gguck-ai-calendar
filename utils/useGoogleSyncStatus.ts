import { useEffect, useState } from 'react';

import { getGoogleSyncStatus, type GoogleSyncStatus } from './googleSync';

const INITIAL: GoogleSyncStatus = { connected: false, email: null };

export function useGoogleSyncStatus(): GoogleSyncStatus {
  const [status, setStatus] = useState<GoogleSyncStatus>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    getGoogleSyncStatus().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
