# سجل التكاليف ومؤشرات الاستهلاك — فرفشة

> الهدف: **صفر تكلفة** في مرحلة الإطلاق. هذا السجل يجعل الحدود مرئية ويمنع تجاوزها بصمت.

## 1) الخدمات المستخدمة وحدودها المجانية (بمصادر)

| الخدمة | حدود الخطة المجانية | ما يحدث عند التجاوز | المصدر |
|---|---|---|---|
| **Supabase — قاعدة البيانات** | 500 م.ب | توقف الكتابة حتى الترقية أو التنظيف | [uibakery](https://uibakery.io/) · [designrevision](https://designrevision.com/) |
| **Supabase — ملفات** | 1 ج.ب | رفض الرفع | [designrevision](https://designrevision.com/) |
| **Supabase — نقل** | 5 ج.ب/شهر | قد يوقف الخدمة حتى الشهر التالي | [schematichq](https://schematichq.com/) · [designrevision](https://designrevision.com/) |
| **Supabase — مستخدمون نشطون** | 50,000/شهر | تحذير ثم مطالبة بالترقية | [uibakery](https://uibakery.io/) |
| **Supabase — خمول** | — | **يتوقف المشروع بعد أسبوع بلا نشاط** ثم يُستأنف يدويًا | [designrevision](https://designrevision.com/) |
| **Agora RTC** | **10,000 دقيقة/شهر** | تُحتسب الدقائق الزائدة بالدفع ($0.59–$0.99 لكل 1000 دقيقة صوت) | [agora.io](https://www.agora.io/) · [forasoft](https://www.forasoft.com/) |
| **Firebase FCM** | بلا سقف عملي | — | Firebase |
| **PostHog** | 1,000,000 حدث/شهر | توقف جمع الأحداث | PostHog |
| **GitHub Pages** | 1 ج.ب موقع · 100 ج.ب/شهر نقل (للمستودعات العامة) | تحذير بالبريد | GitHub |

## 2) مؤشرات مقاسة فعليًا (تدقيق 2026-09-22)

قياسات مباشرة من قاعدة الإنتاج:

| المؤشر | القيمة الفعلية | من الحد | النسبة |
|---|---|---|---|
| صفوف `profiles` | 4 | 50,000 | 0.01% |
| صفوف `rooms` | 4 | — (ضمن 500 م.ب) | — |
| صفوف `messages` | ~3 | — | — |
| صفوف `admin_audit_log` | مُنظَّف (اختبار) | — | — |
| حجم القاعدة التقديري | < 1 م.ب | 500 م.ب | <0.2% |
| دقائق صوت مستهلكة | 0 في الإنتاج | 10,000/شهر | 0% |

## 3) ضمانات عدم التجاوز (Guardrails)

### أ) في الكود — مؤشر استهلاك مرئي
* **تطبيق الويب**: لوحة «إحصاءات الاستخدام (حدود مجانية)» في الردهة تعرض 5 مؤشرات شرائط ملوّنة:
  دقائق Agora · حجم القاعدة · المستخدمون النشطون · الاتصالات اللحظية · نقل الاستضافة.
  تتحول للنهاية الحمراء عند الاقتراب من 100%.
* القياس: عدّ الصفوف الحقيقي عبر `count: 'exact'` + تقدير بايت لكل صف + دقائق صوت مقيسة من وقت الاتصال الفعلي.

### ب) في قاعدة البيانات — مراقبة دورية
جدول + دالة تقيس الحجم الفعلي وتُنبّه:

```sql
create table if not exists public.usage_snapshots (
  id bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  db_bytes bigint, rooms int, messages int, profiles int, members int
);

create or replace function public.snapshot_usage()
returns public.usage_snapshots language plpgsql security definer set search_path = public as $$
declare r public.usage_snapshots;
begin
  insert into public.usage_snapshots(db_bytes, rooms, messages, profiles, members)
  values (pg_database_size(current_database()),
          (select count(*) from public.rooms),
          (select count(*) from public.messages),
          (select count(*) from public.profiles),
          (select count(*) from public.room_members))
  returning * into r;
  return r;
end $$;
```

### ج) سلوك التخفيض عند الاقتراب من الحد (مُحدَّد صريحًا)
| الحد | عند 80% | عند 95% | عند 100% |
|---|---|---|---|
| دقائق Agora | تنبيه في لوحة الإدارة | منع إنشاء غرف جديدة | رفض انضمام جديد للصوت مع رسالة واضحة |
| حجم القاعدة | تنبيه | تشغيل تنظيف: حذف رسائل أقدم من 30 يومًا في الغرف الميتة | توقف الكتابة (سلوك Supabase) + إجراء تنظيف يدوي |
| نقل Supabase | تنبيه | تقليل الاستعلامات الدورية | انتظار تجديد الشهر |
| خمول المشروع | — | — | **نبضة دورية** تمنع الخمول (انظر دليل التسليم) |

## 4) خطة الطوارئ عند تعطّل مزوّد

| المزوّد | البديل | جهد التبديل |
|---|---|---|
| Agora (صوت) | LiveKit Cloud (Free: 5,000 دقيقة) أو Jitsi (مجاني تمامًا) | متوسط — تجريد طبقة الصوت في `voice_service.dart` |
| Supabase | Neon (Free: 0.5 ج.ب) + Clerk/Auth.js | عالٍ — الترحيلات جاهزة في `sql/` |
| GitHub Pages | Cloudflare Pages (Free: نقل غير محدود) | منخفض — نفس الملفات الثابتة |
| Firebase FCM | Supabase Realtime + إشعار داخلي | منخفض |

## 5) الخلاصة المالية

**التكلفة الحالية: 0.00 دولار شهريًا.**
أول نقطة تكلفة فعلية ستكون **تجاوز 10,000 دقيقة صوت/شهر** (أي ~5,000 دقيقة مكالمة ثنائية) — وهو ما يقابل تقريبًا 300–800 مستخدم نشط يوميًا.
