/** انواع هزینه (فقط یکی از این ۸ مورد؛ سه مورد آخر از نسخه ۱.۲.۰) */
export type ExpenseType =
  | 'water'
  | 'electricity'
  | 'gas'
  | 'building'
  | 'misc'
  | 'cleaning'
  | 'repairs'
  | 'beautification';

/**
 * نحوه تقسیم قبض (از نسخه ۱.۳.۰):
 * - perPerson: بر اساس نفرات (سهم هر واحد متناسب با تعداد نفرات آن)
 * - perUnit: بر اساس واحد (هر واحد یک سهم برابر، بدون توجه به نفرات)
 * - perArea: بر اساس متراژ (از نسخه ۱.۶.۵؛ سهم هر واحد متناسب با متراژ آن)
 */
export type SplitMethod = 'perPerson' | 'perUnit' | 'perArea';

/** Entity: Bill (قبض) */
export interface Bill {
  id: string;
  year: number;
  /** 1..12 (فروردین تا اسفند) */
  month: number;
  expenseType: ExpenseType;
  billNumber: string | null;
  description: string | null;
  /** مبلغ کل قبض به تومان (عدد صحیح) */
  totalAmount: number;
  /** ISO timestamp */
  createdAt: string;
  isFullySettled: boolean;
  /** نحوه تقسیم؛ در قبض‌های نسخه‌های قبلی وجود ندارد = بر اساس نفرات */
  splitMethod?: SplitMethod;
  /**
   * «پرداخت شد» (از نسخه ۱.۵.۰): مدیر ساختمان خودِ قبض را به شرکت/اداره مربوط پرداخت کرده است
   * (جدا از پرداخت‌های ساکنان به ازای هر واحد). داده‌های قدیمی هنگام بارگذاری/بازیابی = false.
   * قبض پرداخت‌شده قابل حذف نیست و این وضعیت در تصویر اشتراکی قبض نمایش داده نمی‌شود.
   */
  billPaid?: boolean;
  /** تاریخ پرداخت قبض (شمسی "1405-07-15"؛ پیش‌فرض روز زدن تیک، قابل ویرایش) یا null = نامشخص */
  billPaidDate?: string | null;
  /** «مهلت پرداخت» قبض (از نسخه ۱.۵.۰، اختیاری)؛ تاریخ شمسی "1405-07-15" یا null */
  dueDate?: string | null;
  /** حذف نرم (از نسخه ۱.۵.۰): زمان انتقال به «حذف‌شده» (ISO) یا null. قبض حذف‌شده جز در فیلتر «حذف‌شده» هیچ‌جا دیده نمی‌شود. */
  deletedAt?: string | null;
}

/** Entity: Unit (واحد) */
export interface Unit {
  id: string;
  billId: string;
  unitNumber: number;
  /** تعداد نفرات (از نسخه ۱.۶.۰ صفر هم مجاز است = واحد خالی) */
  personCount: number;
  /**
   * اسم مستعار واحد در زمان ثبت قبض (از نسخه ۱.۶.۰؛ مثل «آقای رضایی») یا null.
   * این یک «عکس لحظه‌ای» است: تغییر تنظیمات ساختمان روی قبض‌های قبلی اثری ندارد.
   */
  alias?: string | null;
  /**
   * واحد خالی در زمان ثبت قبض (از نسخه ۱.۶.۳): از محاسبه کنار گذاشته می‌شود (بدون سهم، بدون بدهی).
   * عکس لحظه‌ای است؛ نبودن = خالی نیست.
   */
  vacant?: boolean;
  /**
   * متراژ واحد (مترمربع، اعشار مجاز تا ۳ رقم) در زمان ثبت قبض (از نسخه ۱.۶.۵) — عکس لحظه‌ای.
   * فقط تقسیم «بر اساس متراژ» به آن نیاز دارد؛ نبودن = وارد نشده.
   */
  area?: number | null;
  /** سهم این واحد به تومان (عدد صحیح) */
  shareAmount: number;
  /** تسویه‌شده = مانده بدهی صفر (همیشه از روی پرداخت‌ها محاسبه می‌شود) */
  isSettled: boolean;
  /**
   * پرداخت‌های این واحد برای این قبض (از نسخه ۱.۲.۰؛ امکان چند پرداخت جزئی).
   * در داده‌های قدیمی وجود ندارد: واحد تسویه‌شده = یک پرداخت کامل با تاریخ نامشخص (logic/payments.ts).
   */
  payments?: Payment[];
}

