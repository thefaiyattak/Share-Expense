import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { expenseService } from '../../services/expenseService';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle, Rect, Line, Text as SvgText, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import AppDatePickerModal from '../../components/AppDatePickerModal';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental && !(globalThis as any).nativeFabricUIManager && !(globalThis as any).__turboModuleProxy) {
  try {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  } catch (e) {}
}

export default function StatisticsScreen() {
  const { currentAppUser, currency, expenses, members, categoryColors, darkMode } = useStore();
  const [filter, setFilter] = useState('Monthly');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Active Real-Time Firestore Subscription
  React.useEffect(() => {
    if (!currentAppUser) return;
    const teamIdToListen = currentAppUser.teamId || `personal_${currentAppUser.id.split('_')[0]}`;
    const unsub = expenseService.getTeamExpenses(teamIdToListen, (liveExpenses) => {
      useStore.getState().setExpenses(liveExpenses);
    });
    return () => unsub();
  }, [currentAppUser]);
  const [refreshing, setRefreshing] = useState(false);

  // DatePicker state
  const [datePickerMode, setDatePickerMode] = useState<'start' | 'end' | null>(null);
  const [pickerStartDate, setPickerStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [pickerEndDate, setPickerEndDate] = useState<Date>(new Date());

  const handleDateConfirm = (selectedDate: Date) => {
    const mode = datePickerMode;
    setDatePickerMode(null);
    if (!selectedDate) return;
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const formatted = `${year}-${month}-${day}`;

    if (mode === 'start') {
      setPickerStartDate(selectedDate);
      setCustomStart(formatted);
    } else if (mode === 'end') {
      setPickerEndDate(selectedDate);
      setCustomEnd(formatted);
    }
  };

  // Interactive selection state
  const [selectedPieCat, setSelectedPieCat] = useState<string | null>(null);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(320);
  const chartScrollRef = React.useRef<ScrollView>(null);

  // Auto-scroll chart to the end (latest date) when filter or expenses change
  React.useEffect(() => {
    if (expenses.length > 0) {
      setTimeout(() => {
        chartScrollRef.current?.scrollToEnd({ animated: true });
      }, 200);
    }
  }, [filter, expenses.length]);

  const togglePieCat = (cat: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedPieCat(prev => prev === cat ? null : cat);
  };

  const toggleBarIndex = (idx: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedBarIndex(prev => prev === idx ? null : idx);
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors, darkMode);

  const formatAmount = (val: number) => {
    return `${currency} ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(val)}`;
  };

  const parseDate = (val: any): Date => {
    if (!val) return new Date(0);
    if (val instanceof Date) return val;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };

  // User join date restriction logic
  const userJoinDate = React.useMemo(() => {
    if (!currentAppUser?.createdAt) return new Date(0);
    const d = parseDate(currentAppUser.createdAt);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }, [currentAppUser?.createdAt]);

  const userJoinMonthStart = React.useMemo(() => {
    return new Date(userJoinDate.getFullYear(), userJoinDate.getMonth(), 1, 0, 0, 0);
  }, [userJoinDate]);

  // Dynamic filtering logic
  const filteredExpenses = expenses.filter((e) => {
    const expDate = parseDate(e.date);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    if (expDate < userJoinMonthStart) return false;
    if (expDate > todayEnd) return false;
    
    if (filter === 'Daily') {
      return expDate.toDateString() === new Date().toDateString();
    } else if (filter === 'Weekly') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      oneWeekAgo.setHours(0, 0, 0, 0);
      return expDate >= oneWeekAgo;
    } else if (filter === 'Monthly') {
      const now = new Date();
      return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
    } else if (filter === 'Custom') {
      if (!customStart || !customEnd) return true;
      try {
        const start = parseDate(customStart);
        start.setHours(0, 0, 0, 0);
        const end = parseDate(customEnd);
        end.setHours(23, 59, 59, 999);
        return expDate >= start && expDate <= end;
      } catch (err) {
        return true;
      }
    }
    return true;
  });

  // Math for category breakdown
  const categoryTotals: Record<string, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    utility: 0,
  };

  filteredExpenses.forEach((e) => {
    const cat = (e.category || '').toLowerCase();
    if (categoryTotals[cat] !== undefined) {
      categoryTotals[cat] += (Number(e.price) || 0) * (parseFloat(e.quantity) || 1);
    }
  });

  const totalSpent = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  // Render Modern Category Card
  const renderCatCard = (title: string, catKey: string, icon: string, color: string) => {
    const amt = categoryTotals[catKey] || 0;
    const pct = totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0;
    const isSelected = selectedPieCat === catKey;

    return (
      <TouchableOpacity 
        style={[
          styles.catCard, 
          { borderLeftColor: color },
          isSelected && { backgroundColor: color + '14', borderColor: color, borderWidth: 1.5 }
        ]}
        onPress={() => togglePieCat(catKey)}
        activeOpacity={0.7}
      >
        <View style={styles.catCardTopRow}>
          <View style={[styles.catIconCircle, { backgroundColor: color + '1F' }]}>
            <Ionicons name={icon as any} size={18} color={color} />
          </View>
          <View style={[styles.pctBadge, { backgroundColor: color + '1A' }]}>
            <Text style={[styles.pctBadgeText, { color }]}>{pct}%</Text>
          </View>
        </View>
        <Text style={styles.catCardTitle}>{title}</Text>
        <Text style={styles.catCardValue}>{formatAmount(amt)}</Text>
      </TouchableOpacity>
    );
  };

  // Render Modern Donut / Pie Chart
  const renderPieChart = () => {
    if (totalSpent === 0) return null;
    let accumulatedPercent = 0;
    const radius = 38;
    const circumference = 2 * Math.PI * radius;

    const activeCatName = selectedPieCat ? selectedPieCat.toUpperCase() : 'TOTAL';
    const activeCatAmt = selectedPieCat ? (categoryTotals[selectedPieCat] || 0) : totalSpent;

    return (
      <View style={styles.chartCard}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.chartTitle}>Category breakdown</Text>
            <Text style={styles.chartSubHint}>Tap segments or items to inspect</Text>
          </View>
          <View style={styles.headerIconBadge}>
            <Ionicons name="pie-chart" size={16} color={colors.primary} />
          </View>
        </View>
        
        <View style={styles.pieContainer}>
          <View style={{ position: 'relative', width: 140, height: 140, alignItems: 'center', justifyContent: 'center' }}>
            <Svg height="140" width="140" viewBox="0 0 100 100">
              <G transform="rotate(-90, 50, 50)">
                {Object.entries(categoryTotals).map(([cat, amount]) => {
                  const percent = amount / totalSpent;
                  if (percent === 0) return null;

                  const strokeDashoffset = circumference - percent * circumference;
                  const rotation = accumulatedPercent * 360;
                  accumulatedPercent += percent;
                  const color = categoryColors[cat] || colors.textTertiary;
                  const isSelected = selectedPieCat === cat;

                  return (
                    <Circle
                      key={cat}
                      cx="50"
                      cy="50"
                      r={radius}
                      fill="transparent"
                      stroke={color}
                      strokeWidth={isSelected ? "18" : "13"}
                      strokeDasharray={`${circumference} ${circumference}`}
                      strokeDashoffset={strokeDashoffset}
                      transform={`rotate(${rotation}, 50, 50)`}
                      onPress={() => togglePieCat(cat)}
                    />
                  );
                })}
              </G>
            </Svg>

            {/* Donut Center Label */}
            <View style={styles.donutCenterOverlay} pointerEvents="none">
              <Text style={styles.donutCenterLabel}>{activeCatName}</Text>
              <Text style={styles.donutCenterVal} numberOfLines={1}>{formatAmount(activeCatAmt)}</Text>
            </View>
          </View>
        </View>

        {/* Legend with Progress Bars */}
        <View style={styles.legendContainer}>
          {Object.entries(categoryTotals).map(([cat, amount]) => {
            const pct = totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0;
            const color = categoryColors[cat] || colors.textTertiary;
            const isSelected = selectedPieCat === cat;

            return (
              <TouchableOpacity 
                key={cat} 
                style={[styles.legendCardRow, isSelected && { backgroundColor: color + '14', borderColor: color }]}
                onPress={() => togglePieCat(cat)}
              >
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={[styles.legendText, isSelected && { fontWeight: 'bold', color }]}>
                      {cat.toUpperCase()}
                    </Text>
                    <Text style={styles.legendAmtText}>{formatAmount(amount)}</Text>
                  </View>

                  {/* Progress track */}
                  <View style={styles.legendTrack}>
                    <View style={[styles.legendFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                </View>
                <Text style={[styles.legendPct, isSelected && { color }]}>{pct}%</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Helper function for crisp multi-line chart paths
  const createPolylinePath = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return '';
    return pts.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');
  };

  // Render Modern Interactive Multi-Line Chart (Matching Reference)
  const renderLineChart = () => {
    const shortDayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
    const shortMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });

    let daysData: { dayName: string; label: string; dateStr: string; totals: Record<string, number>; dayTotal: number }[] = [];

    const getExpenseTotal = (e: any) => {
      const price = Number(e.price) || 0;
      const qty = parseFloat(e.quantity) || 1;
      return price * qty;
    };

    if (filter === 'Monthly') {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const maxDay = (now.getFullYear() === year && now.getMonth() === month) ? now.getDate() : daysInMonth;

      for (let dayNum = 1; dayNum <= maxDay; dayNum++) {
        const d = new Date(year, month, dayNum);
        const dayName = shortDayFormatter.format(d);
        const label = `${dayNum} ${shortMonthFormatter.format(d)}`;
        const dateStr = d.toDateString();
        const catDayTotals: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, utility: 0 };

        filteredExpenses.forEach((e) => {
          const expDate = parseDate(e.date);
          if (expDate.getFullYear() === d.getFullYear() &&
              expDate.getMonth() === d.getMonth() &&
              expDate.getDate() === d.getDate()) {
            const cat = (e.category || '').toLowerCase();
            if (catDayTotals[cat] !== undefined) {
              catDayTotals[cat] += getExpenseTotal(e);
            }
          }
        });
        const dayTotal = Object.values(catDayTotals).reduce((sum, val) => sum + val, 0);
        daysData.push({ dayName, label, dateStr, totals: catDayTotals, dayTotal });
      }
    } else if (filter === 'Custom' && customStart && customEnd) {
      try {
        const start = parseDate(customStart);
        start.setHours(0, 0, 0, 0);
        const end = parseDate(customEnd);
        end.setHours(23, 59, 59, 999);

        const current = new Date(start);
        while (current <= end) {
          const d = new Date(current);
          const dayName = shortDayFormatter.format(d);
          const label = `${d.getDate()} ${shortMonthFormatter.format(d)}`;
          const dateStr = d.toDateString();
          const catDayTotals: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, utility: 0 };

          filteredExpenses.forEach((e) => {
            const expDate = parseDate(e.date);
            if (expDate.getFullYear() === d.getFullYear() &&
                expDate.getMonth() === d.getMonth() &&
                expDate.getDate() === d.getDate()) {
              const cat = (e.category || '').toLowerCase();
              if (catDayTotals[cat] !== undefined) {
                catDayTotals[cat] += getExpenseTotal(e);
              }
            }
          });
          const dayTotal = Object.values(catDayTotals).reduce((sum, val) => sum + val, 0);
          daysData.push({ dayName, label, dateStr, totals: catDayTotals, dayTotal });
          current.setDate(current.getDate() + 1);
        }
      } catch (e) {}
    }

    if (daysData.length === 0) {
      let targetEnd = new Date();
      if (filteredExpenses.length > 0) {
        const validTimes = filteredExpenses.map(e => parseDate(e.date).getTime()).filter(t => t > 0);
        if (validTimes.length > 0) {
          const latestTime = Math.max(...validTimes);
          const latestDate = new Date(latestTime);
          if (latestDate <= new Date()) {
            targetEnd = latestDate;
          }
        }
      }

      for (let i = 6; i >= 0; i--) {
        const d = new Date(targetEnd);
        d.setDate(targetEnd.getDate() - i);
        const dayName = shortDayFormatter.format(d);
        const label = dayName;
        const dateStr = d.toDateString();
        const catDayTotals: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, utility: 0 };

        filteredExpenses.forEach((e) => {
          const expDate = parseDate(e.date);
          if (expDate.getFullYear() === d.getFullYear() &&
              expDate.getMonth() === d.getMonth() &&
              expDate.getDate() === d.getDate()) {
            const cat = (e.category || '').toLowerCase();
            if (catDayTotals[cat] !== undefined) {
              catDayTotals[cat] += getExpenseTotal(e);
            }
          }
        });
        const dayTotal = Object.values(catDayTotals).reduce((sum, val) => sum + val, 0);
        daysData.push({ dayName, label, dateStr, totals: catDayTotals, dayTotal });
      }
    }

    const categories = [
      { key: 'breakfast', label: 'Breakfast', color: categoryColors.breakfast },
      { key: 'lunch', label: 'Lunch', color: categoryColors.lunch },
      { key: 'dinner', label: 'Dinner', color: categoryColors.dinner },
      { key: 'utility', label: 'Utility', color: categoryColors.utility },
    ];

    const allCatValues = daysData.flatMap(d => categories.map(c => d.totals[c.key] || 0));
    const maxVal = Math.max(...allCatValues, 100);

    const svgWidth = 320;
    const svgHeight = 150;
    const chartTop = 20;
    const chartBottom = 115;
    const chartMaxHeight = chartBottom - chartTop;
    const colStep = svgWidth / Math.max(daysData.length, 1);

    const catPointsMap: Record<string, { x: number; y: number; val: number; idx: number; day: any }[]> = {};
    categories.forEach(c => {
      catPointsMap[c.key] = daysData.map((day, idx) => {
        const val = day.totals[c.key] || 0;
        const x = idx * colStep + colStep / 2;
        const y = chartBottom - (val / maxVal) * chartMaxHeight;
        return { x, y, val, idx, day };
      });
    });

    const chartTitleText = 'Spending by category';

    const activeSelectedIdx = selectedBarIndex;

    const handleChartTouch = (evt: any) => {
      const locX = evt.nativeEvent.locationX;
      const totalW = chartWidth || 320;
      const pct = Math.max(0, Math.min(locX / totalW, 0.999));
      const idx = Math.floor(pct * daysData.length);
      if (idx >= 0 && idx < daysData.length) {
        if (selectedBarIndex !== idx) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSelectedBarIndex(idx);
        }
      }
    };

    return (
      <View style={styles.chartCard}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.chartTitle}>{chartTitleText}</Text>
            <Text style={styles.chartSubHint}>Touch or tap graph to inspect daily breakdown</Text>
          </View>
          <View style={styles.headerIconBadge}>
            <Ionicons name="stats-chart" size={16} color={colors.primary} />
          </View>
        </View>

        {/* Category Legend Pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {categories.map((c) => {
            const isCatSelected = selectedPieCat === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[
                  styles.calloutSubChip,
                  { backgroundColor: c.color + '15', borderColor: c.color, borderWidth: isCatSelected ? 1.5 : 1 }
                ]}
                onPress={() => togglePieCat(c.key)}
              >
                <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                <Text style={[styles.calloutChipText, { color: colors.textPrimary, fontWeight: isCatSelected ? 'bold' : '600' }]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 100% Visible Chart Container with Precise Box Touch Tracking */}
        <View 
          style={{ width: '100%', alignItems: 'center' }}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0) setChartWidth(w);
          }}
          pointerEvents="box-only"
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleChartTouch}
          onResponderMove={handleChartTouch}
        >
          <Svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height={svgHeight}>
            {/* Grid Lines */}
            <Line x1="0" y1="25" x2={svgWidth.toString()} y2="25" stroke={colors.divider} strokeWidth="1" strokeDasharray="4 4" />
            <Line x1="0" y1="65" x2={svgWidth.toString()} y2="65" stroke={colors.divider} strokeWidth="1" strokeDasharray="4 4" />
            <Line x1="0" y1={chartBottom.toString()} x2={svgWidth.toString()} y2={chartBottom.toString()} stroke={colors.divider} strokeWidth="1" />

            {/* Vertical Selection Guide Line - Only Shown when Touched */}
            {activeSelectedIdx !== null && daysData[activeSelectedIdx] && (
              <Line
                x1={(activeSelectedIdx * colStep + colStep / 2).toString()}
                y1="15"
                x2={(activeSelectedIdx * colStep + colStep / 2).toString()}
                y2={chartBottom.toString()}
                stroke={colors.primary}
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            )}

            {/* Category Lines */}
            {categories.map((c) => {
              const pts = catPointsMap[c.key] || [];
              const pathD = createPolylinePath(pts);
              const isSelected = selectedPieCat === c.key;
              const opacity = selectedPieCat === null ? 1 : (isSelected ? 1 : 0.2);
              const strokeW = isSelected ? 3.5 : 2;

              return (
                <G key={c.key} opacity={opacity}>
                  <Path
                    d={pathD}
                    fill="none"
                    stroke={c.color}
                    strokeWidth={strokeW.toString()}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Data Node Dots */}
                  {pts.map((pt) => {
                    const isPointSelected = activeSelectedIdx === pt.idx;

                    return (
                      <G key={pt.idx}>
                        {/* Vertex Circle */}
                        <Circle
                          cx={pt.x.toString()}
                          cy={pt.y.toString()}
                          r={isPointSelected ? "4.5" : "3"}
                          fill={c.color}
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                      </G>
                    );
                  })}
                </G>
              );
            })}

            {/* X-Axis Date Labels Centered Directly Below Each Graph Data Node */}
            {daysData.map((day, idx) => {
              const x = idx * colStep + colStep / 2;
              const isSelected = activeSelectedIdx === idx;
              const dayNum = parseDate(day.dateStr).getDate();
              const dateLabelStr = daysData.length <= 7 ? day.dayName 
                : daysData.length <= 15 ? day.label 
                : `${dayNum}`;

              const fontSize = daysData.length > 20 ? "7" : daysData.length > 10 ? "8.5" : "9.5";

              return (
                <G key={idx}>
                  <SvgText
                    x={x.toString()}
                    y="136"
                    fill={isSelected ? colors.primary : (day.dayTotal > 0 ? colors.textPrimary : colors.textTertiary)}
                    fontSize={fontSize}
                    fontWeight={isSelected ? "bold" : (day.dayTotal > 0 ? "bold" : "600")}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                  >
                    {dateLabelStr}
                  </SvgText>

                  {/* Active Spending Day Indicator Dot */}
                  {day.dayTotal > 0 && !isSelected && (
                    <Circle
                      cx={x.toString()}
                      cy="143"
                      r="1.5"
                      fill={colors.primary}
                    />
                  )}
                </G>
              );
            })}
          </Svg>
        </View>

        {/* Interactive Detail Callout Card - Only Shown when Touched */}
        {activeSelectedIdx !== null && daysData[activeSelectedIdx] && (
          <View style={[styles.interactiveCalloutCard, { borderColor: colors.primary }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.calloutTitle}>
                {daysData[activeSelectedIdx].dayName} ({daysData[activeSelectedIdx].dateStr})
              </Text>
              <Text style={[styles.calloutValue, { color: colors.primary }]}>
                {formatAmount(daysData[activeSelectedIdx].dayTotal)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {categories.map((c) => {
                const amt = daysData[activeSelectedIdx!].totals[c.key] || 0;
                return (
                  <View key={c.key} style={styles.calloutSubChip}>
                    <View style={[styles.legendDot, { backgroundColor: c.color, width: 6, height: 6 }]} />
                    <Text style={styles.calloutChipText}>{c.label.toUpperCase()}: {formatAmount(amt)}</Text>
                  </View>
                );
              })}
            </View>

            {(() => {
              const selectedDayExpenses = filteredExpenses.filter((e) => {
                const expDate = parseDate(e.date);
                return expDate.toDateString() === daysData[activeSelectedIdx!].dateStr;
              });

              if (selectedDayExpenses.length === 0) return null;

              return (
                <View style={styles.calloutItemsContainer}>
                  <View style={styles.calloutDivider} />
                  <Text style={styles.calloutItemsHeader}>
                    Purchased Items ({selectedDayExpenses.length}):
                  </Text>
                  {selectedDayExpenses.map((exp, idx) => {
                    const itemTotal = getExpenseTotal(exp);
                    return (
                      <View 
                        key={exp.id || `stats-item-${idx}`} 
                        style={[styles.calloutItemRow, idx > 0 && styles.calloutItemRowBorder]}
                      >
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.calloutItemName} numberOfLines={1}>
                            {exp.itemName}{exp.quantity && exp.quantity !== '1' ? ` (x${exp.quantity})` : ''}
                          </Text>
                          <Text style={styles.calloutItemBuyer} numberOfLines={1}>
                            Paid by {exp.userName || 'Member'}
                          </Text>
                        </View>
                        <Text style={styles.calloutItemPrice}>{formatAmount(itemTotal)}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView 
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {/* Modern Header */}
        <View style={styles.headerBar}>
          <Text style={styles.screenHeader}>Statistics</Text>
          <View style={styles.headerBadge}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginRight: 5 }} />
            <Text style={styles.headerBadgeText}>REAL-TIME</Text>
          </View>
        </View>

        {/* Tab Filters Pill */}
        <View style={styles.filtersRow}>
          {['Daily', 'Weekly', 'Monthly', 'Custom'].map((f) => {
            const isSelected = filter === f;
            return (
              <TouchableOpacity 
                key={f} 
                style={[styles.filterBtn, isSelected && styles.filterBtnSelected]}
                onPress={() => setFilter(f)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterText, isSelected && styles.filterTextSelected]}>
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom Date Range Picker */}
        {filter === 'Custom' && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={[styles.datePickerCard, customStart ? { borderColor: colors.primary } : null]}
                onPress={() => setDatePickerMode('start')}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <View>
                  <Text style={styles.dateLabelSmall}>FROM DATE</Text>
                  <Text style={styles.dateValText}>
                    {customStart || 'Select Start Date'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.datePickerCard, customEnd ? { borderColor: colors.primary } : null]}
                onPress={() => setDatePickerMode('end')}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <View>
                  <Text style={styles.dateLabelSmall}>TO DATE</Text>
                  <Text style={styles.dateValText}>
                    {customEnd || 'Select End Date'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <AppDatePickerModal
              visible={datePickerMode !== null}
              initialDate={datePickerMode === 'start' ? pickerStartDate : pickerEndDate}
              maximumDate={new Date()}
              onConfirm={handleDateConfirm}
              onCancel={() => setDatePickerMode(null)}
              darkMode={darkMode}
            />
          </View>
        )}

        {/* Total Spent Hero Card */}
        <View style={styles.heroCardHorizontal}>
          <View style={styles.heroIconCircle}>
            <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.heroValueHorizontal}>{formatAmount(totalSpent)}</Text>
            <Text style={styles.heroSubTextHorizontal}>
              {filteredExpenses.length} expense item(s) logged in this range
            </Text>
          </View>

          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{filter} Total</Text>
          </View>
        </View>

        {/* Categories Grid (2x2) */}
        <View style={styles.catGrid}>
          <View style={styles.row}>
            {renderCatCard('Breakfast', 'breakfast', 'cafe-outline', categoryColors.breakfast)}
            <View style={{ width: 10 }} />
            {renderCatCard('Lunch', 'lunch', 'fast-food-outline', categoryColors.lunch)}
          </View>
          <View style={[styles.row, { marginTop: 10 }]}>
            {renderCatCard('Dinner', 'dinner', 'restaurant-outline', categoryColors.dinner)}
            <View style={{ width: 10 }} />
            {renderCatCard('Utilities', 'utility', 'flash-outline', categoryColors.utility)}
          </View>
        </View>

        {/* Pie Chart Card */}
        {renderPieChart()}

        {/* Line Chart Card */}
        {renderLineChart()}

        {/* Member Spending Breakdown */}
        {members.length > 0 && (
          <View style={styles.chartCard}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.chartTitle}>Spending by members</Text>
                <Text style={styles.chartSubHint}>Individual member spending totals</Text>
              </View>
              <View style={styles.headerIconBadge}>
                <Ionicons name="people-outline" size={16} color={colors.primary} />
              </View>
            </View>

            {members.map((m) => {
              const mSpent = filteredExpenses
                .filter((e) => e.userId === m.id)
                .reduce((sum, e) => {
                  const price = Number(e.price) || 0;
                  const quantity = Number(e.quantity) || 0;
                  return sum + (price * quantity);
                }, 0);

              const mPct = totalSpent > 0 ? Math.round((mSpent / totalSpent) * 100) : 0;
              const initials = m.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

              return (
                <View key={m.id} style={styles.memberRowCard}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={styles.memberNameText}>{m.name}</Text>
                      <Text style={styles.memberSpentText}>{formatAmount(mSpent)}</Text>
                    </View>
                    <View style={styles.legendTrack}>
                      <View style={[styles.legendFill, { width: `${mPct}%`, backgroundColor: colors.primary }]} />
                    </View>
                  </View>
                  <Text style={styles.memberPctText}>{mPct}%</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, darkMode: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  screenHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.primaryDark,
  },
  filtersRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  filterBtnSelected: {
    backgroundColor: colors.primary,
    elevation: 2,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  datePickerCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateLabelSmall: {
    fontSize: 9,
    color: colors.textTertiary,
    fontWeight: '700',
  },
  dateValText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 1,
  },
  heroCardHorizontal: {
    backgroundColor: colors.primaryDark || '#1B5E20',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  heroIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  heroBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  heroValueHorizontal: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  heroSubTextHorizontal: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    marginTop: 2,
  },
  catGrid: {
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
  },
  catCard: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3.5,
  },
  catCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  catIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pctBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pctBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  catCardTitle: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 1,
  },
  catCardValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  chartCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  chartSubHint: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pieContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  donutCenterOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
  },
  donutCenterLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.textTertiary,
  },
  donutCenterVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: 2,
  },
  legendContainer: {
    marginTop: 10,
    gap: 8,
  },
  legendCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  legendAmtText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  legendTrack: {
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  legendFill: {
    height: '100%',
    borderRadius: 3,
  },
  legendPct: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginLeft: 6,
    width: 32,
    textAlign: 'right',
  },
  barChartContainer: {
    height: 160,
    justifyContent: 'center',
    marginTop: 6,
  },
  barLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  barLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    fontWeight: '500',
  },
  interactiveCalloutCard: {
    backgroundColor: colors.inputBg,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    borderWidth: 1.5,
  },
  calloutTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  calloutValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  calloutSubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calloutChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary,
    marginLeft: 4,
  },
  calloutItemsContainer: {
    marginTop: 8,
  },
  calloutDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginBottom: 6,
  },
  calloutItemsHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calloutItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  calloutItemRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  calloutItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  calloutItemBuyer: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },
  calloutItemPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  memberRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.primaryDark,
  },
  memberNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberSpentText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.primary,
  },
  memberPctText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textSecondary,
    width: 32,
    textAlign: 'right',
  },
});
