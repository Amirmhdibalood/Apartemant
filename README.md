# شارژ ساختمان (Building Charge)

اپلیکیشن اندروید **محاسبه شارژ و هزینه‌های ساختمان** — کاملاً فارسی و راست‌به‌چپ، کاملاً آفلاین (بدون سرور و بدون ورود)،
ساخته‌شده با **React + Vite** و بسته‌بندی‌شده به اپ نیتیو اندروید با **Capacitor**.

- پوشه پروژه روی ویندوز: `F:\Balood\building-charge`
- شناسه برنامه (appId): `ir.buildingcharge.app` — نام برنامه: «شارژ ساختمان»

| ابزار | نسخه استفاده‌شده |
| --- | --- |
| React | 19.3 |
| Vite | 8.3 |
| Capacitor (core / cli / android) | 8.5 |
| TypeScript | 5.9 |
| Vitest | 5.0 |
| Node.js لازم | **22.12 یا بالاتر** (پیشنهاد: Node 24 LTS) |
| JDK لازم برای اندروید | **JDK 21** (داخل Android Studio وجود دارد) |
| Android Studio | **2025.2.1 (Otter) یا جدیدتر** — Android SDK Platform 36 |

---

## ۰) APK آماده

یک فایل **`app-debug.apk`** آماده (ساخته‌شده از همین کد) همراه پروژه تحویل داده شده است. اگر فقط می‌خواهید برنامه را نصب کنید،
به هیچ‌کدام از مراحل زیر نیاز ندارید:

1. فایل `app-debug.apk` را به گوشی اندروید منتقل کنید (کابل USB، تلگرام، بلوتوث و ...).
2. روی فایل بزنید. اگر پیام «نصب از منابع ناشناس» آمد، اجازه نصب (Install unknown apps) را برای همان برنامه (مثلاً File Manager) فعال کنید.
3. «نصب» را بزنید. برنامه با نام «شارژ ساختمان» اضافه می‌شود (حداقل اندروید 7.0).

> این APK از نوع Debug است (با کلید دیباگ امضا شده) و برای استفاده شخصی مناسب است. برای انتشار در مارکت‌ها باید نسخه Release امضاشده بسازید.

اگر کامپیوترتان ضعیف است یا Android Studio ندارید، گزینه **GitHub Actions** (بخش ۵) هم APK را روی سرورهای GitHub می‌سازد.

---

## ۱) نصب پیش‌نیازها روی ویندوز (فقط یک‌بار)

1. **Node.js LTS**: از <https://nodejs.org> نسخه **LTS** (نسخه 24) را دانلود و نصب کنید (گزینه‌های پیش‌فرض کافی است).
   بعد از نصب در `Command Prompt` یا `PowerShell` بررسی کنید:
   ```bat
   node -v
   npm -v
   ```
   عدد `node -v` باید **22.12 یا بالاتر** باشد.
2. **Android Studio**: از <https://developer.android.com/studio> نسخه **Otter (2025.2.1) یا جدیدتر** را نصب کنید.
   در اولین اجرا، Setup Wizard را با گزینه **Standard** کامل کنید تا **Android SDK** دانلود شود.
   سپس از منوی `Tools > SDK Manager`:
   - تب **SDK Platforms**: گزینه **Android 16 (API 36)** را تیک بزنید.
   - تب **SDK Tools**: گزینه‌های **Android SDK Build-Tools** و **Android SDK Platform-Tools** را تیک بزنید. `Apply` بزنید.
