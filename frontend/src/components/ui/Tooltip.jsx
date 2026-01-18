import { cloneElement, isValidElement } from 'react';

// Simple tooltip using native title attribute
// For a more styled tooltip, we'd need to use a portal to escape overflow:hidden containers

export default function Tooltip({ children, text }) {
  if (!text) return children;

  // Clone the child element and add the title attribute
  if (isValidElement(children)) {
    return cloneElement(children, { title: text });
  }

  // Fallback: wrap in span with title
  return (
    <span title={text}>
      {children}
    </span>
  );
}
