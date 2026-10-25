import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './chat-reply.css';

const seen = new Set<number>();
function shouldReveal(repliedAt?: number) {
  if (!repliedAt || Date.now() - repliedAt > 10_000 || seen.has(repliedAt)) return false;
  try { if (JSON.parse(sessionStorage.getItem('wasla:revealed-replies') || '[]').includes(repliedAt)) return false; } catch { /* Animation is optional. */ }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function RevealedChatReply({ text, repliedAt }: { text: string; repliedAt?: number }) {
  const [visible, setVisible] = useState(() => shouldReveal(repliedAt) ? 0 : text.length);
  useEffect(() => {
    if (repliedAt) {
      seen.add(repliedAt);
      try { const ids = JSON.parse(sessionStorage.getItem('wasla:revealed-replies') || '[]'); sessionStorage.setItem('wasla:revealed-replies', JSON.stringify([...new Set([...ids, repliedAt])].slice(-100))); } catch { /* Keep replies usable without storage. */ }
    }
    if (visible >= text.length) return;
    const parts = text.split(/(\s+)/u);
    let count = 0;
    const step = Math.max(1, Math.ceil(parts.length / 45));
    const timer = window.setInterval(() => { count = Math.min(parts.length, count + step); setVisible(parts.slice(0, count).join('').length); if (count >= parts.length) clearInterval(timer); }, 22);
    return () => clearInterval(timer);
  }, [text, repliedAt]);
  return <div className="chat-reply-reveal" aria-busy={visible < text.length}>
    <ReactMarkdown components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}>{text.slice(0, visible)}</ReactMarkdown>
  </div>;
}
