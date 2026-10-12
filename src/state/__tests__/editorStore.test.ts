import { canvasSpec } from '@/core/canvas';
import { createDoc, setStyle } from '@/core/doc';
import { COLLAGE_PRESETS } from '@/core/templates';

import { HISTORY_LIMIT, useEditor } from '../editorStore';

const fresh = () => createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: COLLAGE_PRESETS[0] });

describe('editor history', () => {
  beforeEach(() => useEditor.getState().load(fresh()));

  it('undoes and redoes a commit', () => {
    const { commit } = useEditor.getState();
    commit((d) => setStyle(d, { gap: 30 }));
    expect(useEditor.getState().doc?.style.gap).toBe(30);
    useEditor.getState().undo();
    expect(useEditor.getState().doc?.style.gap).toBe(12);
    useEditor.getState().redo();
    expect(useEditor.getState().doc?.style.gap).toBe(30);
  });

  it('records a whole slider drag as one step', () => {
    const s = useEditor.getState();
    s.checkpoint();
    for (const gap of [14, 20, 26, 40]) useEditor.getState().live((d) => setStyle(d, { gap }));
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().undo();
    expect(useEditor.getState().doc?.style.gap).toBe(12);
  });

  it('keeps at most 20 steps (P-11)', () => {
    for (let i = 0; i < 30; i++) useEditor.getState().commit((d) => setStyle(d, { gap: i }));
    expect(useEditor.getState().past).toHaveLength(HISTORY_LIMIT);
  });

  it('discards a checkpoint that was never used', () => {
    useEditor.getState().checkpoint();
    useEditor.getState().endCheckpoint();
    useEditor.getState().live((d) => setStyle(d, { gap: 3 }));
    expect(useEditor.getState().past).toHaveLength(0);
  });

  it('marks an export without adding an undo step', () => {
    useEditor.getState().checkpoint();
    useEditor.getState().markExported();
    const doc = useEditor.getState().doc!;
    expect(useEditor.getState().past).toHaveLength(0);
    expect(doc.exportedAt).toBeGreaterThan(doc.updatedAt);
  });

  it('a new edit clears the redo stack', () => {
    useEditor.getState().commit((d) => setStyle(d, { gap: 1 }));
    useEditor.getState().undo();
    useEditor.getState().commit((d) => setStyle(d, { gap: 2 }));
    expect(useEditor.getState().future).toHaveLength(0);
  });
});
