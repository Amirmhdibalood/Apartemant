# پیش‌نویس اسکمای دیتابیس آفلاین (برای تأیید)

> وضعیت: **پیاده‌سازی‌شده در ۱.۸.۰** — موتور SQLite (sql.js)؛ جزئیات در `docs/SQLITE.md`.  
> هدف: ذخیرهٔ پایدار روی دستگاه برای نسخهٔ رایگان + آمادگی برای چندساختمان و صندوق اختیاری.  
> تاریخ به‌روزرسانی: ۱۴۰۴/۰۸/۰۶ (۲۰۲۶-۱۰-۲۸)

## اصول

1. همه چیز روی دستگاه؛ بدون سرور.
2. دادهٔ فعلی (تک‌ساختمان) با مهاجرت به یک ساختمان پیش‌فرض منتقل می‌شود.
3. پرداخت‌ها از آرایهٔ داخل واحد جدا می‌شوند (جدول مستقل) تا ذخیرهٔ ردیفی ممکن باشد.
4. هر ذخیره نباید کل دیتابیس را پاک و دوباره بنویسد (ردیف‌به‌ردیف).
5. **فاز اول = SQLite** (تصمیم مالک ۱۴۰۴/۰۸/۰۶). IndexedDB دیگر مسیر هدف نیست؛ داده از IDB/Preferences به SQLite مهاجرت می‌کند.
6. تنظیمات ظاهری (تم و …) همچنان بیرون از بکاپ دامنه می‌مانند (مثل امروز).

## جداول

### `buildings` — ساختمان

| فیلد | نوع | توضیح |
|---|---|---|
| id | text PK | شناسه |
| name | text | نام نمایشی (پیش‌فرض: «ساختمان ۱») |
| fund_enabled | int/bool | صندوق این ساختمان روشن است؟ |
| created_at | text ISO | |
| archived_at | text ISO null | اختیاری برای بعد |

### `building_unit_templates` — قالب واحدها (تنظیمات ساختمان)

| فیلد | نوع | توضیح |
|---|---|---|
| id | text PK | |
| building_id | text FK → buildings | |
| unit_number | int | ۱، ۲، … |
| alias | text null | |
| default_persons | int | ≥ ۱ |
| vacant | bool | |
| area | real null | مترمربع |

ایندکس یکتا: `(building_id, unit_number)`

### `bills` — قبض

همان فیلدهای فعلی `Bill` به‌علاوه:

| فیلد | نوع | توضیح |
|---|---|---|
| building_id | text FK → buildings | الزامی بعد از مهاجرت |

ایندکس پیشنهادی: `(building_id, year, month)`, `deleted_at`, `expense_type`

### `bill_units` — واحدِ روی قبض (عکس لحظه‌ای)

همان فیلدهای فعلی `Unit` بدون `payments` توکار:

| فیلد | نوع |
|---|---|
| id | text PK |
| bill_id | text FK |
| building_id | text FK (برای کوئری سریع؛ مشتق از قبض هم قابل قبول است) |
| unit_number, person_count, alias, vacant, area, share_amount, is_settled | مثل امروز |

ایندکس: `bill_id`, `(building_id, unit_number)`

### `payments` — پرداخت واحد روی قبض

| فیلد | نوع | توضیح |
|---|---|---|
| id | text PK | |
| bill_unit_id | text FK → bill_units | |
| bill_id | text FK | تکراری مفید برای گزارش |
| building_id | text FK | |
| amount | int | تومان |
| paid_at | text ISO null | |
| batch_id | text null | برای لغو گروهی |

ایندکس: `bill_unit_id`, `batch_id`, `bill_id`

### `fund_entries` — گردش صندوق (فقط اگر `buildings.fund_enabled`)

