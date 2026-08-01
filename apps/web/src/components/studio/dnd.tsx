"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Drag and drop, on pointer events.
//
// The browser's native HTML5 drag API was the wrong tool here: it needs a `draggable`
// element, it gives no control over the drag image, it does nothing at all on touch
// devices, and Firefox refuses to start a drag unless dataTransfer is populated. This
// engine uses pointer events instead, so one implementation covers mouse, pen and touch,
// with a real ghost following the pointer, an insertion line that doesn't flicker, and
// auto-scroll near the edges.
//
// A drag only begins after the pointer travels a few pixels, so pressing a block's grip
// still selects it and a palette tap still inserts.

const START_THRESHOLD = 5; // px of travel before a press becomes a drag
const EDGE = 80; // px from the viewport edge where auto-scroll kicks in
const SPEED = 20; // px per frame at the very edge
const CLICK_GUARD = 250; // ms after a drag in which a click is ignored

/** What is being dragged. `zone` names the drop zone that may accept it. */
export type DragPayload =
  | { kind: "new"; zone: "canvas"; blockType: string; label: string }
  | { kind: "move"; zone: "canvas"; id: string; index: number; label: string }
  | { kind: "page"; zone: "pages"; index: number; label: string };

interface DragState {
  payload: DragPayload;
  x: number;
  y: number;
}

export interface DropTarget {
  zone: string;
  index: number;
}

interface DndApi {
  /** Non-null while a drag is in flight. */
  drag: DragState | null;
  /** Begin a drag from a pointer-down on a grip, palette item or page card. */
  start: (e: React.PointerEvent, payload: DragPayload) => void;
  dropTarget: DropTarget | null;
  setDropTarget: (t: DropTarget | null) => void;
  /** True just after a drag ended — lets a source suppress the click that follows. */
  justDragged: () => boolean;
}

const DndContext = createContext<DndApi | null>(null);

export function useDnd(): DndApi {
  const ctx = useContext(DndContext);
  if (!ctx) throw new Error("useDnd must be used inside <DndProvider>");
  return ctx;
}

export function DndProvider({
  onDrop,
  children,
}: {
  /** Commit the drag. `target` is where it was released; null = dropped nowhere. */
  onDrop: (payload: DragPayload, target: DropTarget | null) => void;
  children: React.ReactNode;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const pending = useRef<{ payload: DragPayload; x: number; y: number } | null>(null);
  const live = useRef(false);
  const targetRef = useRef<DropTarget | null>(null);
  const endedAt = useRef(0);
  const scroller = useRef<number | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  targetRef.current = dropTarget;

  const stopScroll = useCallback(() => {
    if (scroller.current !== null) cancelAnimationFrame(scroller.current);
    scroller.current = null;
  }, []);

  const finish = useCallback(
    (commit: boolean) => {
      const payload = pending.current?.payload;
      const wasLive = live.current;
      pending.current = null;
      live.current = false;
      stopScroll();
      setDrag(null);
      setDropTarget(null);
      document.body.classList.remove("is-dragging-block");
      if (!wasLive) return;
      endedAt.current = Date.now();
      if (payload) onDrop(payload, commit ? targetRef.current : null);
    },
    [onDrop, stopScroll],
  );

  /** Keep the page moving while the pointer is held near the top or bottom edge. */
  const autoScroll = useCallback(() => {
    const { y } = pointer.current;
    const h = window.innerHeight;
    let dy = 0;
    if (y < EDGE) dy = -SPEED * (1 - y / EDGE);
    else if (y > h - EDGE) dy = SPEED * (1 - (h - y) / EDGE);
    if (dy) window.scrollBy(0, dy);
    scroller.current = requestAnimationFrame(autoScroll);
  }, []);

  const start = useCallback((e: React.PointerEvent, payload: DragPayload) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pending.current = { payload, x: e.clientX, y: e.clientY };
    pointer.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const held = pending.current;
      if (!held) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!live.current) {
        if (Math.hypot(e.clientX - held.x, e.clientY - held.y) < START_THRESHOLD) return;
        live.current = true;
        document.body.classList.add("is-dragging-block");
        scroller.current = requestAnimationFrame(autoScroll);
      }
      // Stop the browser selecting text, or scrolling the page under the finger
      if (e.cancelable) e.preventDefault();
      setDrag({ payload: held.payload, x: e.clientX, y: e.clientY });
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pending.current) finish(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      stopScroll();
    };
  }, [autoScroll, finish, stopScroll]);

  const justDragged = useCallback(() => Date.now() - endedAt.current < CLICK_GUARD, []);

  const api = useMemo<DndApi>(
    () => ({ drag, start, dropTarget, setDropTarget, justDragged }),
    [drag, start, dropTarget, justDragged],
  );

  return (
    <DndContext.Provider value={api}>
      {children}
      {drag && (
        <div className="studio-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden>
          <span className="studio-drag-ghost-grip">⠿</span>
          {drag.payload.label}
        </div>
      )}
    </DndContext.Provider>
  );
}

/**
 * Register a scrolling drop zone. It measures its children on every pointer move and
 * publishes which gap the pointer is over — no dragenter/dragleave pair to flicker, and a
 * pointer that wanders outside the zone simply owns no target.
 */
export function useDropZone({
  zone,
  zoneRef,
  itemEls,
  order,
}: {
  zone: string;
  zoneRef: React.RefObject<HTMLElement | null>;
  itemEls: React.RefObject<Record<string, HTMLElement | null>>;
  order: string[];
}): number | null {
  const { drag, dropTarget, setDropTarget } = useDnd();
  const owns = useRef(false);

  useEffect(() => {
    if (!drag || drag.payload.zone !== zone) return;
    const el = zoneRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const inside =
      drag.x >= box.left && drag.x <= box.right && drag.y >= box.top && drag.y <= box.bottom;
    if (!inside) {
      if (owns.current) {
        owns.current = false;
        setDropTarget(null);
      }
      return;
    }
    let index = order.length;
    for (let i = 0; i < order.length; i++) {
      const item = itemEls.current?.[order[i]];
      if (!item) continue;
      const b = item.getBoundingClientRect();
      if (drag.y < b.top + b.height / 2) {
        index = i;
        break;
      }
    }
    owns.current = true;
    setDropTarget({ zone, index });
  }, [drag, zone, zoneRef, itemEls, order, setDropTarget]);

  useEffect(() => {
    if (!drag) owns.current = false;
  }, [drag]);

  return dropTarget?.zone === zone ? dropTarget.index : null;
}

/** Spread onto anything that can be picked up: press, then move to lift it. */
export function grip(api: DndApi, payload: DragPayload) {
  return {
    onPointerDown: (e: React.PointerEvent) => api.start(e, payload),
    style: { touchAction: "none" as const },
  };
}
