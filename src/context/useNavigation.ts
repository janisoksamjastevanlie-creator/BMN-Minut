import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveView } from './types';
import { DashboardFilters, DEFAULT_DASHBOARD_FILTERS } from '../utils/dashboardFilters';
import { getPathForView, getViewForPath } from '../utils/viewRoutes';

// Navigasi & preferensi UI global: active view, filter dashboard, mode performa 3D.
export const useNavigation = () => {
  const [activeView, setActiveViewState] = useState<ActiveView>(() => getViewForPath(window.location.pathname));
  // Halaman yang diminta sebelum diarahkan ke login, agar URL langsung tidak berakhir di dashboard.
  const returnViewRef = useRef<ActiveView | null>(null);
  const setActiveView = useCallback((view: ActiveView) => {
    if (view === 'login' && !['landing', 'login', 'not-found'].includes(activeView)) {
      returnViewRef.current = activeView;
    }
    const nextPath = getPathForView(view);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', `${nextPath}${window.location.search}${window.location.hash}`);
    }
    setActiveViewState(view);
  }, [activeView]);

  useEffect(() => {
    const handlePopState = () => setActiveViewState(getViewForPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>({ ...DEFAULT_DASHBOARD_FILTERS });
  const [performance3D, setPerformance3D] = useState<'normal' | 'performance' | 'low'>('normal');

  return {
    activeView,
    setActiveView,
    returnViewRef,
    dashboardFilters,
    setDashboardFilters,
    performance3D,
    setPerformance3D
  };
};
