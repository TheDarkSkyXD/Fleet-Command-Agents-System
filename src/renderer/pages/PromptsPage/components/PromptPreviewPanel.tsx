import { useMemo } from 'react';
import { FiEye, FiX } from 'react-icons/fi';
import type { Prompt } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import { TypeBadge } from './TypeBadge';
import {
  extractTemplateVars,
  renderHighlightedContent,
  renderMergedContent,
  resolveInheritanceChain,
} from './utils';

export function PromptPreviewPanel({
  prompt,
  prompts,
  onClose,
}: {
  prompt: Prompt;
  prompts: Prompt[];
  onClose: () => void;
}) {
  const chain = useMemo(() => resolveInheritanceChain(prompt, prompts), [prompt, prompts]);
  const mergedContent = useMemo(() => renderMergedContent(chain), [chain]);
  const templateVars = useMemo(() => extractTemplateVars(mergedContent), [mergedContent]);
  const highlightedContent = useMemo(
    () => renderHighlightedContent(mergedContent),
    [mergedContent],
  );

  return (
    <div className="flex h-full flex-col" data-testid="prompt-preview-panel">
      {/* Preview header */}
      <div className="flex items-center justify-between pb-3 mb-4">
        <div className="flex items-center gap-3">
          <FiEye size={18} className="text-cyan-400" />
          <h3 className="text-lg font-semibold text-slate-100">Rendered Preview</h3>
          <span className="text-sm text-slate-400">— {prompt.name}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="flex items-center gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          <FiX size={14} />
          Close Preview
        </Button>
      </div>
      <Separator className="bg-slate-700 -mt-4 mb-4" />

      {/* Inheritance chain visualization */}
      {chain.length > 1 && (
        <div className="mb-4" data-testid="inheritance-chain">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Inheritance Chain ({chain.length} levels)
          </h4>
          <div className="flex items-center gap-1 flex-wrap">
            {chain.map((link, idx) => (
              <div key={link.id} className="flex items-center gap-1">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                    idx === chain.length - 1
                      ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-600 bg-slate-800 text-slate-300'
                  }`}
                >
                  <TypeBadge type={link.type} />
                  {link.name}
                </span>
                {idx < chain.length - 1 && <span className="text-slate-400 mx-1">{'\u2192'}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Template variables summary */}
      {templateVars.length > 0 && (
        <div className="mb-4" data-testid="template-variables-summary">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Template Variables ({templateVars.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {templateVars.map((v) => (
              <Badge
                key={v}
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 font-mono text-amber-300"
              >
                {v}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Rendered content */}
      <div className="flex-1 overflow-auto" data-testid="rendered-output">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {chain.length > 1 ? 'Merged Output' : 'Rendered Output'}
        </h4>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-slate-700 bg-slate-900 p-4 font-mono text-sm text-slate-300 leading-relaxed">
          {highlightedContent}
        </pre>
      </div>

      {/* Per-level breakdown for multi-level chains */}
      {chain.length > 1 && (
        <div className="mt-4 pt-4">
          <Separator className="bg-slate-700 -mt-4 mb-4" />
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Per-Level Content
          </h4>
          <div className="space-y-3 max-h-48 overflow-auto">
            {chain.map((link, idx) => (
              <div key={link.id} className="rounded-md border border-slate-700 bg-slate-800/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-400">Level {idx + 1}</span>
                  <TypeBadge type={link.type} />
                  <span className="text-xs font-medium text-slate-300">{link.name}</span>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-slate-400 font-mono max-h-24 overflow-auto">
                  {link.content.substring(0, 500)}
                  {link.content.length > 500 ? '...' : ''}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
