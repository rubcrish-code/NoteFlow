import { createContext, useContext, type ReactNode } from "react";
import { APP_ZOOM_DEFAULT, normalizeAppZoom } from "./appZoom";

const AppZoomContext = createContext(APP_ZOOM_DEFAULT);

interface AppZoomProviderProps {
  children: ReactNode;
  zoomPercent: number;
}

export function AppZoomProvider({ children, zoomPercent }: AppZoomProviderProps) {
  return <AppZoomContext.Provider value={normalizeAppZoom(zoomPercent)}>{children}</AppZoomContext.Provider>;
}

export function useAppZoomPercent() {
  return useContext(AppZoomContext);
}
