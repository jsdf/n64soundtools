import React from 'react';

export default function Details({summary, children, startOpen}) {
  const [open, setOpen] = React.useState(startOpen);

  const onToggle = React.useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!open);
    },
    [open]
  );

  return (
    <details open={open}>
      <summary onClick={onToggle}>{summary}</summary>
      {open && children}
    </details>
  );
}
