import {useState, useRef, useCallback} from 'react';

function makeObserver(el, onChange) {
  const resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      if (entry.borderBoxSize) {
        const height = entry.borderBoxSize[0].blockSize;
        const width = entry.borderBoxSize[0].inlineSize;
        onChange({height, width});
      }
    }
  });

  resizeObserver.observe(el, {box: 'border-box'});
  return resizeObserver;
}

export default function ResponsiveBlock({children, style}) {
  const rootRef = useRef(null);
  const observerRef = useRef(null);
  const [dimensions, setDimensions] = useState(null);

  const onRootRef = useCallback((node) => {
    rootRef.current = node;
    if (rootRef.current && !observerRef.current) {
      observerRef.current = makeObserver(rootRef.current, setDimensions);

      const rect = rootRef.current.getBoundingClientRect();

      setDimensions({width: rect.width, height: rect.height});
    }
  }, []);

  return (
    <div ref={onRootRef} style={style}>
      {children(dimensions)}
    </div>
  );
}
