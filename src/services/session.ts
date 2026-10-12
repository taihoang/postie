import { router } from 'expo-router';

import { SEAMLESS_RATIOS, canvasSpec } from '@/core/canvas';
import { createDoc } from '@/core/doc';
import type { Mode, Template } from '@/core/types';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/ui/overlays';

import { loadDraft } from './drafts';

/** Start a new collage or carousel and open the editor, asking for photos right away. */
export function startCollage(mode: Mode, template?: Template, slides?: number): void {
  const s = useSettings.getState();
  let canvas = mode === 'collage' ? s.collageCanvas : s.seamlessCanvas;
  if (mode === 'seamless' && !SEAMLESS_RATIOS.includes(canvas.id)) canvas = canvasSpec('4:5');
  const doc = createDoc({ mode, canvas, template, slides });
  if (template) s.markTemplateUsed(template.id);
  useEditor.getState().load(doc);
  s.setResumeDraft(doc.id);
  router.push({ pathname: '/editor', params: { pick: '1' } });
}

/** Open a saved collage from "My collages" or on launch (A-8). */
export async function openDraft(id: string, opts: { replace?: boolean } = {}): Promise<boolean> {
  const doc = await loadDraft(id);
  if (!doc) {
    toast("Couldn't open that collage");
    useSettings.getState().setResumeDraft(null);
    return false;
  }
  useEditor.getState().load(doc);
  useSettings.getState().setResumeDraft(doc.id);
  if (opts.replace) router.replace('/editor');
  else router.push('/editor');
  return true;
}
