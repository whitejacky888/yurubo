/**
 * format.ts ― 日時を読みやすい文字に変換する関数
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']; // Date.getDay() は 日曜=0 〜 土曜=6

/** 2 桁にそろえる（7 → "07"） */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * ミリ秒（または Date）を「10/10(土) 19:00」の形にします。
 */
export function formatDateTime(value: number | Date): string {
  const d = typeof value === 'number' ? new Date(value) : value;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** チャットの時刻用：「10/7 21:05」 */
export function formatShort(value: number | Date): string {
  const d = typeof value === 'number' ? new Date(value) : value;
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
