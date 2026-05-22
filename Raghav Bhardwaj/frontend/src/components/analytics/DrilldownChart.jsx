import React from 'react'
import ReactECharts from 'echarts-for-react'

export default function DrilldownChart({ option }) {
  const sample = option || { xAxis: { type: 'category', data: ['A','B','C'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [5, 10, 3] }] }
  return <ReactECharts style={{ height: 280 }} option={sample} />
}
