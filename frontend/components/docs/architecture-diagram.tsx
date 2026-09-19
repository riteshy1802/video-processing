'use client';

import { useState } from 'react';

interface ArchitectureDiagramProps {
  src: string;
  alt: string;
  caption?: string;
}

export function ArchitectureDiagram({ src, alt, caption }: ArchitectureDiagramProps) {
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <figure className="my-6">
        <div
          className="relative overflow-hidden rounded-xl border border-fd-border bg-fd-card cursor-zoom-in hover:border-sky-500/40 transition-colors"
          onClick={() => setLightbox(true)}
          role="button"
          aria-label={`View ${alt} full size`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="w-full max-w-4xl mx-auto block p-4"
            style={{ objectFit: 'contain' }}
          />
          <div className="absolute top-2 right-2 bg-fd-background/80 backdrop-blur rounded-md px-2 py-1 text-xs text-fd-muted-foreground font-mono border border-fd-border">
            click to enlarge
          </div>
        </div>
        {caption && (
          <figcaption className="mt-2 text-center text-xs text-fd-muted-foreground font-mono">
            {caption}
          </figcaption>
        )}
      </figure>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-w-[95vw] max-h-[90vh] overflow-auto rounded-xl border border-fd-border bg-fd-background p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="block max-w-full"
              style={{ objectFit: 'contain' }}
            />
            <button
              className="absolute top-2 right-2 text-fd-muted-foreground hover:text-fd-foreground bg-fd-background/90 rounded-full w-7 h-7 flex items-center justify-center border border-fd-border text-sm"
              onClick={() => setLightbox(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
