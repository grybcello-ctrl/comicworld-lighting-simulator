import { FileDown, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLightingActions, useLightingState } from '../../state/LightingContext.jsx';
import { parseSetup, SetupImportError, setupFileName, setupToJson } from '../../state/setupSerializer.js';
import { IconButton, RowGroup } from '../ui/IconButton.jsx';

/** Triggers a browser download of `text` as a file. */
function downloadText(text, fileName, mimeType = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Export / import of the complete lighting setup as JSON (status inline, full text in the tooltip). */
export function SetupFileControls() {
  const { lights } = useLightingState();
  const { importLights } = useLightingActions();
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState(null);

  const handleExport = () => {
    const now = new Date();
    const fileName = setupFileName(now);
    downloadText(setupToJson(lights, now), fileName);
    setStatus({ kind: 'info', text: `Exported ${lights.length} light(s) to ${fileName}.` });
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-importing the same file
    if (!file) return;
    try {
      const { lights: imported, warnings } = parseSetup(await file.text());
      importLights(imported);
      setStatus({
        kind: warnings.length ? 'warning' : 'info',
        text: [`Imported ${imported.length} light(s) from ${file.name}.`, ...warnings].join('\n'),
      });
    } catch (error) {
      const reason = error instanceof SetupImportError ? error.message : String(error);
      setStatus({ kind: 'error', text: `Import failed: ${reason}` });
    }
  };

  return (
    <RowGroup title="Setup (JSON)">
      <IconButton icon={FileDown} caption="Export" label="Export JSON" onClick={handleExport} disabled={lights.length === 0} />
      <IconButton icon={FileUp} caption="Import" label="Import JSON" onClick={() => fileInputRef.current?.click()} />
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        aria-label="Import setup JSON file"
        data-testid="setup-import-input"
      />
      {status && (
        <span
          className={`status-message status-message--inline ${status.kind === 'error' ? 'status-message--error' : ''}`}
          role="status"
          data-tooltip={status.text}
        >
          {status.text}
        </span>
      )}
    </RowGroup>
  );
}
