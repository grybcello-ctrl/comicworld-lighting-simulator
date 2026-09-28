import { BottomPanel } from './components/panel/BottomPanel.jsx';
import { StudioCanvas } from './components/scene/StudioCanvas.jsx';
import { TooltipLayer } from './components/ui/TooltipLayer.jsx';
import { ScreenshotButton } from './components/viewport/ScreenshotButton.jsx';
import { SetupHud } from './components/viewport/SetupHud.jsx';
import { ViewfinderOverlay } from './components/viewport/ViewfinderOverlay.jsx';
import { LightingProvider } from './state/LightingContext.jsx';

/** Layout: the 3D view (with overlays) on top, the three-row control panel below. */
export default function App() {
  return (
    <LightingProvider>
      <div className="app-layout">
        <main className="app-layout__viewport">
          <StudioCanvas />
          <ViewfinderOverlay />
          <SetupHud />
          <ScreenshotButton />
        </main>
        <footer className="app-layout__panel">
          <BottomPanel />
        </footer>
      </div>
      <TooltipLayer />
    </LightingProvider>
  );
}