| فیلد | نوع | توضیح |
|---|---|---|
| id | text PK | |
| building_id | text FK | |
| kind | text | `deposit` / `withdraw` |
| amount | int | مثبت |
| reason | text | مثلاً `charge_bill` / `expense` / `pay_bill` / `manual` |
| related_bill_id | text null FK | اگر به قبض وصل است |
| related_payment_id | text null | برای برگشت واریز شارژ |
| note | text null | |
| created_at | text ISO | |

قاعدهٔ محصول (قفل‌شده): وقتی صندوق ساختمان روشن است، به‌ازای **هر پرداخت ثبت‌شده** روی قبض نوع `building` (شارژ ساختمان)، یک `fund_entries` از نوع `deposit` به همان مبلغ ساخته می‌شود. اگر پرداخت لغو شود، واریز متناظر هم برداشته/خنثی می‌شود.

موجودی = Σ deposit − Σ withdraw همان ساختمان.

### `management_periods` — دورهٔ مدیریت

| فیلد | نوع | توضیح |
|---|---|---|
| id | text PK | |
| building_id | text FK | |
| manager_label | text | نام/عنوان مدیر در آن دوره (بدون حساب کاربری آنلاین) |
| start_date | text | شمسی |
| end_date | text | شمسی |
| ended_early_at | text null | اگر قبل از پایان عوض شد |
| notes | text null | |

تاریخچهٔ مدیران = ردیف‌های همین جدول. **حذف ردیف دوره مجاز نیست** (فقط بستن زودهنگام / ثبت دورهٔ جدید).

### `meetings` / `meeting_attendance` — جلسهٔ مدیر (آفلاین)

| فیلد meetings | نوع | توضیح |
|---|---|---|
| id | text PK | |
| building_id | text FK | |
| meeting_date | text | کلید شمسی `YYYY-MM-DD` |
| weekday | text | نام روز هفته |
| hour / minute | int | ساعت محلی |
| place | text null | محل/یادداشت |
| summary | text null | خلاصه |
| created_at | text ISO | |

| فیلد attendance | نوع | توضیح |
|---|---|---|
| meeting_id | text FK | |
| unit_number | int | |
| unit_alias | text null | |
| status | text | `present` / `absent` / `empty` |

### `app_meta` / تنظیمات دامنه

- `app_settings` (activeYears، هشدارها، …) می‌تواند یک ردیف JSON یا KV بماند.
- `split_defaults` مثل امروز KV.
- تم و UI prefs بیرون از دامنهٔ مهاجرت دامنه.

## روابط (خلاصه)

```
buildings 1──< building_unit_templates
buildings 1──< bills 1──< bill_units 1──< payments
buildings 1──< fund_entries
buildings 1──< management_periods
buildings 1──< meetings 1──< meeting_attendance
```

## مهاجرت از دادهٔ فعلی

1. یک `buildings` پیش‌فرض بساز (`fund_enabled = false`).
2. قالب واحدها را از Preferences `building` به `building_unit_templates` ببر.
3. همهٔ `bills` / `units` فعلی را با `building_id` پیش‌فرض کپی کن.
4. هر `unit.payments[]` را به جدول `payments` باز کن.
5. نسخهٔ اسکما را در meta بگذار؛ بکاپ JSON نسل جدید با `building_id` هماهنگ شود (نسخهٔ بکاپ جدید در پیاده‌سازی).

## خارج از این پیش‌نویس (عمداً)

- حساب کاربری، چت، سرور
- دعوت عضو آنلاین
- همگام‌سازی ابری

## تصمیم‌های قفل‌شده برای پیاده‌سازی

1. موتور ذخیره: **SQLite** از فاز اول.
2. برنامه بدون دیتابیس مستقل تحویل داده نمی‌شود.
3. واریز صندوق: با **پرداخت واحد** روی قبض شارژ (نه فقط ثبت قبض).
4. `fund_enabled` پیش‌فرض ساختمان مهاجرت‌شده: **خاموش**.
5. جدا کردن جدول `payments` تأیید ضمنی با «خودت برو جلو».

