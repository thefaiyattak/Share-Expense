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

export const getThemeColors = (darkMode: boolean) => {
  return {
    primary: AppColors.primary,
    primaryDark: AppColors.primaryDark,
    primaryLight: darkMode ? '#1B3B2B' : AppColors.primaryLight,
    error: AppColors.error,
    warning: AppColors.warning,
    surface: darkMode ? AppColors.darkSurface : AppColors.surface,
    background: darkMode ? AppColors.darkBackground : AppColors.background,
    textPrimary: darkMode ? '#FFFFFF' : AppColors.textPrimary,
    textSecondary: darkMode ? '#CCCCCC' : AppColors.textSecondary,
    textTertiary: darkMode ? '#999999' : AppColors.textTertiary,
    divider: darkMode ? '#2A2A2A' : AppColors.divider,
    cardBg: darkMode ? '#1E1E1E' : '#FFFFFF',
    border: darkMode ? '#333333' : '#E9ECEF',
    inputBg: darkMode ? '#262626' : '#F8F9FA',

    // Dedicated Financial Category Theme Colors
    financial: {
      walletDeposit: darkMode ? '#81C784' : FINANCIAL_COLORS.walletDeposit,
      walletDepositLight: darkMode ? '#1B3B2B' : FINANCIAL_COLORS.walletDepositLight,
      spent: darkMode ? '#FF8A80' : FINANCIAL_COLORS.spent,
      spentLight: darkMode ? '#3E1F1F' : FINANCIAL_COLORS.spentLight,
      calculatedShare: darkMode ? '#64B5F6' : FINANCIAL_COLORS.calculatedShare,
      calculatedShareLight: darkMode ? '#1F2E3E' : FINANCIAL_COLORS.calculatedShareLight,
      walletLeft: darkMode ? '#FFD54F' : FINANCIAL_COLORS.walletLeft,
      walletLeftLight: darkMode ? '#3E341F' : FINANCIAL_COLORS.walletLeftLight,
      deficit: darkMode ? '#FF8A80' : FINANCIAL_COLORS.deficit,
      deficitLight: darkMode ? '#3E1F1F' : FINANCIAL_COLORS.deficitLight,
    }
  };
};

export const AppTheme = {
  colors: AppColors,
  fonts: {
    regular: 'Poppins-Regular',
    medium: 'Poppins-Medium',
    bold: 'Poppins-Bold',
  },
};
