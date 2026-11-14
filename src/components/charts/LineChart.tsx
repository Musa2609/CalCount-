import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { colors } from '@/constants/theme';

export interface LinePoint {
  label: string;
  value: number | null;
}

export function LineChart({
  data,
  height = 170,
  color = colors.primary,
  formatValue,
}: {
  data: LinePoint[];
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const labelHeight = 18;
  const paddingX = 6;
  const topPadding = 10;
  const baseline = height - labelHeight;
  const plotHeight = baseline - topPadding;

  const values = data.map((point) => point.value).filter((value): value is number => value !== null);
  const hasData = values.length > 0;
  const rawMin = hasData ? Math.min(...values) : 0;
  const rawMax = hasData ? Math.max(...values) : 1;
  const span = Math.max(0.5, rawMax - rawMin);
  const min = rawMin - span * 0.15;
  const max = rawMax + span * 0.15;
  const plotWidth = Math.max(1, width - paddingX * 2);

  const xFor = (index: number) =>
    data.length <= 1 ? width / 2 : paddingX + (index / (data.length - 1)) * plotWidth;
  const yFor = (value: number) => baseline - ((value - min) / (max - min)) * plotHeight;

  let path = '';
  let segmentOpen = false;
  data.forEach((point, index) => {
    if (point.value === null) {
      segmentOpen = false;
      return;
    }
    const x = xFor(index);
    const y = yFor(point.value);
    path += `${segmentOpen ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `;
    segmentOpen = true;
  });

  const firstIndex = data.findIndex((point) => point.value !== null);
  const lastIndex = data.reduce((found, point, index) => (point.value !== null ? index : found), -1);

  return (
    <View style={{ height }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[0, 0.5, 1].map((fraction) => {
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

          {hasData ? (
            <>
              <Path
                d={path.trim()}
                stroke={color}
                strokeWidth={2.6}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <G>
                {data.map((point, index) =>
                  point.value === null ? null : (
                    <Circle
                      key={`${point.label}-${index}`}
                      cx={xFor(index)}
                      cy={yFor(point.value)}
                      r={data.length > 40 ? 1.8 : 3.2}
                      fill={colors.surface}
                      stroke={color}
                      strokeWidth={2}
                    />
                  ),
                )}
              </G>
              {formatValue ? (
                <SvgText
                  x={width}
                  y={topPadding - 2}
                  fontSize={9}
                  fill={colors.textMuted}
                  textAnchor="end"
                >
                  {formatValue(rawMax)}
                </SvgText>
              ) : null}
            </>
          ) : null}

          {data.length ? (
            <>
              <SvgText x={paddingX} y={height - 4} fontSize={9} fill={colors.textMuted} textAnchor="start">
                {data[0].label}
              </SvgText>
              {data.length > 2 ? (
                <SvgText
                  x={width / 2}
                  y={height - 4}
                  fontSize={9}
                  fill={colors.textMuted}
                  textAnchor="middle"
                >
                  {data[Math.floor(data.length / 2)].label}
                </SvgText>
              ) : null}
              <SvgText x={width - paddingX} y={height - 4} fontSize={9} fill={colors.textMuted} textAnchor="end">
                {data[data.length - 1].label}
              </SvgText>
            </>
          ) : null}

          {hasData && firstIndex >= 0 && lastIndex >= 0 ? (
            <Line
              x1={xFor(firstIndex)}
              x2={xFor(lastIndex)}
              y1={baseline}
              y2={baseline}
              stroke={colors.borderStrong}
              strokeWidth={1}
              opacity={0}
            />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