/** یک پرداخت (کامل یا جزئی) */
export interface Payment {
  id: string;
  /** مبلغ به تومان (عدد صحیح مثبت) */
  amount: number;
  /** زمان پرداخت (ISO)، خودکار هنگام ثبت؛ null = نامشخص (تسویه‌های نسخه‌های قبلی) */
  paidAt: string | null;
}

/** قبض به‌همراه واحدهایش (برای نمایش) */
export interface BillWithUnits {
  bill: Bill;
  units: Unit[];
}

/** شناسه هشدارهایی که گزینه «دیگر این پیام را نمایش نده» دارند */
export type WarningId = 'saveConfirm' | 'lastUnitSettle' | 'duplicateBill' | 'roundingAdjust';

export interface AppSettings {
  /** نمایش هشدار «توجه» قبل از ذخیره */
  showSaveWarning: boolean;
  /** سال‌های فعال (فقط این‌ها در کشوی سال نمایش داده می‌شوند) */
  activeYears: number[];
  /** سایر هشدارهایی که کاربر «دیگر نمایش نده» زده است */
  dismissedWarnings: WarningId[];
}

/** داده فرم ثبت/ویرایش قبض (ورودی‌های خام کاربر) */
export interface BillDraft {
  /** در حالت ویرایش: شناسه قبض موجود */
  editingBillId: string | null;
  year: number;
  month: number;
  expenseType: ExpenseType | null;
  billNumber: string;
  description: string;
  /** فقط ارقام انگلیسی بدون جداکننده؛ مثل "12500000" */
  amountDigits: string;
  /** تعداد نفرات هر واحد به‌صورت رشته خام (به ترتیب واحد ۱، ۲، ...) — در تقسیم «بر اساس واحد» هم دست‌نخورده می‌ماند */
  personCounts: string[];
  /** نحوه تقسیم */
  splitMethod: SplitMethod;
  /** کاربر نحوه تقسیم را خودش انتخاب کرده است (دیگر با تغییر نوع هزینه عوض نمی‌شود) */
  splitChosen?: boolean;
  /** مهلت پرداخت (تاریخ شمسی "1405-07-15") یا null */
  dueDate?: string | null;
  /**
   * اسم مستعار هر واحد (هم‌ردیف personCounts) — از نسخه ۱.۶.۰.
   * قبض جدید: از تنظیمات «ساختمان»؛ ویرایش: از عکس لحظه‌ای خود قبض (تعداد واحدها در فرم ثابت است).
   */
  unitAliases?: (string | null)[];
  /** واحد خالی بودن هر ردیف (هم‌ردیف personCounts) — از نسخه ۱.۶.۳؛ فقط برای همین قبض */
  unitVacant?: boolean[];
  /** متراژ هر ردیف به‌صورت رشته خام (هم‌ردیف personCounts؛ مثل «75.5» یا «») — از نسخه ۱.۶.۵؛ فقط برای همین قبض */
  unitAreas?: string[];
}

/** یک واحد در تنظیمات «ساختمان» (از نسخه ۱.۶.۰) */
export interface BuildingUnit {
  /** اسم مستعار اختیاری (مثل «آقای رضایی») یا null */
  alias: string | null;
  /** تعداد نفرات پیش‌فرض (همیشه ≥ ۱؛ مقدار قدیمی ۰ هنگام خواندن به «خالی» تبدیل می‌شود) */
  defaultPersons: number;
  /** واحد خالی (از نسخه ۱.۶.۳): در قبض‌های جدید به‌طور پیش‌فرض از محاسبه کنار گذاشته می‌شود؛ نبودن = خالی نیست */
  vacant?: boolean;
  /** متراژ پیش‌فرض واحد (مترمربع، اعشار مجاز) یا نبودن = وارد نشده (از نسخه ۱.۶.۵) */
  area?: number;
}

/** تنظیمات «ساختمان»: واحدهای قبض‌های جدید به ترتیب واحد ۱، ۲، ... */
export interface BuildingSettings {
  units: BuildingUnit[];
}
