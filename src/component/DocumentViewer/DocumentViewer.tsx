import Doc from "../Doc/Doc";
import styles from "./DocumentViewer.module.css";

interface DocumentViewerProps {
  documentData: Blob;
  docId?: string;
  collaborationWsUrl?: string;
  docKey: string | number;
}

export default function DocumentViewer({
  documentData,
  docId,
  collaborationWsUrl,
  docKey,
}: DocumentViewerProps) {
  return (
    <div className={styles.container}>
      <Doc
        key={docKey}
        documentData={documentData}
        docId={docId}
        collaborationWsUrl={collaborationWsUrl}
      />
    </div>
  );
}
