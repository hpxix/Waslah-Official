import { ChevronDown } from 'lucide-react';
import type { Lead } from '../types';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from './ui/dropdown-menu';

export function LeadPhoneNumbers({ lead, ar }: { lead: Pick<Lead, 'phone' | 'phoneNumbers'>; ar: boolean }) {
  const numbers = [...new Map([
    ...(lead.phone ? [{ number: lead.phone, label: ar ? 'الهاتف' : 'Phone' }] : []),
    ...(lead.phoneNumbers || []),
  ].filter(p => /^\+?\d{7,15}$/.test(p.number.replace(/[\s().-]/g,''))).map(p => [p.number.replace(/[\s().-]/g,''), p])).values()];
  const primary = numbers[0];
  if (!primary) return <span>—</span>;
  return <div className="lead-phone-numbers" dir="ltr">
    <a className="lead-phone-primary" href={`tel:${primary.number.replace(/[^+\d]/g,'')}`} title={primary.number}>{primary.number}</a>
    {numbers.length > 1 && <DropdownMenu dir={ar ? 'rtl' : 'ltr'}>
      <DropdownMenuTrigger asChild><button className="lead-phone-more" aria-label={ar ? `عرض ${numbers.length} أرقام هاتف` : `Show ${numbers.length} phone numbers`} onDoubleClick={e => e.stopPropagation()}>+{numbers.length - 1}<ChevronDown size={10}/></button></DropdownMenuTrigger>
      <DropdownMenuContent className="lead-phone-menu" align="end" collisionPadding={12}>
        <DropdownMenuLabel>{ar ? 'أرقام المصدر المتاحة' : 'Available source numbers'}</DropdownMenuLabel>
        {numbers.map(p => <DropdownMenuItem key={p.number} asChild><a href={`tel:${p.number.replace(/[^+\d]/g,'')}`}><span dir="ltr">{p.number}</span><small>{p.label}</small></a></DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>}
  </div>;
}
