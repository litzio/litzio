import { createContext, useContext } from "react";

/** Presentation only. Hidden editors keep their state but suspend overlays and geometry. */
export const EditorVisibility = createContext(true);
export const useEditorVisible = () => useContext(EditorVisibility);

/** Reading keeps document previews active while suspending retained authoring forms. */
export const EditorAuthoring = createContext(true);
/** Content editing inside the opening top-level blocks (document views): block and document
 * authoring (block tools, table rows and columns, Figure and label properties, new endnotes) is hidden. */
export const EditorContentOnly = createContext(false);
export const useEditorContentOnly = () => useContext(EditorContentOnly);

export const useEditorAuthoring = () => {
  const visible = useEditorVisible();
  return useContext(EditorAuthoring) && visible;
};
