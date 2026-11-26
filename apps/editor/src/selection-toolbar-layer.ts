/** A selection-toolbar control's own floating surface, portaled outside the toolbar, still counts as the toolbar. */
export const TOOLBAR_LAYER = "data-selection-toolbar-layer";
export const inToolbarLayer = (node: EventTarget | null | undefined) => node instanceof Element && node.closest(`[${TOOLBAR_LAYER}]`) !== null;
