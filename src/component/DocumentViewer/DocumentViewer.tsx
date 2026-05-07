import Doc from "../Doc/Doc";
import styles from "./DocumentViewer.module.css";

interface DocumentViewerProps {
  documentData: Blob | null;
  docId?: string;
  collaborationWsUrl?: string;
  docKey: string | number;
  onRegisterExporter?: (exporter: (() => Promise<Blob | null>) | null) => void;
}

export default function DocumentViewer({
  documentData,
  docId,
  collaborationWsUrl,
  docKey,
  onRegisterExporter,
}: DocumentViewerProps) {
  return (
    <div className={styles.container}>
      <Doc
        key={docKey}
        documentData={documentData}
        docId={docId}
        collaborationWsUrl={collaborationWsUrl}
        onRegisterExporter={onRegisterExporter}
      />
    </div>
  );
}
