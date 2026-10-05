import { useEffect, useState } from 'react';
import { loadStoredEvents } from './eventsStorage';
export function useStoredEvents() {
  const [events, setEvents] = useState(() => loadStoredEvents() || []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => setEvents(loadStoredEvents() || []);
    window.addEventListener('gguck-events-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('gguck-events-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return events;
}
