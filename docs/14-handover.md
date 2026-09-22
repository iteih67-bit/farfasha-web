# دليل التسليم — فرفشة

> اقرأ هذا الملف فقط، وشغّل المشروع، دون الرجوع لأي شخص.

## 1) روابط أساسية

| البند | الرابط / المسار |
|---|---|
| **تطبيق الويب (PWA) — منشور** | https://iteih67-bit.github.io/farfasha-web/ |
| مستودع الويب | https://github.com/iteih67-bit/farfasha-web |
| تطبيق أندرويد (المصدر) | `C:\Users\AsaadM\Documents\Default Project\farfasha_app` |
| نسخة APK الموقّعة | `farfasha_app\releases\farfasha-1.0.1+2-admin-final.apk` |
| حزمة Play (AAB) | `farfasha_app\releases\farfasha-1.0.1+2-play.aab` |
| سياسة الخصوصية | https://iteih67-bit.github.io/farfasha-legal/privacy.html |
| الشروط | https://iteih67-bit.github.io/farfasha-legal/terms.html |
| التوثيق الفني (31 قسمًا) | `farfasha\docs\11-security-hardening.md` |

## 2) حسابات المزوّدين

| المزوّد | المعرّف | ملاحظة |
|---|---|---|
| Supabase (قاعدة + مصادقة + لحظي + ملفات) | مشروع `qzqvoirrbecmrdvwxeei` · لوحة: https://supabase.com/dashboard/project/qzqvoirrbecmrdvwxeei | المالك: `iteih67@gmail.com` |
| Agora (صوت) | App ID في `farfasha_app\assets\app.env` · لوحة: https://console.agora.io | الشهادة مخزّنة كسرّ Supabase، لا في الكود |
| Firebase (إشعارات) | مشروع `farfasha-1ff6e` | `google-services.json` داخل `android/app/` |
| Google Cloud (OAuth) | مشروع `braided-storm-508009-r5` | **عميل أندرويد** مربوط ببصمة مفتاح الإصدار |
| PostHog (تحليلات) | مشروع Farfasha (611114) | المفتاح العام في `app.env` |
| GitHub | `iteih67-bit` | SSH مضبوط على هذا الجهاز |

## 3) متغيّرات البيئة

**ملف التطبيق:** `farfasha_app\assets\app.env` — **مُستبعد من Git** (لا يُرفع أبدًا).

| المتغيّر | الغرض | عام/سرّي |
|---|---|---|
| `SUPABASE_URL` | عنوان المشروع | عام |
| `SUPABASE_ANON_KEY` | مفتاح العميل | عام (محمي بـRLS) |
| `AGORA_APP_ID` | معرّف تطبيق الصوت | عام |
| `AGORA_TOKEN` | توكن ثابت للاختبار | **اتركه فارغًا** — التوكنات تُصدَر من Edge Function |
| `GOOGLE_WEB_CLIENT_ID` | معرّف OAuth الويب | عام |
| `POSTHOG_API_KEY` | تحليلات | عام |

**أسرار Supabase (Edge Functions):** `AGORA_APP_CERTIFICATE` — يُضبط من Dashboard → Edge Functions → Secrets.

## 4) التشغيل محليًا

### تطبيق الويب
```
cd farfasha-web
python -m http.server 8099 --directory .
# افتح http://127.0.0.1:8099
```

### تطبيق أندرويد
```
cd farfasha_app
flutter pub get
flutter run --release          # يحتاج جهازًا/محاكيًا متصلًا
```

### الاختبارات
```
cd farfasha_app
flutter analyze
flutter test                    # 107 اختبارًا
flutter build apk --release
flutter build appbundle --release
```

## 5) النشر

### الويب (GitHub Pages)
```
cd farfasha-web
git add -A && git commit -m "update" && git push
```
يُعاد النشر تلقائيًا خلال دقيقة. الإعداد: Settings → Pages → Deploy from a branch → `main` / `(root)`.

### أندرويد
1. **توقيع**: المفتاح `android/app/farfasha-release.jks` + `android/key.properties` (كلاهما مُستبعد من Git) — **احتفظ بنسخة احتياطية آمنة، فقده يعني عدم القدرة على التحديث**.
2. بناء الحزمة: `flutter build appbundle --release`.
3. ارفع `build/app/outputs/bundle/release/app-release.aab` على Play Console.
4. **بعد أول رفع**: فعّل Play App Signing، ثم **أضف بصمة مفتاح Play** إلى عميل أندرويد OAuth في Google Cloud (وإلا يفشل دخول Google على النسخة المنشورة).

## 6) إعدادات Supabase الحسّاسة (تحقّق منها قبل الإطلاق)

