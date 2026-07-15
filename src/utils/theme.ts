export const AppColors = {
  primary: '#4CAF50',
  primaryDark: '#2E7D32',
  primaryLight: '#E8F5E9',
  error: '#E53935',
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

export const getThemeColors = (darkMode: boolean) => {
  return {
    primary: AppColors.primary,
    primaryDark: AppColors.primaryDark,
    primaryLight: darkMode ? '#1B3B2B' : AppColors.primaryLight,
    error: AppColors.error,
    warning: AppColors.warning,
    surface: darkMode ? AppColors.darkSurface : AppColors.surface,
    background: darkMode ? AppColors.darkBackground : AppColors.background,
    textPrimary: darkMode ? AppColors.darkTextPrimary : AppColors.textPrimary,
    textSecondary: darkMode ? AppColors.darkTextSecondary : AppColors.textSecondary,
    textTertiary: darkMode ? '#666666' : AppColors.textTertiary,
    divider: darkMode ? AppColors.darkDivider : AppColors.divider,
    cardBg: darkMode ? '#1E1E1E' : '#FFFFFF',
    border: darkMode ? '#2D2D2D' : '#E9ECEF',
    inputBg: darkMode ? '#2D2D2D' : '#F8F9FA',
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
