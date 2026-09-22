import { AlertTriangle, BrainCircuit, Check, FileText, LoaderCircle, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { notify } from "../lib/notify";
import {
  apiErrorMessage,
  confirmBusinessPersona,
  deleteBusinessDocument,
  fetchBusinessPersona,
  uploadBusinessDocument,
} from "../lib/directus";
import type { BusinessPersona } from "../lib/directus";
import "./business-persona.css";

const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json";

function fileData(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.onerror = () => reject(reader.error || new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

export function BusinessPersonaWorkspace({ language }: { language: "ar" | "en" }) {
  const ar = language === "ar";
  const input = useRef<HTMLInputElement>(null);
  const [persona, setPersona] = useState<BusinessPersona | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setLoading(true);
    try { setPersona(await fetchBusinessPersona()); }
    catch (error) { notify.danger(apiErrorMessage(error, ar ? "تعذر تحميل شخصية النشاط." : "Could not load your business persona.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const document = await uploadBusinessDocument({ file_name: file.name, mime_type: file.type || "application/octet-stream", content_base64: await fileData(file) });
        setPersona((current) => current ? { ...current, documents: [document, ...current.documents.filter((item) => item.id !== document.id)] } : current);
        if (document.status === "failed") notify.danger(document.error_message || `${file.name} could not be understood.`);
        else if (document.status === "partial") notify.warning(ar ? `فهمت وصلة جزءاً من ${file.name} وحددت الأجزاء غير المقروءة.` : `Wasla understood part of ${file.name} and flagged what it could not read.`);
        else notify.success(ar ? `تم فهم ${file.name}.` : `${file.name} understood.`);
      }
    } catch (error) { notify.danger(apiErrorMessage(error, ar ? "تعذر رفع الملف." : "The file could not be uploaded.")); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  }

  async function remove(id: string) {
    try { await deleteBusinessDocument(id); setPersona((current) => current ? { ...current, documents: current.documents.filter((item) => item.id !== id) } : current); }
    catch (error) { notify.danger(apiErrorMessage(error)); }
  }

  async function confirm() {
    setConfirming(true);
    try {
      const next = await confirmBusinessPersona();
      setPersona(next);
      notify.success(ar ? "تم تثبيت شخصية النشاط في ذاكرة وصلة." : "Business Persona is now part of Wasla's memory.");
    } catch (error) { notify.danger(apiErrorMessage(error)); }
    finally { setConfirming(false); }
  }

  const profile = persona?.profile;
  const readable = persona?.documents.filter((item) => item.status === "ready" || item.status === "partial") || [];
  return <section className="business-persona">
    <header className="business-persona__hero"><div><span><BrainCircuit size={14}/>{ar ? "ذاكرة وصلة التجارية" : "WASLA BUSINESS MEMORY"}</span><h1>{ar ? "علّم وصلة كيف يعمل نشاطك." : "Teach Wasla how your business works."}</h1><p>{ar ? "ارفع ملف الشركة أو العرض أو الكتالوج. ستخبرك وصلة بما فهمته، وما لم تستطع قراءته، قبل أن تستخدمه في الاستهداف." : "Upload your company profile, deck, catalogue, or notes. Wasla shows exactly what it understood—and what it could not read—before using it for targeting."}</p></div><div className="business-persona__score"><div><strong>{profile?.completion_score || 0}%</strong><small>{ar ? "اكتمال الشخصية" : "persona completeness"}</small></div><i aria-hidden="true"><span style={{ width: `${profile?.completion_score || 0}%` }} /></i></div></header>
    <div className="business-persona__grid">
      <div className="persona-upload-card"><input ref={input} hidden type="file" multiple accept={ACCEPTED} onChange={(event) => void addFiles(event.target.files)}/><button type="button" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? <LoaderCircle className="is-spinning"/> : <UploadCloud/>}<strong>{uploading ? (ar ? "وصلة تقرأ ملفاتك…" : "Wasla is reading your files…") : (ar ? "أضف مواد نشاطك" : "Add business material")}</strong><span>{ar ? "PDF، صور، نصوص، Markdown، CSV أو JSON · حتى 12MB" : "PDF, images, text, Markdown, CSV or JSON · up to 12 MB"}</span></button><small>{ar ? "أي جزء غير واضح سيظهر لك باسمه وسبب عدم فهمه." : "Every unreadable section is named with the exact reason it could not be understood."}</small></div>
      <article className="persona-summary"><header><span><Sparkles size={15}/>{ar ? "الشخصية الحالية" : "Current persona"}</span><b>{profile?.company_name || (ar ? "غير مكتملة" : "Incomplete")}</b></header>{loading ? <LoaderCircle className="is-spinning"/> : <><dl><div><dt>{ar ? "القطاع" : "Industry"}</dt><dd>{profile?.industry || "—"}</dd></div><div><dt>{ar ? "القيمة المقدمة" : "Value proposition"}</dt><dd>{profile?.value_proposition || "—"}</dd></div><div><dt>{ar ? "المنتجات والخدمات" : "Products & services"}</dt><dd>{profile?.products_services?.join(" · ") || "—"}</dd></div><div><dt>{ar ? "الأسواق" : "Markets"}</dt><dd>{profile?.target_markets?.join(" · ") || "—"}</dd></div></dl><button type="button" disabled={!readable.length || confirming} onClick={() => void confirm()}>{confirming ? <LoaderCircle className="is-spinning" size={15}/> : <Check size={15}/>} {ar ? "تأكيد وتحديث ذاكرة وصلة" : "Confirm and update Wasla memory"}</button></>}</article>
    </div>
    <div className="persona-documents"><header><div><h2>{ar ? "مصادر الشخصية" : "Persona sources"}</h2><p>{ar ? "كل ملف يبقى مرتبطاً بحسابك، مع سجل واضح لنتيجة القراءة." : "Every file stays attached to your workspace with a transparent reading result."}</p></div><span>{persona?.documents.length || 0}</span></header>
      {!loading && !persona?.documents.length ? <div className="persona-documents__empty"><FileText/><strong>{ar ? "لم تضف أي ملفات بعد" : "No files yet"}</strong></div> : persona?.documents.map((document) => <article key={document.id} className={`is-${document.status}`}><div className="persona-document__icon"><FileText size={19}/></div><div className="persona-document__body"><header><strong>{document.file_name}</strong><span>{document.status === "ready" ? (ar ? "مقروء بالكامل" : "Understood") : document.status === "partial" ? (ar ? "مقروء جزئياً" : "Partially understood") : document.status === "failed" ? (ar ? "غير مقروء" : "Could not read") : (ar ? "قيد القراءة" : "Reading")}</span></header>{document.summary ? <p>{document.summary}</p> : null}{document.unreadable_sections.length ? <div className="persona-unreadable"><strong><AlertTriangle size={14}/>{ar ? "ما لم تستطع وصلة فهمه" : "What Wasla could not understand"}</strong>{document.unreadable_sections.map((item, index) => <p key={`${item.section}-${index}`}><b>{item.section || (ar ? "جزء غير محدد" : "Unidentified section")}</b> — {item.reason}</p>)}</div> : null}{document.readable_sections.length ? <small>{ar ? "تم فهم:" : "Understood:"} {document.readable_sections.slice(0, 6).join(" · ")}</small> : null}</div><button type="button" aria-label={ar ? "حذف الملف" : "Delete file"} onClick={() => void remove(document.id)}><Trash2 size={15}/></button></article>)}
    </div>
  </section>;
}
