import { ControlPanel } from './components/panel/ControlPanel.jsx';
import { StudioCanvas } from './components/scene/StudioCanvas.jsx';
import { LightingProvider } from './state/LightingContext.jsx';

export default function App() {
  return (
    <LightingProvider>
      <div className="app-layout">
        <main className="app-layout__viewport">
          <StudioCanvas />
        </main>
        <aside className="app-layout__panel">
          <ControlPanel />
        </aside>
      </div>
    </LightingProvider>
  );
}
