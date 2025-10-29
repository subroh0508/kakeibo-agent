import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

const itemSchema = z.object({
  name: z.string().describe('商品名'),
  quantity: z.number().describe('数量'),
  price: z.number().describe('単価'),
  total: z.number().describe('小計'),
});

export const csvWriterTool = createTool({
  id: 'write-receipt-csv',
  description: 'レシートデータをCSV形式のファイルに書き込む',
  inputSchema: z.object({
    storeName: z.string().describe('店舗名'),
    date: z.string().describe('購入日時 (YYYY-MM-DDTHH:mm:ss形式)'),
    items: z.array(itemSchema).describe('購入商品の配列'),
    subtotal: z.number().describe('小計'),
    tax: z.number().describe('消費税'),
    total: z.number().describe('合計金額'),
    paymentMethod: z.string().optional().describe('支払い方法'),
  }),
  outputSchema: z.object({
    success: z.boolean().describe('記録が成功したかどうか'),
    message: z.string().describe('処理結果のメッセージ'),
    filePath: z.string().describe('記録されたファイルのパス'),
    recordedCount: z.number().describe('記録された行数'),
  }),
  execute: async ({ context }) => {
    return await writeReceiptToCSV(context);
  },
});

interface ReceiptData {
  storeName: string;
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod?: string;
}

const writeReceiptToCSV = async (data: ReceiptData) => {
  try {
    // データディレクトリとファイルパスの設定
    const dataDir = path.join(process.cwd(), 'data');
    const filePath = path.join(dataDir, 'receipts.csv');

    // データディレクトリが存在しない場合は作成
    await fs.mkdir(dataDir, { recursive: true });

    // ファイルの存在確認
    let fileExists = false;
    try {
      await fs.access(filePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    // CSVヘッダー
    const headers = [
      '店舗名',
      '購入日時',
      '商品名',
      '数量',
      '単価',
      '商品小計',
      '小計',
      '消費税',
      '合計金額',
      '支払い方法',
    ].join(',');

    // CSVデータ行の作成
    const rows: string[] = [];
    data.items.forEach((item, index) => {
      const row = [
        escapeCSV(data.storeName),
        escapeCSV(data.date),
        escapeCSV(item.name),
        item.quantity.toString(),
        item.price.toString(),
        item.total.toString(),
        // 最初の商品行にのみ小計・税・合計を記録
        index === 0 ? data.subtotal.toString() : '',
        index === 0 ? data.tax.toString() : '',
        index === 0 ? data.total.toString() : '',
        index === 0 ? escapeCSV(data.paymentMethod || '') : '',
      ].join(',');
      rows.push(row);
    });

    // ファイルへの書き込み
    let content = '';
    if (!fileExists) {
      // ファイルが存在しない場合はヘッダーを追加
      content = headers + '\n' + rows.join('\n') + '\n';
    } else {
      // ファイルが存在する場合は追記
      content = rows.join('\n') + '\n';
    }

    await fs.appendFile(filePath, content, 'utf-8');

    return {
      success: true,
      message: `レシートデータを正常に記録しました。${data.items.length}件の商品を記録しました。`,
      filePath: filePath,
      recordedCount: data.items.length,
    };
  } catch (error) {
    return {
      success: false,
      message: `CSV書き込み中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
      filePath: '',
      recordedCount: 0,
    };
  }
};

/**
 * CSV用に文字列をエスケープする
 * カンマ、改行、ダブルクォートを含む場合はダブルクォートで囲む
 */
const escapeCSV = (value: string): string => {
  if (!value) return '';

  // カンマ、改行、ダブルクォートを含む場合
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    // ダブルクォートを2つにエスケープして、全体をダブルクォートで囲む
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
};
