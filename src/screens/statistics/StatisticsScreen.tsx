import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle, Rect, Line } from 'react-native-svg';

export default function StatisticsScreen() {
  const { currentAppUser, currency, expenses, categoryColors, darkMode } = useStore();
  const [filter, setFilter] = useState('Weekly');

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  const formatAmount = (val: number) => {
    return `${currency} ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(val)}`;
  };

  // Math for category breakdown
  const categoryTotals: Record<string, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    utility: 0,
  };

  expenses.forEach((e) => {
    if (categoryTotals[e.category] !== undefined) {
      categoryTotals[e.category] += e.price * e.quantity;
    }
  });

  const totalSpent = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  // Render Category Card
  const renderCatCard = (title: string, catKey: string, icon: string, color: string) => {
    const amt = categoryTotals[catKey] || 0;
    return (
      <View style={styles.catCard}>
        <View style={styles.catCardHeader}>
          <Ionicons name={icon as any} size={16} color={color} />
          <Text style={styles.catCardTitle}>{title}</Text>
        </View>
        <Text style={styles.catCardValue}>{formatAmount(amt)}</Text>
      </View>
    );
  };

  // Render SVG Pie Chart
  const renderPieChart = () => {
    if (totalSpent === 0) return null;
    let accumulatedPercent = 0;
    const radius = 35;
    const circumference = 2 * Math.PI * radius;

    return (
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Category breakdown</Text>
        <View style={styles.pieContainer}>
          <Svg height="150" width="150" viewBox="0 0 100 100">
            <G transform="rotate(-90, 50, 50)">
              {Object.entries(categoryTotals).map(([cat, amount], idx) => {
                const percent = amount / totalSpent;
                if (percent === 0) return null;

                const strokeDashoffset = circumference - percent * circumference;
                const rotation = accumulatedPercent * 360;
                accumulatedPercent += percent;
                const color = categoryColors[cat] || colors.textTertiary;

                return (
                  <Circle
                    key={cat}
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke={color}
                    strokeWidth="16"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={strokeDashoffset}
                    transform={`rotate(${rotation}, 50, 50)`}
                  />
                );
              })}
            </G>
          </Svg>
        </View>
        <View style={styles.legendWrap}>
          {Object.entries(categoryTotals).map(([cat, amount]) => {
            const pct = totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0;
            const color = categoryColors[cat] || colors.textTertiary;
            return (
              <View key={cat} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>{cat.toUpperCase()}</Text>
                <Text style={styles.legendPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // Render a mock Bar Chart for Daily Spending using Svg
  const renderBarChart = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const barHeights = [40, 65, 30, 85, 55, 90, 45]; // mock heights in percent

    return (
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Daily spending by category</Text>
        <View style={styles.barChartContainer}>
          <Svg height="140" width="100%">
            {/* Grid Lines */}
            <Line x1="0" y1="20" x2="100%" y2="20" stroke={colors.divider} strokeWidth="1" />
            <Line x1="0" y1="60" x2="100%" y2="60" stroke={colors.divider} strokeWidth="1" />
            <Line x1="0" y1="100" x2="100%" y2="100" stroke={colors.divider} strokeWidth="1" />

            {/* Bars */}
            {days.map((day, idx) => {
              const height = barHeights[idx];
              const xPos = 12 + idx * 13.5; // percent spacing
              return (
                <G key={day}>
                  {/* Stacked single bar mock */}
                  <Rect
                    x={`${xPos}%`}
                    y={`${100 - height}`}
                    width="6%"
                    height={`${height}`}
                    rx="3"
                    fill={colors.primary}
                  />
                </G>
              );
            })}
          </Svg>
          <View style={styles.barLabelsRow}>
            {days.map((day) => (
              <Text key={day} style={styles.barLabel}>{day}</Text>
            ))}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.screenHeader}>Statistics</Text>

        {/* Tab Filters */}
        <View style={styles.filtersRow}>
          {['Daily', 'Weekly', 'Monthly', 'Custom'].map((f) => {
            const isSelected = filter === f;
            return (
              <TouchableOpacity 
                key={f} 
                style={[styles.filterBtn, isSelected && styles.filterBtnSelected]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, isSelected && styles.filterTextSelected]}>
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Total Spent Stat */}
        <View style={styles.totalSpentBox}>
          <Text style={styles.totalSpentVal}>{formatAmount(totalSpent)}</Text>
          <Text style={styles.totalSpentLabel}>Total Spending  |  Target: {formatAmount(30000)}</Text>
        </View>

        {/* Categories Numeric Grid */}
        <View style={styles.catGrid}>
          <View style={styles.row}>
            {renderCatCard('Breakfast', 'breakfast', 'cafe-outline', categoryColors.breakfast)}
            <View style={{ width: 8 }} />
            {renderCatCard('Lunch', 'lunch', 'fast-food-outline', categoryColors.lunch)}
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            {renderCatCard('Dinner', 'dinner', 'restaurant-outline', categoryColors.dinner)}
            <View style={{ width: 8 }} />
            {renderCatCard('Utilities', 'utility', 'flash-outline', categoryColors.utility)}
          </View>
        </View>

        {/* Pie Chart Card */}
        {renderPieChart()}

        {/* Bar Chart Card */}
        {renderBarChart()}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  screenHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  filterBtnSelected: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTextSelected: {
    color: '#FFFFFF',
  },
  totalSpentBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  totalSpentVal: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  totalSpentLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },
  catGrid: {
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
  },
  catCard: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  catCardTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  catCardValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  chartCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  pieContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  legendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginVertical: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: colors.textPrimary,
    marginRight: 4,
  },
  legendPct: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.textSecondary,
  },
  barChartContainer: {
    height: 160,
    justifyContent: 'center',
  },
  barLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  barLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    width: '14.2%',
    textAlign: 'center',
  },
});
