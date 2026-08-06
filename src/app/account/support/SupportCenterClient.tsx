'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleHelp, MessageCircle, Send, TicketPlus } from 'lucide-react';
import {
  createSupportTicketAction,
  replySupportTicketAction,
} from '@/app/actions/customer-experience';

type Ticket = {
  id: string;
  subject: string;
  category: string | null;
  priority: string;
  status: string;
  bookingNumber: string | null;
  updatedAt: string;
  messages: Array<{
    id: string;
    message: string;
    createdAt: string;
    authorName: string;
    fromCustomer: boolean;
  }>;
};

const statusLabel: Record<string, string> = {
  OPEN: 'جديد',
  IN_PROGRESS: 'قيد المتابعة',
  WAITING_CUSTOMER: 'بانتظار ردك',
  RESOLVED: 'تم الحل',
  CLOSED: 'مغلق',
};

export default function SupportCenterClient({
  tickets,
  bookings,
}: {
  tickets: Ticket[];
  bookings: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(tickets[0]?.id ?? null);

  function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await createSupportTicketAction(new FormData(form));
      if (result.error) setFeedback(result.error);
      else {
        setFeedback(result.message ?? 'تم إرسال طلب الدعم.');
        form.reset();
        setActiveTicketId(result.ticketId ?? null);
        router.refresh();
      }
    });
  }

  function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await replySupportTicketAction(new FormData(form));
      if (result.error) setFeedback(result.error);
      else {
        form.reset();
        router.refresh();
      }
    });
  }

  return (
    <div dir="rtl" className="space-y-7 pb-12">
      <header className="rounded-3xl border border-[#c9a227]/30 bg-[#14130f] p-6 sm:p-8">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#c9a227]/30 bg-[#c9a227]/10 px-3 py-1 text-xs font-bold text-[#e5c45a]"><CircleHelp className="size-3.5" aria-hidden="true" />مركز المساعدة</p>
        <h1 className="mt-3 text-3xl font-black text-white">تواصل مع الدعم</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-neutral-400">افتح طلبًا وارفق رقم الحجز عند الحاجة، ثم تابع رد الفريق من هنا بدل ضياع المحادثة بين القنوات.</p>
      </header>

      {feedback ? <p role="status" aria-live="polite" className="rounded-2xl border border-[#c9a227]/30 bg-[#c9a227]/10 px-4 py-3 text-sm font-bold text-[#f0d36d]">{feedback}</p> : null}

      <section className="rounded-3xl border border-neutral-800 bg-[#121212] p-5 sm:p-6" aria-labelledby="new-ticket-heading">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#c9a227]/10 text-[#e5c45a]"><TicketPlus className="size-5" aria-hidden="true" /></span><div><h2 id="new-ticket-heading" className="font-black text-white">طلب دعم جديد</h2><p className="mt-1 text-xs text-neutral-500">اختر درجة الأولوية الحقيقية حتى يصل الطلب للفريق المناسب.</p></div></div>
        <form onSubmit={createTicket} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-neutral-300">العنوان<input required name="subject" minLength={3} maxLength={160} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#e5c45a]" placeholder="مثال: أحتاج تعديل بوابة الدخول" /></label>
          <label className="text-xs font-bold text-neutral-300">الحجز المرتبط<select name="bookingId" className="mt-2 min-h-11 w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#e5c45a]"><option value="">طلب عام بدون حجز</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.label}</option>)}</select></label>
          <label className="text-xs font-bold text-neutral-300">التصنيف<input name="category" maxLength={80} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#e5c45a]" placeholder="موعد، دفع، خدمة…" /></label>
          <label className="text-xs font-bold text-neutral-300">الأولوية<select name="priority" defaultValue="NORMAL" className="mt-2 min-h-11 w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#e5c45a]"><option value="LOW">منخفضة</option><option value="NORMAL">عادية</option><option value="HIGH">عالية</option><option value="URGENT">عاجلة</option></select></label>
          <label className="text-xs font-bold text-neutral-300 sm:col-span-2">التفاصيل<textarea required name="message" minLength={3} maxLength={4000} rows={4} className="mt-2 w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white outline-none focus:border-[#e5c45a]" placeholder="اشرح المطلوب بوضوح…" /></label>
          <div className="sm:col-span-2"><button disabled={isPending} type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c9a227] px-5 text-sm font-black text-black disabled:opacity-50"><Send className="size-4" aria-hidden="true" />{isPending ? 'جارٍ الإرسال…' : 'إرسال الطلب'}</button></div>
        </form>
      </section>

      <section className="space-y-3" aria-labelledby="tickets-heading"><div><h2 id="tickets-heading" className="text-xl font-black text-white">طلباتي السابقة</h2><p className="mt-1 text-xs text-neutral-500">{tickets.length} طلب</p></div>{tickets.length === 0 ? <div className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">لا توجد طلبات دعم حتى الآن.</div> : tickets.map((ticket) => {
        const active = ticket.id === activeTicketId;
        return <article key={ticket.id} className="overflow-hidden rounded-2xl border border-neutral-800 bg-[#121212]"><button type="button" onClick={() => setActiveTicketId(active ? null : ticket.id)} className="flex w-full items-center justify-between gap-4 p-5 text-right focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#e5c45a]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[#c9a227]/30 bg-[#c9a227]/10 px-2 py-1 text-[10px] font-black text-[#e5c45a]">{statusLabel[ticket.status] ?? ticket.status}</span>{ticket.bookingNumber ? <span className="font-mono text-[10px] text-neutral-500">{ticket.bookingNumber}</span> : null}</div><h3 className="mt-2 truncate font-black text-white">{ticket.subject}</h3><p className="mt-1 text-xs text-neutral-500">آخر تحديث {new Date(ticket.updatedAt).toLocaleString('ar-EG')}</p></div><MessageCircle className="size-5 shrink-0 text-neutral-500" aria-hidden="true" /></button>{active ? <div className="border-t border-neutral-800 p-5"><div className="space-y-3">{ticket.messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.fromCustomer ? 'mr-auto bg-[#c9a227] text-black' : 'ml-auto bg-neutral-800 text-neutral-100'}`}><p>{message.message}</p><p className={`mt-2 text-[10px] ${message.fromCustomer ? 'text-black/55' : 'text-neutral-500'}`}>{message.authorName} · {new Date(message.createdAt).toLocaleString('ar-EG')}</p></div>)}</div>{!['RESOLVED', 'CLOSED'].includes(ticket.status) ? <form onSubmit={reply} className="mt-5 flex gap-2"><input type="hidden" name="ticketId" value={ticket.id} /><input required name="message" maxLength={4000} className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-700 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#e5c45a]" placeholder="اكتب ردك…" /><button disabled={isPending} type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c9a227] px-4 text-black disabled:opacity-50" aria-label="إرسال الرد"><Send className="size-4" aria-hidden="true" /></button></form> : null}</div> : null}</article>;
      })}</section>
    </div>
  );
}
