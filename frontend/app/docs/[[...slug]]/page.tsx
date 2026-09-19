import { source } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Callout } from 'fumadocs-ui/components/callout';
import { Flame, AlertTriangle, Sparkles, Info, ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import React from 'react';

interface Props {
  params: Promise<{ slug?: string[] }>;
}

function CustomBlockquote({ children }: { children?: React.ReactNode }) {
  const extractText = (node: any): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node && typeof node === 'object' && node.props && node.props.children) {
      return extractText(node.props.children);
    }
    return '';
  };

  const textContent = extractText(children).trim();
  const match = textContent.match(/^\[!(NOTE|CAUTION|WARNING|IMPORTANT|TIP)\]\s*([\s\S]*)$/i);

  if (match) {
    const alertType = match[1].toUpperCase();
    const alertBody = match[2];

    let type: 'info' | 'warn' | 'error' | 'idea' = 'info';
    let title = 'Note';
    let icon: React.ReactNode = <Info className="w-4.5 h-4.5 text-sky-400" />;

    switch (alertType) {
      case 'IMPORTANT':
        type = 'warn';
        title = 'Important';
        icon = <Flame className="w-4.5 h-4.5 text-amber-400 fill-amber-500/20 animate-pulse" />;
        break;
      case 'CAUTION':
        type = 'warn';
        title = 'Caution';
        icon = <ShieldAlert className="w-4.5 h-4.5 text-orange-400" />;
        break;
      case 'WARNING':
        type = 'warn';
        title = 'Warning';
        icon = <AlertTriangle className="w-4.5 h-4.5 text-amber-400" />;
        break;
      case 'TIP':
        type = 'idea';
        title = 'Tip';
        icon = <Sparkles className="w-4.5 h-4.5 text-sky-400" />;
        break;
      case 'NOTE':
      default:
        type = 'info';
        title = 'Note';
        icon = <Info className="w-4.5 h-4.5 text-sky-400" />;
        break;
    }

    return (
      <Callout type={type} title={title} icon={icon}>
        {alertBody || children}
      </Callout>
    );
  }

  return (
    <blockquote className="border-l-4 border-sky-500/40 pl-4 py-1.5 my-4 text-slate-300 italic bg-sky-500/5 rounded-r-lg">
      {children}
    </blockquote>
  );
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{ style: 'clerk' }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={{
            ...defaultMdxComponents,
            blockquote: CustomBlockquote,
          }}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  return {
    title: `${page.data.title} — Documentation`,
    description: page.data.description,
  };
}
