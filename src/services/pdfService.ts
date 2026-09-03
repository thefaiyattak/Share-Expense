import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Alert } from 'react-native';
import { AppUser, Expense } from '../models/types';

export const pdfService = {
  generatePdf: async (params: {
    users: AppUser[];
    expenses: Expense[];
    dateRange: string;
    teamName: string;
    currency?: string;
    targetUserId?: string;
    skipShare?: boolean;
    monthKey?: string;
  }): Promise<string> => {
    const currency = params.currency || 'PKR';
    
    // Filter by targetUserId if provided (for individual member report)
    const filteredExpenses = params.targetUserId
      ? params.expenses.filter((e) => e.userId === params.targetUserId)
      : params.expenses;
      
    const filteredUsers = params.targetUserId
      ? params.users.filter((u) => u.id === params.targetUserId)
      : params.users;

    const total = filteredExpenses.reduce((sum, e) => sum + ((Number(e.price) || 0) * (parseFloat(e.quantity) || 1)), 0);

    const formatter = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
    const formatAmt = (num: number) => `${currency} ${formatter.format(num)}`;

    const currentKey = params.monthKey || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const getUserMonthWallet = (u: AppUser) => {
      if (u?.monthlyWallets && u.monthlyWallets[currentKey] !== undefined) {
        return u.monthlyWallets[currentKey];
      }
      if (currentKey === '2026-08' && (!u?.monthlyWallets || Object.keys(u.monthlyWallets).length === 0)) {
        return u.walletBalance || 0;
      }
      return 0;
    };

    // Build Members Table HTML
    let membersRows = '';
    filteredUsers.forEach((u) => {
      const spent = filteredExpenses
        .filter((e) => e.userId === u.id)
        .reduce((sum, e) => sum + ((Number(e.price) || 0) * (parseFloat(e.quantity) || 1)), 0);
      const userWallet = getUserMonthWallet(u);
      const balance = userWallet - spent;
      membersRows += `
        <tr>
          <td>${u.name}</td>
          <td>${formatAmt(spent)}</td>
          <td>${formatAmt(userWallet)}</td>
          <td style="color: ${balance < 0 ? '#E53935' : '#2E7D32'}">${formatAmt(balance)}</td>
        </tr>
      `;
    });

    // Build Expenses Table HTML
    let expenseRows = '';
    filteredExpenses.forEach((e) => {
      const expDate = new Date(e.date);
      const datePart = expDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timePart = expDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const dateStr = `${datePart} ${timePart}`;
      expenseRows += `
        <tr>
          <td>${dateStr}</td>
          <td>${e.itemName}</td>
          <td>${e.quantity}</td>
          <td>${formatAmt((Number(e.price) || 0) * (parseFloat(e.quantity) || 1))}</td>
          <td>${e.category.toUpperCase()}</td>
          <td>${e.userName}</td>
        </tr>
      `;
    });

    const reportTitle = params.targetUserId && filteredUsers.length > 0
      ? `${filteredUsers[0].name}'s Statement`
      : 'Collective Statement';

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
          <div class="subtitle">${reportTitle}</div>
        </div>

        <div class="stats-container">
          <div class="stat-box">
            <div class="stat-val">${formatAmt(total)}</div>
            <div class="stat-lbl">Total Spending</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${filteredUsers.length}</div>
            <div class="stat-lbl">Members</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${filteredExpenses.length}</div>
            <div class="stat-lbl">Items Logged</div>
          </div>
        </div>

        ${filteredUsers.length > 0 ? `
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

          <h3>Settlement Summary (Option 1: Wallet Pool Refund)</h3>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Deposit + Spent</th>
                <th>Share</th>
                <th>Net Settlement</th>
              </tr>
            </thead>
            <tbody>
              ${filteredUsers.map(u => {
                const spent = filteredExpenses
                  .filter((e) => e.userId === u.id)
                  .reduce((sum, e) => sum + ((Number(e.price) || 0) * (parseFloat(e.quantity) || 1)), 0);
                const userWallet = getUserMonthWallet(u);
                const totalContributed = userWallet + spent;
                const net = totalContributed - Math.round(total / (filteredUsers.length || 1));
                const isPos = net >= 0;
                return `
                  <tr>
                    <td><strong>${u.name}</strong></td>
                    <td>${formatAmt(totalContributed)} (${formatAmt(userWallet)} + ${formatAmt(spent)})</td>
                    <td>${formatAmt(Math.round(total / (filteredUsers.length || 1)))}</td>
                    <td style="color: ${isPos ? '#2E7D32' : '#E53935'}; font-weight: bold;">
                      ${isPos ? 'Receives +' : 'Owes -'}${formatAmt(Math.abs(net))}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : ''}

        ${filteredExpenses.length > 0 ? `
          <h3>Detailed Expenses</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Qty/Desc</th>
                <th>Price</th>
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
          <div>Developed by DigitalAppsStudio in collaboration with fyntech</div>
          <div>React Native Edition</div>
        </div>
      </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    if (!params.skipShare && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri);
    }
    return uri;
  },

  generateCsv: async (params: {
    expenses: Expense[];
    currency?: string;
    targetUserId?: string;
    skipShare?: boolean;
    dateRange?: string;
    teamName?: string;
  }): Promise<string> => {
    const currency = params.currency || 'Rs.';
    const headers = ['Date', 'Item', 'Qty/Desc', 'Price', 'Category', 'By'];
    
    const filteredExpenses = params.targetUserId
      ? params.expenses.filter((e) => e.userId === params.targetUserId)
      : params.expenses;

    const rows = filteredExpenses.map((e) => {
      const expDate = e.date ? new Date(e.date) : new Date(0);
      const datePart = expDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const timePart = expDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const dateStr = `${datePart} ${timePart}`;
      return [
        String(dateStr || ''),
        String(e.itemName || ''),
        String(e.quantity || ''),
        String((Number(e.price) || 0) * (parseFloat(e.quantity) || 1)),
        String(e.category || ''),
        String(e.userName || ''),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const reportLabel = params.targetUserId ? `Individual_${params.targetUserId}` : 'Collective';
    const filename = `${FileSystem.documentDirectory}ShareExpense_${reportLabel}_${Date.now()}.csv`;
    await FileSystem.writeAsStringAsync(filename, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
    
    if (!params.skipShare && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(filename, { mimeType: 'text/csv', dialogTitle: 'Share CSV Statement' });
    }
    return filename;
  },

  shareFile: async (uri: string, mimeType: string, dialogTitle?: string): Promise<boolean> => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType, dialogTitle: dialogTitle || 'Share Report' });
      return true;
    } else {
      Alert.alert('Error', 'Sharing is not available on this device.');
      return false;
    }
  },

  saveFileToDevice: async (localUri: string, fileName: string, mimeType: string): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) {
          Alert.alert('Permission Denied', 'Storage directory permission is required to save reports.');
          return false;
        }

        let fileContent: string;
        let encoding: any;

        if (mimeType === 'application/pdf') {
          fileContent = await FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          encoding = FileSystem.EncodingType.Base64;
        } else {
          fileContent = await FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          encoding = FileSystem.EncodingType.UTF8;
        }

        const cleanFileName = fileName.replace(/\.(pdf|csv)$/i, '');
        const createdUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          cleanFileName,
          mimeType
        );

        await FileSystem.writeAsStringAsync(createdUri, fileContent, { encoding });
        Alert.alert('Success', 'Report saved directly to your selected folder!');
        return true;
      } else {
        // iOS provides native save to file options directly through the Sharing Sheet
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(localUri, { mimeType, dialogTitle: 'Save Report' });
          return true;
        } else {
          Alert.alert('Error', 'Saving is not available on this device.');
          return false;
        }
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to save file: ${error.message || error}`);
      return false;
    }
  }
};
