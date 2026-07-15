import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { AppUser, Expense } from '../models/types';

export const pdfService = {
  generatePdf: async (params: {
    users: AppUser[];
    expenses: Expense[];
    dateRange: string;
    teamName: string;
    currency?: string;
  }): Promise<string> => {
    const currency = params.currency || 'Rs.';
    const total = params.expenses.reduce((sum, e) => sum + e.price * e.quantity, 0);

    const formatter = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
    const formatAmt = (num: number) => `${currency} ${formatter.format(num)}`;

    // Build Members Table HTML
    let membersRows = '';
    params.users.forEach((u) => {
      const spent = params.expenses
        .filter((e) => e.userId === u.id)
        .reduce((sum, e) => sum + e.price * e.quantity, 0);
      const balance = u.walletBalance - spent;
      membersRows += `
        <tr>
          <td>${u.name}</td>
          <td>${formatAmt(spent)}</td>
          <td>${formatAmt(u.walletBalance)}</td>
          <td style="color: ${balance < 0 ? '#E53935' : '#2E7D32'}">${formatAmt(balance)}</td>
        </tr>
      `;
    });

    // Build Expenses Table HTML
    let expenseRows = '';
    params.expenses.forEach((e) => {
      const dateStr = new Date(e.date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      expenseRows += `
        <tr>
          <td>${dateStr}</td>
          <td>${e.itemName}</td>
          <td>${e.quantity}</td>
          <td>${formatAmt(e.price * e.quantity)}</td>
          <td>${e.category.toUpperCase()}</td>
          <td>${e.userName}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #2D2D2D;
            margin: 0;
            padding: 20px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #4CAF50;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .title {
            font-size: 20px;
            font-weight: bold;
            color: #2E7D32;
          }
          .subtitle {
            font-size: 12px;
            color: #757575;
          }
          .period {
            font-size: 10px;
            color: #9E9E9E;
            margin-top: 4px;
          }
          .stats-container {
            display: flex;
            justify-content: space-around;
            background-color: #E8F5E9;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 25px;
          }
          .stat-box {
            text-align: center;
          }
          .stat-val {
            font-size: 16px;
            font-weight: bold;
            color: #2E7D32;
          }
          .stat-lbl {
            font-size: 10px;
            color: #616161;
            margin-top: 4px;
          }
          h3 {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 10px;
            border-left: 3px solid #4CAF50;
            padding-left: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
            font-size: 11px;
          }
          th {
            background-color: #4CAF50;
            color: white;
            text-align: left;
            padding: 8px;
            font-weight: bold;
          }
          td {
            border: 1px solid #EEEEEE;
            padding: 8px;
          }
          tr:nth-child(even) {
            background-color: #F9F9F9;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: #BDBDBD;
            margin-top: 40px;
            border-top: 1px solid #EEEEEE;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${params.teamName}</div>
            <div class="period">Period: ${params.dateRange} | Run: ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="subtitle">Share Expense Report</div>
        </div>

        <div class="stats-container">
          <div class="stat-box">
            <div class="stat-val">${formatAmt(total)}</div>
            <div class="stat-lbl">Total Spending</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${params.users.length}</div>
            <div class="stat-lbl">Members</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${params.expenses.length}</div>
            <div class="stat-lbl">Items Logged</div>
          </div>
        </div>

        ${params.users.length > 0 ? `
          <h3>Members Summary</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Total Spent</th>
                <th>Wallet Balance</th>
                <th>Net Balance</th>
              </tr>
            </thead>
            <tbody>
              ${membersRows}
            </tbody>
          </table>
        ` : ''}

        ${params.expenses.length > 0 ? `
          <h3>Detailed Expenses</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Total Price</th>
                <th>Category</th>
                <th>Paid By</th>
              </tr>
            </thead>
            <tbody>
              ${expenseRows}
            </tbody>
          </table>
        ` : ''}

        <div class="footer">
          <div>by fyntech</div>
          <div>React Native Edition</div>
        </div>
      </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    }
    return uri;
  },

  generateCsv: async (params: {
    expenses: Expense[];
    currency?: string;
  }): Promise<string> => {
    const currency = params.currency || 'Rs.';
    const headers = ['Date', 'Item', 'Quantity', 'Price', 'Total', 'Category', 'By'];
    
    const rows = params.expenses.map((e) => {
      const dateStr = new Date(e.date).toLocaleDateString('en-GB');
      const totalStr = (e.price * e.quantity).toString();
      return [
        dateStr,
        e.itemName,
        e.quantity.toString(),
        e.price.toString(),
        totalStr,
        e.category,
        e.userName,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const filename = `${(FileSystem as any).documentDirectory}ShareExpense_${Date.now()}.csv`;
    await (FileSystem as any).writeAsStringAsync(filename, csvContent, { encoding: (FileSystem as any).EncodingType.UTF8 });
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filename, { mimeType: 'text/csv', dialogTitle: 'Share CSV Statement' });
    }
    return filename;
  }
};
