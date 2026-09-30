import { PanelLeft, PanelRight } from 'lucide-react';
import { InfoPanel } from './components/panel/InfoPanel.jsx';
import { ModeTabs } from './components/panel/ModeTabs.jsx';
import { RightPanel } from './components/panel/RightPanel.jsx';
import { StudioCanvas } from './components/scene/StudioCanvas.jsx';
import { TooltipLayer } from './components/ui/TooltipLayer.jsx';
import { ScreenshotButton } from './components/viewport/ScreenshotButton.jsx';
import { ViewfinderOverlay } from './components/viewport/ViewfinderOverlay.jsx';
import { LightingProvider } from './state/LightingContext.jsx';
import { panelActions, usePanelState } from './state/panelStore.js';

function TopBar() {
  const { showLeft, showRight } = usePanelState();
  return (
    <header className="top-bar">
      <button
        type="button"
        className={`panel-toggle ${showLeft ? 'panel-toggle--on' : ''}`}
        aria-pressed={showLeft}
        aria-label={showLeft ? 'Hide info panel' : 'Show info panel'}
        data-tooltip={showLeft ? 'Hide info panel' : 'Show info panel'}
        onClick={panelActions.toggleLeft}
      >
        <PanelLeft size={16} aria-hidden="true" />
      </button>
      <span className="top-bar__identity">Studio Lighting Simulator</span>
      <ModeTabs />
      <button
        type="button"
        className={`panel-toggle ${showRight ? 'panel-toggle--on' : ''}`}
        aria-pressed={showRight}
        aria-label={showRight ? 'Hide control panel' : 'Show control panel'}
        data-tooltip={showRight ? 'Hide control panel' : 'Show control panel'}
        onClick={panelActions.toggleRight}
      >
        <PanelRight size={16} aria-hidden="true" />
      </button>
    </header>
  );
}

/**
 * Lightroom-style layout: top bar (module picker), then three columns —
 * info panel (left, read-only), 3D view (center), controls (right).
 */
export default function App() {
  const { showLeft, showRight } = usePanelState();
  return (
    <LightingProvider>
      <div className={`app-layout ${showLeft ? '' : 'app-layout--no-left'} ${showRight ? '' : 'app-layout--no-right'}`}>
        <TopBar />
        <aside className="side-panel side-panel--left" aria-label="Info" hidden={!showLeft}>
          <InfoPanel />
        </aside>
        <main className="app-layout__viewport">
          <StudioCanvas />
          <ViewfinderOverlay />
          <ScreenshotButton />
        </main>
        <aside className="side-panel side-panel--right" aria-label="Controls" hidden={!showRight}>
          <RightPanel />
        </aside>
      </div>
      <TooltipLayer />
    </LightingProvider>
  );
}
