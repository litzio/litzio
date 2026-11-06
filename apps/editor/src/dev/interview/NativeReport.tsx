import { useMemo } from 'react';
import { getEditableDocument, parse } from '@litzio/core';
import { DocumentEditor } from '../../DocumentEditor';
import { TooltipProvider } from '../../components/ui/tooltip';
import '../../styles.css';
// Use the existing Tiptap document renderer; no custom Markdown/AST rendering.
export default function NativeReport({ source, name }: {source:string;name:string}) {
  const document = useMemo(() => getEditableDocument(parse(source)), [source]);
  return <TooltipProvider><div className="native-preview"><DocumentEditor document={document} documentPath={'/reports/'+name} readOnly preview settingsDisabled onStructuralReject={() => {}}/></div><details className="native-source"><summary>문서 원문</summary><pre>{source}</pre></details></TooltipProvider>;
}
