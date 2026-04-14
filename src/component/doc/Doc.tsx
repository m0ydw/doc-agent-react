import { SuperDocEditor } from "@superdoc-dev/react";
import "@superdoc-dev/react/style.css";
import styles from "./doc.module.css";

interface DocProps {
  documentData: Blob | null;
  onLoadError?: (message: string) => void;
}

function Doc({ documentData, onLoadError }: DocProps) {
  return (
    <div className={styles.viewerShell}>
      {documentData ? (
        <div className={styles.editorRoot}>
          <SuperDocEditor
            document={documentData}
            documentMode="viewing"
            onReady={() => console.log("SuperDoc ready")}
            onContentError={(event) => onLoadError?.(event.error.message)}
            onException={(event) => onLoadError?.(event.error.message)}
          />
        </div>
      ) : null}
    </div>
  );
}

export default Doc;
