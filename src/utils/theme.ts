export const AppColors = {
  primary: '#4CAF50',
  primaryDark: '#2E7D32',
  primaryLight: '#E8F5E9',
  error: '#D32F2F',
  warning: '#F57F17',
  surface: '#FFFFFF',
  background: '#F5F5F5',
  textPrimary: '#2D2D2D',
  textSecondary: '#757575',
  textTertiary: '#BDBDBD',
  divider: '#EEEEEE',

  // Dark Theme variations
  darkBackground: '#121212',
  darkSurface: '#1E1E1E',
  darkTextPrimary: '#FFFFFF',
  darkTextSecondary: '#AAAAAA',
  darkDivider: '#2D2D2D',
};

// Strict App-Wide Signature Color System for Financial Categories
export const FINANCIAL_COLORS = {
  walletDeposit: '#2E7D32',
  walletDepositLight: '#E8F5E9',
  spent: '#D32F2F',
  spentLight: '#FFEBEE',
  calculatedShare: '#1565C0',
  calculatedShareLight: '#E3F2FD',
  walletLeft: '#F57F17',
  walletLeftLight: '#FFF9C4',
  deficit: '#C62828',
  deficitLight: '#FFEBEE',
};

const lightThemeCache = {
  primary: AppColors.primary,
  primaryDark: AppColors.primaryDark,
  primaryLight: AppColors.primaryLight,
  error: AppColors.error,
  warning: AppColors.warning,
  surface: AppColors.surface,
  background: AppColors.background,
  textPrimary: AppColors.textPrimary,
  textSecondary: AppColors.textSecondary,
  textTertiary: AppColors.textTertiary,
  divider: AppColors.divider,
  cardBg: '#FFFFFF',
  border: '#E9ECEF',
  inputBg: '#F8F9FA',

  financial: {
    walletDeposit: FINANCIAL_COLORS.walletDeposit,
    walletDepositLight: FINANCIAL_COLORS.walletDepositLight,
    spent: FINANCIAL_COLORS.spent,
    spentLight: FINANCIAL_COLORS.spentLight,
    calculatedShare: FINANCIAL_COLORS.calculatedShare,
    calculatedShareLight: FINANCIAL_COLORS.calculatedShareLight,
    walletLeft: FINANCIAL_COLORS.walletLeft,
    walletLeftLight: FINANCIAL_COLORS.walletLeftLight,
    deficit: FINANCIAL_COLORS.deficit,
    deficitLight: FINANCIAL_COLORS.deficitLight,
  }
};

const darkThemeCache = {
  primary: AppColors.primary,
  primaryDark: AppColors.primaryDark,
  primaryLight: '#1B3B2B',
  error: AppColors.error,
  warning: AppColors.warning,
  surface: AppColors.darkSurface,
  background: AppColors.darkBackground,
  textPrimary: '#FFFFFF',
  textSecondary: '#CCCCCC',
  textTertiary: '#999999',
  divider: '#2A2A2A',
  cardBg: '#1E1E1E',
  border: '#333333',
  inputBg: '#262626',

  financial: {
    walletDeposit: '#81C784',
    walletDepositLight: '#1B3B2B',
    spent: '#FF8A80',
    spentLight: '#3E1F1F',
    calculatedShare: '#64B5F6',
    calculatedShareLight: '#1F2E3E',
    walletLeft: '#FFD54F',
    walletLeftLight: '#3E341F',
    deficit: '#FF8A80',
    deficitLight: '#3E1F1F',
  }
};

export const getThemeColors = (darkMode: boolean) => {
  return darkMode ? darkThemeCache : lightThemeCache;
};

export const AppTheme = {
  colors: AppColors,
  fonts: {
    regular: 'Poppins-Regular',
    medium: 'Poppins-Medium',
    bold: 'Poppins-Bold',
  },
};