| الإعداد | القيمة الصحيحة | الأثر لو غلط |
|---|---|---|
| Site URL | `https://iteih67-bit.github.io/farfasha-web/` (حاليًا `http://localhost:3000`) | إعادة توجيه خاطئة بعد روابط البريد |
| Redirect URLs | أضف رابط الويب + `farfasha://reset` | `redirect_uri_mismatch` |
| Google provider | مفعّل + Client ID (قائمة) + Secret | فشل دخول Google |
| Agora secret | `AGORA_APP_CERTIFICATE` مضبوط | فشل إصدار توكن الصوت |
| Email autoconfirm | `true` (مضبوط) | التسجيل يتطلب تأكيد بريد |

## 7) الصيانة الدورية

| المهمة | التكرار | الطريقة |
|---|---|---|
| **نبضة منع الخمول** (Supabase يوقف المشروع بعد أسبوع بلا نشاط) | كل 3 أيام | نداء REST بسيط على جدول `rooms` — أو Scheduled Function |
| لقطة استهلاك | أسبوعيًا | `select public.snapshot_usage();` |
| تصدير سجل التدقيق | شهريًا | زر «تصدير CSV» في لوحة الإدارة |
| نسخة احتياطية | شهريًا | `pg_dump` من Connection String في Supabase → Database |
| مراجعة البلاغات | دوريًا | لوحة الإدارة → تبويب «البلاغات» |

## 8) خطة الطوارئ

| الحادث | الإجراء |
|---|---|
| **توقف المشروع للخمول** | Supabase Dashboard → Settings → General → **Restore project**، ثم شغّل نبضة دورية |
| **تجاوز 10,000 دقيقة صوت** | لوحة Agora → راقب الاستهلاك · اتصل بالمزوّد للترقية أو بدّل إلى LiveKit (5,000 دقيقة مجانًا) |
| **امتلاء القاعدة (500 م.ب)** | احذف رسائل أقدم من 30 يومًا: `delete from messages where created_at < now() - interval '30 days';` |
| **فشل دخول Google** | تحقّق من بصمة SHA-1 الحالية: `keytool -list -v -keystore farfasha-release.jks` وقارنها بعميل OAuth |
| **انقطاع الصوت للجميع** | تحقّق من صلاحية `AGORA_APP_CERTIFICATE` وأن `mint-rtc-token` يرجع رمزًا |
| **تجاوز حد GitHub Pages** | انقل الملفات الثابتة إلى Cloudflare Pages (نقل غير محدود مجانًا) |

## 9) بنية قاعدة البيانات (مرجع سريع)

| الجدول | الغرض |
|---|---|
| `profiles` | الحسابات: الاسم · الأفاتار · النبذة · المستوى · `is_super_admin` · username/country/gender/birthday · xp/coins/gems |
| `rooms` | الغرف: العنوان · التصنيف · المالك · `is_private` · `is_locked` · `topic` |
| `room_secrets` | هاش كلمة سر الغرفة (bcrypt) — لا يُقرأ من العميل |
| `room_members` | العضوية: الدور · رقم الكرسي · كتم · طلب مايك |
| `room_bans` | المحظورون من غرفة بعينها |
| `messages` | رسائل الغرف |
| `direct_messages` | الرسائل الخاصة |
| `moments` / `moment_likes` / `moment_comments` | اللحظات وتفاعلاتها |
| `follows` | المتابعة |
| `blocks` | الحظر على مستوى المنصة |
| `reports` | الإبلاغات وحالتها |
| `gifts` / `gift_sends` | كتالوج الهدايا وإرسالاتها |
| `banned_words` | فلترة الكلمات |
| `device_tokens` | توكنات الإشعارات |
| `crash_reports` | تقارير الأعطال |
| `admin_audit_log` | **سجل التدقيق** — كل إجراء إداري |
| `usage_snapshots` | لقطات استهلاك دورية |

## 10) التحقق السريع بعد التسليم (5 دقائق)

1. افتح https://iteih67-bit.github.io/farfasha-web/ → يجب أن تظهر صفحة «دخول».
2. أنشئ حسابًا → يجب أن تدخل الردهة.
3. أنشئ غرفة → يجب أن تدخل وتظهر «الكراسي» و«الشات».
4. افتح نفس الرابط في **متصفح آخر**، سجّل بحساب مختلف، وانضم بنفس الغرفة → يجب أن يُظهر كل طرف «متصل 🎧».
5. اكتب رسالة من أحدهما → تظهر عند الآخر فورًا.
6. سجّل دخول بحساب سوبر أدمن → يظهر تبويب «الإدارة» بأرقام حقيقية.
7. في لوحة الإدارة → «سجل التدقيق» → اضغط «تصدير CSV» → يتنزّل ملف.