3. **JDK 21**: Capacitor 8 به JDK 21 نیاز دارد. Android Studio نسخه مناسب (JetBrains Runtime 21) را همراه خود دارد و
   برای ساخت از داخل Android Studio کار دیگری لازم نیست.
   فقط اگر می‌خواهید از خط فرمان (`gradlew`) بسازید، متغیر `JAVA_HOME` را روی JDK داخلی Android Studio بگذارید:
   ```bat
   setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
   setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
   ```
   (پس از `setx` پنجره Command Prompt را ببندید و دوباره باز کنید. به‌جای آن می‌توانید JDK 21 از <https://adoptium.net> نصب کنید.)

---

## ۲) ساخت پروژه و گرفتن APK (ویندوز)

همه دستورات را در **Command Prompt** (یا PowerShell) و داخل پوشه پروژه اجرا کنید:

```bat
cd /d F:\Balood\building-charge
npm install
npm run build
npx cap add android
npx cap sync
npx cap open android
```

توضیح مراحل:

| دستور | کار |
| --- | --- |
| `npm install` | نصب وابستگی‌ها (پوشه `node_modules` ساخته می‌شود؛ فقط بار اول یا بعد از تغییر `package.json`) |
| `npm run build` | ساخت نسخه وب برنامه در پوشه `dist` |
| `npx cap add android` | ساخت پروژه نیتیو اندروید در پوشه `android` (**فقط یک‌بار**؛ اگر پوشه `android` از قبل وجود دارد این مرحله را رد کنید) |
| `npx cap sync` | کپی `dist` و پلاگین‌ها به پروژه اندروید |
| `npx cap open android` | باز کردن پروژه در Android Studio |

### گرفتن APK از داخل Android Studio
1. صبر کنید تا **Gradle Sync** (نوار پایین Android Studio) تمام شود. بار اول چند دقیقه طول می‌کشد و به اینترنت نیاز دارد.
2. از منوی **Build > Build App Bundle(s) / APK(s) > Build APK(s)** را بزنید
   (در نسخه‌های جدیدتر نام منو **Build > Generate App Bundles or APKs > Generate APKs** است).
3. پس از پایان، روی لینک **locate** در پیام پایین صفحه بزنید.

### گرفتن APK از خط فرمان (بدون باز کردن Android Studio)
```bat
cd /d F:\Balood\building-charge\android
gradlew.bat assembleDebug
```
یا همه مراحل با یک دستور:
```bat
cd /d F:\Balood\building-charge
scripts\build-apk.bat
```

### محل فایل APK
```
F:\Balood\building-charge\android\app\build\outputs\apk\debug\app-debug.apk
```

### اجرای مستقیم روی گوشی (اختیاری)
گوشی را با USB وصل کنید، در گوشی `Developer options > USB debugging` را روشن کنید و در Android Studio دکمه سبز ▶ (Run) را بزنید،
یا دستور `npx cap run android` را اجرا کنید.

---

## ۳) ساخت دوباره بعد از تغییر کد

بعد از هر تغییر در کد React (پوشه `src`):
```bat
cd /d F:\Balood\building-charge
npm run build
npx cap sync
```
سپس در Android Studio دوباره **Build APK(s)** را بزنید (یا `cd android` و `gradlew.bat assembleDebug`).
نیازی به اجرای دوباره `npx cap add android` نیست.

---

## ۴) اجرا و تست در مرورگر (اختیاری)

```bat
npm run dev      REM اجرای نسخه توسعه در http://localhost:5173
npm test         REM اجرای تست‌های واحد (محاسبه، فرمت مبلغ، اعتبارسنجی)
npm run preview  REM اجرای نسخه build شده
```
برای دیدن ظاهر موبایل، در Chrome کلید `F12` و سپس حالت موبایل (Ctrl+Shift+M) را فعال کنید.

---

## ۵) ساخت APK با GitHub Actions (بدون نیاز به Android Studio)

فایل `.github/workflows/android-apk.yml` در پروژه وجود دارد و با هر `push` به GitHub، به‌طور خودکار این مراحل را اجرا می‌کند:
`npm ci` → `npm test` → `npm run build` → `npx cap add android` → `npx cap sync android` → `gradlew assembleDebug` → آپلود APK.

1. در GitHub یک مخزن (Repository) جدید و خالی بسازید.
2. در پوشه پروژه:
   ```bat
   cd /d F:\Balood\building-charge
   git remote add origin https://github.com/<USERNAME>/<REPO>.git
   git branch -M main
   git push -u origin main
   ```
3. در صفحه مخزن به تب **Actions** بروید، روی آخرین اجرای **Build Android APK** بزنید و پس از پایان (حدود ۵ تا ۱۰ دقیقه)،
   از بخش **Artifacts** فایل **building-charge-debug-apk** را دانلود کنید (یک فایل zip که `app-debug.apk` داخل آن است).
4. برای اجرای دستی: تب Actions → Build Android APK → **Run workflow**.

---

## امکانات (مطابق مشخصات)

1. **صفحه اصلی**: تصویر ساختمان، عنوان، توضیح، دکمه «ثبت قبض جدید +» و دکمه‌های سوابق/آموزش/تنظیمات.
2. **ثبت قبض جدید**: سال (فقط سال‌های فعال)، ماه (فروردین تا اسفند)، نوع هزینه به‌صورت ۵ کاشی رنگی (آب/برق/گاز/شارژ ساختمان/متفرقه)، شماره قبض و توضیحات (اختیاری).
3. **واحدها**: دکمه‌های + و −، شماره‌گذاری خودکار، تعداد نفرات فقط با تایپ دستی (بدون Spinner)، ستون با عرض ثابت و سربرگ «تعداد نفرات» با آیکون شخص.
4. **مبلغ قبض**: جداکننده هزارگان زنده با ارقام انگلیسی؛ هر تعداد رقم قابل تایپ است و ارقام فارسی/عربی کیبورد خودکار به انگلیسی تبدیل می‌شوند.
5. **محاسبه** و ۶. **صفحه نتیجه** با جدول واحدها، جمع کل و دکمه سبز «ذخیره» با آیکون تقویم.
7. **هشدار «توجه» قبل از ذخیره** با «دیگر این پیام را نمایش نده» (در تنظیمات هم قابل روشن/خاموش کردن).
8. **سوابق**: فیلتر سال/ماه، کارت‌های رنگی با وضعیت و فلش کوچک سمت چپ.
9. **جزئیات قبض** و ۱۰. **تسویه** با چک‌باکس برای هر واحد؛ پس از تسویه همه واحدها وضعیت کلی «تسویه شده» می‌شود.
11. **قفل ویرایش**: ویرایش قبض تسویه‌شده ممکن نیست و Dialog «امکان ویرایش وجود ندارد» نمایش داده می‌شود. ویرایش قبض تسویه‌نشده با همان فرم (پرشده) انجام می‌شود.
12. **Errorها** (قرمز، بدون «دیگر نمایش نده»): مبلغ وارد نشده/نامعتبر، هیچ واحدی اضافه نشده، تعداد نفرات یک واحد وارد نشده/نامعتبر، اطلاعات ضروری ناقص (نوع هزینه و ...)، غیرفعال کردن آخرین سال.
13. **Warningها** (زرد، با «دیگر این پیام را نمایش نده»): هشدار قبل از ذخیره، هشدار قبل از تسویه آخرین واحد (قفل شدن قبض)، هشدار ثبت قبض تکراری (همان نوع در همان ماه/سال)، هشدار گرد شدن مبلغ.
    در تنظیمات دکمه «نمایش دوباره سایر هشدارهای پنهان‌شده» وجود دارد.
14. **آموزش** ۱۱ مرحله‌ای.
15. **تنظیمات**: سوییچ هشدار قبل از ذخیره + Chipهای سال از ۱۴۰۳ تا ۱۰۰ سال بعد از سال جاری (آبی = فعال، خاکستری = غیرفعال، با لمس Toggle می‌شود؛ پیش‌فرض ۱۴۰۴ و ۱۴۰۵؛ حداقل یک سال همیشه فعال می‌ماند).
16. **Bottom Navigation**: خانه، آموزش، سوابق، تنظیمات. دکمه Back گوشی هم پشتیبانی می‌شود.
17. **ذخیره‌سازی محلی و آفلاین** (جزئیات پایین).

## منطق محاسبه و گرد کردن

```
مجموع نفرات  = جمع تعداد نفرات همه واحدها
هزینه هر نفر = مبلغ قبض ÷ مجموع نفرات
سهم هر واحد = هزینه هر نفر × تعداد نفرات آن واحد
```

مبالغ به **تومانِ صحیح** ذخیره می‌شوند. وقتی مبلغ بر تعداد نفرات بخش‌پذیر نیست، برای اینکه **جمع سهم‌ها دقیقاً برابر مبلغ کل** شود،
از روش «بزرگ‌ترین باقیمانده» (Largest Remainder) استفاده می‌شود:

1. سهم پایه هر واحد = `floor(مبلغ × نفرات واحد ÷ مجموع نفرات)`
2. باقیمانده = مبلغ کل − جمع سهم‌های پایه (همیشه کمتر از تعداد واحدها است)
3. به واحدهایی که بیشترین کسرِ حذف‌شده را داشته‌اند، هرکدام **۱ تومان** اضافه می‌شود؛ در صورت تساوی، **واحد با شماره کوچک‌تر** مقدم است.
   بنابراین نتیجه همیشه یکسان و قابل پیش‌بینی (Deterministic) است.

مثال: ۱٬۰۰۰٬۰۰۰ تومان بین ۳ واحد یک‌نفره → `333,334` + `333,333` + `333,333` = `1,000,000`.
در این حالت «هزینه هر نفر» با علامت `≈` نمایش داده می‌شود و یک هشدار (قابل صرف‌نظر) توضیح می‌دهد که سهم برخی واحدها ۱ تومان بیشتر است.
محاسبات داخلی با `BigInt` انجام می‌شود تا در مبالغ بسیار بزرگ هم دقت از دست نرود.

## ذخیره‌سازی (دیتابیس محلی)

- لایه `src/storage` از پلاگین رسمی `@capacitor/preferences` استفاده می‌کند (روی اندروید: SharedPreferences؛ در مرورگر: localStorage).
  داده‌ها با بستن برنامه یا ری‌استارت گوشی پاک نمی‌شوند (فقط با حذف برنامه یا Clear data).
- دو «جدول» جدا مطابق Entityها:
  - `Bill { id, year, month, expenseType, billNumber?, description?, totalAmount, createdAt, isFullySettled }`
  - `Unit { id, billId, unitNumber, personCount, shareAmount, isSettled }`
- تنظیمات: `{ showSaveWarning, activeYears, dismissedWarnings }`
- همه سوابق از همین دیتابیس خوانده و بر اساس سال و ماه فیلتر می‌شوند.

## ساختار پروژه (معماری تمیز)

```
building-charge/
├─ index.html                 ← lang="fa" dir="rtl"
├─ capacitor.config.ts        ← appId / appName / webDir: dist
├─ vite.config.ts, vitest.config.ts, tsconfig*.json
├─ .github/workflows/android-apk.yml   ← ساخت APK روی GitHub
├─ scripts/build-apk.bat      ← ساخت APK در ویندوز با یک دستور
├─ tests/                     ← تست‌های واحد (Vitest)
└─ src/
   ├─ models/      types.ts (Bill, Unit, Settings, Draft) · constants.ts (ماه‌ها، انواع هزینه، رنگ‌ها، سال‌ها)
   ├─ logic/       calculation · formatting · validation · errors · warnings · settlement · years · billFactory · date · id
   ├─ storage/     kvStore (Capacitor Preferences) · billRepository · settingsRepository
   ├─ context/     SettingsContext · FeedbackContext (مدیریت جدای Error / Warning / Toast)
   ├─ components/  AppHeader, BottomNav, AmountInput, PersonCountInput, UnitsEditor, ExpenseTypePicker,
   │               ErrorDialog, WarningDialog, LockedDialog, ConfirmDialog, Toast, Checkbox, Switch, Icons, Illustrations ...
   ├─ screens/     Home, NewBill (ثبت/ویرایش), Result, Records, BillDetails, Tutorial, Settings
   ├─ styles/      global.css (Design System مطابق تصویر مرجع)
   ├─ App.tsx      ناوبری (Stack) + دکمه Back اندروید
   └─ main.tsx     فونت Vazirmatn محلی (بدون CDN)
```

- فونت **Vazirmatn** از پکیج `@fontsource/vazirmatn` داخل برنامه قرار می‌گیرد؛ هیچ درخواست اینترنتی وجود ندارد.
- پوشه `android` عمداً در مخزن نیست (با `npx cap add android` ساخته می‌شود) — در `.gitignore` آمده است.

## نام فارسی برنامه در اندروید

`appName` در `capacitor.config.ts` روی «شارژ ساختمان» تنظیم شده و `npx cap add android` آن را در
`android\app\src\main\res\values\strings.xml` می‌نویسد (تست شده و مشکلی ندارد). اگر روزی بخواهید نام را دستی تغییر دهید، این دو خط را ویرایش کنید:
```xml
<string name="app_name">شارژ ساختمان</string>
<string name="title_activity_main">شارژ ساختمان</string>
```

## رفع اشکال‌های رایج

- **`npx cap add android` خطای «platform already exists»**: پوشه `android` از قبل ساخته شده؛ فقط `npx cap sync` بزنید.
- **`SDK location not found`**: در `android\local.properties` این خط را بگذارید (نام کاربری خود را جایگزین کنید):
  `sdk.dir=C\:\\Users\\<USERNAME>\\AppData\\Local\\Android\\Sdk`
- **خطای نسخه Java** (مثلاً `requires Java 21`): در Android Studio مسیر `File > Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK`
  را روی **jbr-21** (JetBrains Runtime 21) بگذارید؛ برای خط فرمان `JAVA_HOME` را طبق بخش ۱ تنظیم کنید.
- **`node` نسخه قدیمی است**: Capacitor 8 به Node 22 یا بالاتر نیاز دارد؛ Node LTS جدید را نصب کنید.
- بعد از هر تغییر کد، `npm run build` و `npx cap sync` را فراموش نکنید؛ در غیر این صورت APK نسخه قبلی را نشان می‌دهد.
