import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Inter, sans-serif',
  themeVariables: {
    margin: '30'
  },
  flowchart: {
    htmlLabels: true,
    padding: 30
  }
});

interface MermaidDiagramProps {
  chart: string;
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      if (!chart) {
        setSvg('');
        return;
      }
      
      try {
        setError('');
        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg: svgCode } = await mermaid.render(id, chart);
        if (isMounted) {
          setSvg(svgCode);
        }
      } catch (err: any) {
        console.error("Mermaid rendering error:", err);
        if (isMounted) {
          setError(err.message || 'Failed to render diagram');
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 p-4 text-center">
        <p>Error rendering diagram: {error}</p>
      </div>
    );
  }

  if (!svg) {
    return null;
  }

  return (
    <div 
      id="mermaid-container"
      ref={containerRef} 
      className="w-full h-full flex items-center justify-center overflow-auto p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
