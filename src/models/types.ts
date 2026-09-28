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
 */
export type SplitMethod = 'perPerson' | 'perUnit';

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
  personCount: number;
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
  /** اگر واحدها از الگوی آخرین قبض پر شده باشند: تعداد واحدهای پرشده (فقط برای نمایش راهنما) */
  prefilledUnits?: number;
}
