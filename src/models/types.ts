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
  /** تعداد نفرات هر واحد به‌صورت رشته خام (به ترتیب واحد ۱، ۲، ...) */
  personCounts: string[];
  /** اگر واحدها از الگوی آخرین قبض پر شده باشند: تعداد واحدهای پرشده (فقط برای نمایش راهنما) */
  prefilledUnits?: number;
}
