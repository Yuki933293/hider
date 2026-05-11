import { state, dom } from './state.js';

const hoverController = {
  interactive: true,
  hoverMode: null,
  forceInteractive: null,
  dragging: false,
  syncQueued: false,
};

function shouldForceInteractive() {
  // Hover mode should hide consistently on leave. The only exception is an
  // active window drag, where click-through would break the drag gesture.
  return hoverController.dragging;
}

function syncHoverClasses(interactive) {
  dom.app.classList.toggle('mouse-over', state.settings.hoverMode && interactive);
  if (!state.settings.hoverMode || interactive || !state.settings.autoHideOnLeave) {
    dom.app.classList.remove('auto-hidden');
  } else {
    dom.app.classList.add('auto-hidden');
  }
}

function applyInteractiveState(interactive) {
  hoverController.interactive = interactive;
  syncHoverClasses(interactive);
}

async function reconcileHoverState() {
  const hoverMode = !!state.settings.hoverMode;
  const forceInteractive = !hoverMode || shouldForceInteractive();

  if (hoverController.hoverMode === hoverMode && hoverController.forceInteractive === forceInteractive) {
    syncHoverClasses(hoverController.interactive);
    return;
  }

  hoverController.hoverMode = hoverMode;
  hoverController.forceInteractive = forceInteractive;

  try {
    const nextState = await window.api.updateHoverWindow({
      hoverMode,
      forceInteractive,
    });
    applyInteractiveState(nextState?.interactive ?? forceInteractive);
  } catch (error) {
    console.error('Failed to sync hover window state:', error);
  }
}

function queueHoverSync() {
  if (hoverController.syncQueued) return;
  hoverController.syncQueued = true;

  requestAnimationFrame(() => {
    hoverController.syncQueued = false;
    reconcileHoverState();
  });
}

export function initHoverController() {
  window.api.onHoverStateChanged((data) => {
    applyInteractiveState(!!data?.interactive);
  });
}

export function syncHoverMode() {
  queueHoverSync();
}

export function setHoverDragging(dragging) {
  hoverController.dragging = dragging;
  queueHoverSync();
}
