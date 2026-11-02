import { useTranslation } from "react-i18next";
import { NodeViewContent, NodeViewWrapper, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { CopyButton } from "../components/CopyButton.tsx";
import { CodeLanguageInput } from "../code-language-input.tsx";
import { handleTextblockMouseDown } from "./shared.ts";

export function CodeBlockView({ node, editor, getPos, updateAttributes }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const editable = useEditorState({ editor, selector: ({ editor: current }) => current.isEditable });
  return (
    <NodeViewWrapper
      as="div"
      className="code-block"
      data-block="code"
      data-source-path={String(node.attrs.sourcePath ?? "")}
    >
      <div className="code-block-controls" contentEditable={false}>
        <CodeLanguageInput language={String(node.attrs.language ?? "")} readOnly={!editable}
          onChange={(language) => { if (editor.isEditable) updateAttributes({ language }); }} />
        <CopyButton text={node.textContent} label={t("Copy code")} />
      </div>
      <pre onMouseDown={event => { if (event.detail === 3) handleTextblockMouseDown(event, { editor, node, getPos }); }}><NodeViewContent<"code"> as="code" /></pre>
    </NodeViewWrapper>
  );
}
