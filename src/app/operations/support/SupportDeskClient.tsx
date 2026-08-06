'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, MessageCircle, Send, UserRound } from 'lucide-react';
import { replySupportTicketAction, updateSupportTicketAction } from '@/app/actions/customer-experience';

type Ticket = {
  id: string;
  subject: string;
  category: string | null;
  priority: string;
  status: string;
  branchName: string | null;
  customerName: string;
  customerPhone: string;
  bookingNumber: string | null;
  assignedToUserId: string | null;
  messages: Array<{ id: string; message: string; isInternal: boolean; createdAt: string; authorName: string }>;
};

const statusLabel: Record<string, string> = { OPEN: 'جديد', IN_PROGRESS: 'قيد المعالجة', WAITING_CUSTOMER: 'بانتظار العميل', RESOLVED: 'تم الحل', CLOSED: 'مغلق' };

export default function SupportDeskClient({ tickets, assignees }: { tickets: Ticket[]; assignees: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(tickets[0]?.id ?? null);

  function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
    setFeedback(null); startTransition(async () => { const result = await replySupportTicketAction(new FormData(form)); if (result.error) setFeedback(result.error); else { form.reset(); router.refresh(); } });
  }
  function updateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setFeedback(null);
    startTransition(async () => { const result = await updateSupportTicketAction(new FormData(form)); if (result.error) setFeedback(result.error); else { setFeedback('تم تحديث حالة الطلب.'); router.refresh(); } });
  }

  return <div dir="rtl" className="min-h-screen bg-[#080808] px-4 py-7 text-white sm:px-6 lg:px-8"><main className="mx-auto max-w-6xl space-y-6"><header className="flex flex-col gap-4 rounded-3xl border border-[#c9a227]/30 bg-[#14130f] p-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-black text-[#e5c45a]"><MessageCircle className="size-4" aria-hidden="true" />مركز متابعة العملاء</p><h1 className="mt-2 text-3xl font-black">طلبات الدعم</h1><p className="mt-2 text-sm text-neutral-400">ردود موثقة داخل النظام مع فصل الملاحظات الداخلية عن ما يراه العميل.</p></div><a href="/operations" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-bold text-neutral-200"><ArrowRight className="size-4" aria-hidden="true" />العودة للتشغيل</a></header>{feedback ? <p role="status" className="rounded-xl border border-[#c9a227]/30 bg-[#c9a227]/10 px-4 py-3 text-sm font-bold text-[#f0d36d]">{feedback}</p> : null}{tickets.length === 0 ? <section className="rounded-3xl border border-dashed border-neutral-700 p-12 text-center text-neutral-500">لا توجد طلبات دعم ضمن نطاقك الآن.</section> : <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]"><aside className="space-y-2">{tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => setActiveId(ticket.id)} className={`w-full rounded-2xl border p-4 text-right transition focus:outline-none focus:ring-2 focus:ring-[#e5c45a] ${ticket.id === activeId ? 'border-[#c9a227]/55 bg-[#c9a227]/10' : 'border-neutral-800 bg-[#121212] hover:border-neutral-700'}`}><div className="flex items-center justify-between gap-3"><span className="rounded-full border border-[#c9a227]/25 px-2 py-1 text-[10px] font-black text-[#e5c45a]">{statusLabel[ticket.status] ?? ticket.status}</span><span className="text-[10px] text-neutral-500">{ticket.priority}</span></div><p className="mt-3 truncate font-black">{ticket.subject}</p><p className="mt-1 truncate text-xs text-neutral-500">{ticket.customerName} · {ticket.branchName ?? 'طلب عام'}</p></button>)}</aside><div className="min-w-0">{tickets.filter((ticket) => ticket.id === activeId).map((ticket) => <article key={ticket.id} className="rounded-3xl border border-neutral-800 bg-[#121212] p-5 sm:p-6"><header className="flex flex-col gap-4 border-b border-neutral-800 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold text-[#e5c45a]">{ticket.branchName ?? 'طلب دعم عام'} {ticket.bookingNumber ? `· ${ticket.bookingNumber}` : ''}</p><h2 className="mt-2 text-xl font-black">{ticket.subject}</h2><p className="mt-2 text-xs text-neutral-500">{ticket.customerName} · <span dir="ltr">{ticket.customerPhone}</span></p></div><form onSubmit={updateTicket} className="grid grid-cols-2 gap-2 sm:min-w-72"><input type="hidden" name="ticketId" value={ticket.id} /><select name="status" defaultValue={ticket.status} className="min-h-10 rounded-xl border border-neutral-700 bg-[#080808] px-2 text-xs text-white"><option value="OPEN">جديد</option><option value="IN_PROGRESS">قيد المعالجة</option><option value="WAITING_CUSTOMER">بانتظار العميل</option><option value="RESOLVED">تم الحل</option><option value="CLOSED">مغلق</option></select><select name="assignedToUserId" defaultValue={ticket.assignedToUserId ?? ''} className="min-h-10 rounded-xl border border-neutral-700 bg-[#080808] px-2 text-xs text-white"><option value="">بدون مسؤول</option>{assignees.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><button disabled={isPending} type="submit" className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#c9a227]/35 text-xs font-bold text-[#e5c45a] disabled:opacity-50"><CheckCircle2 className="size-4" aria-hidden="true" />حفظ الحالة</button></form></header><div className="mt-6 space-y-3">{ticket.messages.map((message) => <div key={message.id} className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.isInternal ? 'border border-violet-400/25 bg-violet-400/10 text-violet-100' : 'bg-neutral-800 text-neutral-100'}`}><p>{message.message}</p><p className="mt-2 flex items-center gap-1 text-[10px] text-neutral-500"><UserRound className="size-3" aria-hidden="true" />{message.authorName} · {message.isInternal ? 'ملاحظة داخلية' : 'مرئي للعميل'} · {new Date(message.createdAt).toLocaleString('ar-EG')}</p></div>)}</div>{!['CLOSED'].includes(ticket.status) ? <form onSubmit={submitReply} className="mt-6 grid gap-3"><input type="hidden" name="ticketId" value={ticket.id} /><textarea required name="message" rows={3} maxLength={4000} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white outline-none focus:border-[#e5c45a]" placeholder="اكتب ردًا واضحًا للعميل…" /><label className="flex items-center gap-2 text-xs text-neutral-400"><input name="isInternal" type="checkbox" />ملاحظة داخلية لا يراها العميل</label><button disabled={isPending} type="submit" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-[#c9a227] px-5 text-sm font-black text-black disabled:opacity-50"><Send className="size-4" aria-hidden="true" />إرسال الرد</button></form> : null}</article>)}</div></section>}</main></div>;
}
