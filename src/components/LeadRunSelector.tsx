import { ChevronsUpDown, History, Layers3 } from 'lucide-react';
import type { LeadRun } from '../lib/directus';
import { compactRunTitle, leadRunModel, leadRunStatus, shortRunDate } from '../lib/leadRunPresentation';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import './lead-run-selector.css';

type Props = { runs: LeadRun[]; selectedId: string | null; total: number; ar: boolean; onSelect: (id: string | null) => void };

export function LeadRunSelector({ runs, selectedId, total, ar, onSelect }: Props) {
  const selected = runs.find(run => run.id === selectedId);
  const status = selected ? leadRunStatus(selected.status, ar) : null;
  const title = selected ? compactRunTitle(selected.title, ar) : ar ? 'اختر عملية بحث' : 'Select a search';
  return <section className="search-history" dir={ar ? 'rtl' : 'ltr'} aria-label={ar ? 'عمليات البحث' : 'Lead searches'}>
    <div className="search-history__controls">
      <Button type="button" variant="ghost" className="search-history__all" aria-pressed={!selectedId} onClick={() => onSelect(null)}>
        <Layers3 size={15} aria-hidden="true" /><span>{ar ? 'كل العملاء' : 'All leads'}</span><Badge variant="secondary">{total.toLocaleString(ar ? 'ar-SA' : 'en-GB')}</Badge>
      </Button>
      <span className="search-history__divider" aria-hidden="true" />
      <DropdownMenu dir={ar ? 'rtl' : 'ltr'}>
        <DropdownMenuTrigger asChild><Button type="button" variant="outline" className="search-history__trigger" aria-label={`${ar ? 'سجل البحث' : 'Search history'}: ${title}`}>
          <History size={15} aria-hidden="true" /><span className="search-history__trigger-title" dir={selected ? 'auto' : undefined}>{title}</span>
          {selected && <Badge variant="outline" className="search-history__model">{leadRunModel(selected)}</Badge>}
          <ChevronsUpDown size={13} aria-hidden="true" />
        </Button></DropdownMenuTrigger>
        <DropdownMenuContent className="search-history-menu" align="start" sideOffset={8} collisionPadding={12}>
          <DropdownMenuLabel className="search-history-menu__label"><span>{ar ? 'عمليات البحث الأخيرة' : 'Recent searches'}</span><span>{runs.length}</span></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={selectedId || '__all'} onValueChange={value => onSelect(value === '__all' ? null : value)}>
            <DropdownMenuRadioItem value="__all" className="search-history-menu__all"><Layers3 size={14} /><span>{ar ? 'كل العملاء' : 'All leads'}</span><span className="search-history-menu__all-count">{total}</span></DropdownMenuRadioItem>
            {runs.length > 0 && <DropdownMenuSeparator />}
            <div className="search-history-menu__list">{runs.map(run => {
              const state = leadRunStatus(run.status, ar);
              return <DropdownMenuRadioItem key={run.id} value={run.id} className="search-history-menu__item" textValue={compactRunTitle(run.title, ar)}>
                <span className="search-history-menu__copy"><span className="search-history-menu__title" dir="auto">{compactRunTitle(run.title, ar)}</span><span className="search-history-menu__meta"><span>{leadRunModel(run)}</span><span aria-hidden="true">·</span><time dateTime={run.created_at}>{shortRunDate(run.created_at, ar)}</time></span></span>
                <span className="search-history-menu__result"><bdi>{Math.max(0, run.result_count || 0)}<span> / {Math.max(0, run.target_count || 0)}</span></bdi><span className="search-history__status" data-tone={state.tone}><i aria-hidden="true" />{state.label}</span></span>
              </DropdownMenuRadioItem>;
            })}</div>
          </DropdownMenuRadioGroup>
          {!runs.length && <p className="search-history-menu__empty">{ar ? 'ستظهر عمليات البحث هنا' : 'Your searches will appear here.'}</p>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="search-history__summary" aria-live="polite">{selected ? <><span className="search-history__status" data-tone={status?.tone}><i aria-hidden="true" />{status?.label}</span><span className="search-history__summary-count"><bdi>{selected.result_count} / {selected.target_count}</bdi> {ar ? 'عميل' : 'leads'}</span></> : <><span className="search-history__summary-dot" aria-hidden="true" /><span>{ar ? 'جميع عمليات البحث' : 'Across all searches'}</span></>}</div>
  </section>;
}
