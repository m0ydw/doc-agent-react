import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ResizeHandle.module.css";

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
}

export default function ResizeHandle({ onResize }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const lastXRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    lastXRef.current = e.clientX;
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return;
      const delta = lastXRef.current - e.clientX; // negative = drag right, positive = drag left
      lastXRef.current = e.clientX;
      onResize(delta);
    },
    [dragging, onResize]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    if (dragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      className={`${styles.handle} ${dragging ? styles.handleActive : ""}`}
      onMouseDown={handleMouseDown}
    >
      <div className={styles.handleLine} />
    </div>
  );
}
