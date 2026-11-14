import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { colors } from '@/constants/theme';

export interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({
  data,
  height = 168,
  color = colors.primary,
  goal = null,
  selectedIndex = null,
  onSelectIndex,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  goal?: number | null;
  selectedIndex?: number | null;
  onSelectIndex?: (index: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const labelHeight = 18;
  const topPadding = 8;
  const baseline = height - labelHeight;
  const plotHeight = baseline - topPadding;
  const maxValue = Math.max(...data.map((entry) => entry.value), goal ?? 0, 1);
  const slot = data.length ? width / data.length : width;
  const barWidth = Math.max(3, Math.min(20, slot * 0.56));
  const labelEvery = data.length <= 14 ? 1 : Math.ceil(data.length / 7);

  return (
    <View style={{ height }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = baseline - plotHeight * fraction;
            return (
              <Line
                key={fraction}
                x1={0}
                x2={width}
                y1={y}
                y2={y}
                stroke={colors.chartGrid}
                strokeWidth={1}
                strokeDasharray={fraction === 1 ? undefined : '3 5'}
              />
            );
          })}

          {goal && goal > 0 ? (
            <Line
              x1={0}
              x2={width}
              y1={baseline - (goal / maxValue) * plotHeight}
              y2={baseline - (goal / maxValue) * plotHeight}
              stroke={colors.warning}
              strokeWidth={1.2}
              strokeDasharray="5 4"
              opacity={0.8}
            />
          ) : null}

          {data.map((entry, index) => {
            const barHeight = Math.max(entry.value > 0 ? 3 : 0, (entry.value / maxValue) * plotHeight);
            const x = slot * index + (slot - barWidth) / 2;
            const selected = selectedIndex === index;
            const fill = entry.value === 0 ? colors.surfaceMuted : selected ? colors.primaryDark : color;
            return (
              <Rect
                key={`${entry.label}-${index}`}
                x={x}
                y={baseline - barHeight}
                width={barWidth}
                height={barHeight}
                rx={Math.min(barWidth / 2, 4)}
                fill={fill}
                opacity={selectedIndex === null || selected ? 1 : 0.55}
                onPress={onSelectIndex ? () => onSelectIndex(index) : undefined}
              />
            );
          })}

          {data.map((entry, index) =>
            index % labelEvery === 0 ? (
              <SvgText
                key={`label-${entry.label}-${index}`}
                x={slot * index + slot / 2}
                y={height - 4}
                fontSize={9}
                fill={colors.textMuted}
                textAnchor="middle"
              >
                {entry.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}

export const chartStyles = StyleSheet.create({});
